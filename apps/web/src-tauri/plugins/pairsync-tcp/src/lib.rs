//! PairSync outbound TCP client commands for the Tauri desktop shell.
//!
//! Each connection lives under a logical `socketId`. Inbound bytes are
//! emitted as `pairsync-tcp:data` events with base64 payloads so they
//! survive the JSON IPC boundary.

use std::{
    collections::HashMap,
    io::{ErrorKind, Read, Write},
    net::{SocketAddr, TcpStream, ToSocketAddrs},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime, State,
};

/// Per-attempt connect budget; mirrors the core `CONNECTION_TIMEOUT` intent
/// (the engine applies its own deadline across candidates).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// Long enough to amortize wakeups, short enough that `close()` reclaims
/// reader threads promptly.
const READ_POLL_INTERVAL: Duration = Duration::from_millis(250);

fn encode_b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

fn decode_b64(data: &str) -> Result<Vec<u8>, String> {
    STANDARD
        .decode(data)
        .map_err(|err| format!("invalid base64 payload: {err}"))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataEvent {
    socket_id: u32,
    data: String,
}

struct ConnectionEntry {
    stream: Arc<Mutex<TcpStream>>,
    cancel: Arc<AtomicBool>,
}

#[derive(Default)]
struct ConnectionMap(Mutex<HashMap<u32, ConnectionEntry>>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pairsync-tcp")
        .setup(|app, _api| {
            app.manage(ConnectionMap::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![connect, send, close])
        .build()
}

fn spawn_reader<R: Runtime>(
    app: &AppHandle<R>,
    socket_id: u32,
    stream: TcpStream,
    cancel: Arc<AtomicBool>,
) {
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name(format!("pairsync-tcp-{socket_id}"))
        .spawn(move || {
            let mut stream = stream;
            let _ = stream.set_read_timeout(Some(READ_POLL_INTERVAL));
            let mut buf = vec![0u8; 65_536];
            loop {
                if cancel.load(Ordering::Relaxed) {
                    break;
                }
                match stream.read(&mut buf) {
                    Ok(0) => break, // peer closed
                    Ok(n) => {
                        let event = DataEvent {
                            socket_id,
                            data: encode_b64(&buf[..n]),
                        };
                        if let Err(err) = app.emit("pairsync-tcp:data", event) {
                            log::warn!("failed to emit TCP data event: {err}");
                        }
                    }
                    Err(err) => match err.kind() {
                        ErrorKind::WouldBlock
                        | ErrorKind::TimedOut
                        | ErrorKind::Interrupted => continue,
                        _ => {
                            log::debug!("TCP socket #{socket_id} read loop ending: {err}");
                            break;
                        }
                    },
                }
            }
        });
}

#[tauri::command]
fn connect<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ConnectionMap>,
    socket_id: u32,
    host: String,
    port: u16,
) -> Result<(), String> {
    let addrs: Vec<SocketAddr> = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|err| format!("failed to resolve {host}:{port}: {err}"))?
        .collect();
    if addrs.is_empty() {
        return Err(format!("no addresses resolved for {host}:{port}"));
    }

    const PER_ADDRESS_TIMEOUT: Duration = Duration::from_secs(3);
    let mut last_err = String::from("no address families succeeded");
    let stream = addrs.iter().find_map(|addr| {
        match TcpStream::connect_timeout(addr, PER_ADDRESS_TIMEOUT) {
            Ok(stream) => Some(stream),
            Err(err) => {
                last_err = format!("connect to {addr} failed: {err}");
                None
            }
        }
    });
    let Some(stream) = stream else {
        return Err(last_err);
    };
    let _ = stream.set_nodelay(true);

    // A re-connect of the same id replaces (and cancels) the previous one.
    if let Some(previous) = state.0.lock().unwrap().remove(&socket_id) {
        previous.cancel.store(true, Ordering::Relaxed);
        let _ = previous.stream.lock().unwrap().shutdown(std::net::Shutdown::Both);
    }

    let cancel = Arc::new(AtomicBool::new(false));
    let reader_stream = stream.try_clone().map_err(|err| err.to_string())?;
    spawn_reader(&app, socket_id, reader_stream, cancel.clone());

    state.0.lock().unwrap().insert(
        socket_id,
        ConnectionEntry {
            stream: Arc::new(Mutex::new(stream)),
            cancel,
        },
    );
    Ok(())
}

#[tauri::command]
fn send(state: State<'_, ConnectionMap>, socket_id: u32, data: String) -> Result<(), String> {
    let bytes = decode_b64(&data)?;
    let stream = {
        let map = state.0.lock().unwrap();
        map.get(&socket_id)
            .ok_or_else(|| format!("unknown TCP socket #{socket_id}"))?
            .stream
            .clone()
    };
    let mut stream = stream.lock().unwrap();
    stream
        .write_all(&bytes)
        .map_err(|err| format!("failed to write to TCP socket #{socket_id}: {err}"))?;
    Ok(())
}

#[tauri::command]
fn close(state: State<'_, ConnectionMap>, socket_id: u32) -> Result<(), String> {
    if let Some(entry) = state.0.lock().unwrap().remove(&socket_id) {
        entry.cancel.store(true, Ordering::Relaxed);
        let _ = entry.stream.lock().unwrap().shutdown(std::net::Shutdown::Both);
    }
    Ok(())
}
