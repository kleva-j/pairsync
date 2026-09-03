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

use pairsync_common::base64::{decode_b64, encode_b64};
use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime, State,
};

/// Per-address TCP connect timeout. The core ConnectionInitiator applies
/// its own 10s deadline across all candidates; this 3s budget lets us try
/// multiple addresses when DNS returns both IPv4 and IPv6.
const PER_ADDRESS_TIMEOUT: Duration = Duration::from_secs(3);

/// Long enough to amortize wakeups, short enough that `close()` reclaims
/// reader threads promptly.
const READ_POLL_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataEvent {
    socket_id: u32,
    data: String,
}

struct ConnectionEntry {
    stream: Option<Arc<Mutex<TcpStream>>>,
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
async fn connect<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ConnectionMap>,
    socket_id: u32,
    host: String,
    port: u16,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(socket_id, ConnectionEntry {
        stream: None,
        cancel: cancel.clone(),
    });

    // DNS resolution in blocking context
    let addrs: Vec<SocketAddr> = tauri::async_runtime::spawn_blocking({
        let host = host.clone();
        move || {
            (host.as_str(), port)
                .to_socket_addrs()
                .map(|iter| iter.collect::<Vec<_>>())
        }
    })
    .await
    .map_err(|_| "task panicked".to_string())?
    .map_err(|err| format!("failed to resolve {host}:{port}: {err}"))?;

    if addrs.is_empty() {
        state.0.lock().unwrap().remove(&socket_id);
        return Err(format!("no addresses resolved for {host}:{port}"));
    }

    // Connection attempts in blocking context
    let (stream, last_err) = tauri::async_runtime::spawn_blocking(move || {
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
        (stream, last_err)
    })
    .await
    .map_err(|_| "task panicked".to_string())?;

    let Some(stream) = stream else {
        state.0.lock().unwrap().remove(&socket_id);
        return Err(last_err);
    };
    let _ = stream.set_nodelay(true);

    if cancel.load(Ordering::Relaxed) {
        state.0.lock().unwrap().remove(&socket_id);
        return Err("connection cancelled".into());
    }

    let reader_stream = stream.try_clone().map_err(|err| err.to_string())?;
    spawn_reader(&app, socket_id, reader_stream, cancel.clone());

    state.0.lock().unwrap().insert(
        socket_id,
        ConnectionEntry {
            stream: Some(Arc::new(Mutex::new(stream))),
            cancel,
        },
    );
    Ok(())
}

#[tauri::command]
async fn send(state: State<'_, ConnectionMap>, socket_id: u32, data: String) -> Result<(), String> {
    let stream_arc = {
        let map = state.0.lock().unwrap();
        let entry = map.get(&socket_id)
            .ok_or_else(|| format!("unknown TCP socket #{socket_id}"))?;
        entry.stream.clone()
            .ok_or_else(|| format!("TCP socket #{socket_id} is not connected"))?
    };

    let decoded = tauri::async_runtime::spawn_blocking({
        let data = data.clone();
        move || {
            decode_b64(&data)
                .map_err(|err| format!("base64 decode failed: {err}"))
        }
    })
    .await
    .map_err(|_| "task panicked".to_string())??;

    tauri::async_runtime::spawn_blocking(move || {
        let mut stream = stream_arc.lock().unwrap();
        stream.write_all(&decoded)
            .map_err(|err| format!("failed to write to TCP socket #{socket_id}: {err}"))
    })
    .await
    .map_err(|_| "task panicked".to_string())??;

    Ok(())
}

#[tauri::command]
fn close(state: State<'_, ConnectionMap>, socket_id: u32) -> Result<(), String> {
    if let Some(entry) = state.0.lock().unwrap().remove(&socket_id) {
        entry.cancel.store(true, Ordering::Relaxed);
        if let Some(stream) = entry.stream {
            let _ = stream.lock().unwrap().shutdown(std::net::Shutdown::Both);
        }
    }
    Ok(())
}
