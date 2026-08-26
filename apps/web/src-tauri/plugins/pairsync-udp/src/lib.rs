//! PairSync UDP multicast commands for the Tauri desktop shell.
//!
//! Owns native IPv4 + IPv6 multicast-capable UDP sockets under one logical
//! `socketId`. Inbound datagrams are emitted as `pairsync-udp:message`
//! events with base64 payloads so they survive the JSON IPC boundary.

use std::{
    collections::HashMap,
    io::ErrorKind,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, UdpSocket},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime, State,
};

/// Long enough to amortize wakeups, short enough that `close()` reclaims
/// reader threads promptly.
const RECV_POLL_INTERVAL: Duration = Duration::from_millis(250);

/// Matches the webview encoder (`base64-js`, RFC 4648 standard alphabet).
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
struct RemoteInfo {
    address: String,
    port: u16,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageEvent {
    socket_id: u32,
    data: String,
    remote: RemoteInfo,
}

struct SocketEntry {
    v4: Option<Arc<UdpSocket>>,
    v6: Option<Arc<UdpSocket>>,
    cancel: Arc<AtomicBool>,
}

#[derive(Default)]
struct SocketMap(Mutex<HashMap<u32, SocketEntry>>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pairsync-udp")
        .setup(|app, _api| {
            app.manage(SocketMap::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bind,
            join_group,
            leave_group,
            send,
            close
        ])
        .build()
}

fn configure(sock: UdpSocket) -> Arc<UdpSocket> {
    let _ = sock.set_read_timeout(Some(RECV_POLL_INTERVAL));
    // Same-host peers must hear each other's announcements; PairSync filters
    // its own echo by device id.
    let _ = sock.set_multicast_loop_v4(true);
    Arc::new(sock)
}

fn spawn_reader<R: Runtime>(
    app: &AppHandle<R>,
    socket_id: u32,
    sock: Arc<UdpSocket>,
    cancel: Arc<AtomicBool>,
) {
    let app = app.clone();
    let _ = std::thread::Builder::new()
        .name(format!("pairsync-udp-{socket_id}"))
        .spawn(move || {
            let mut buf = vec![0u8; 65_536];
            while !cancel.load(Ordering::Relaxed) {
                match sock.recv_from(&mut buf) {
                    Ok((n, from)) => {
                        let event = MessageEvent {
                            socket_id,
                            data: encode_b64(&buf[..n]),
                            remote: RemoteInfo {
                                address: from.ip().to_string(),
                                port: from.port(),
                            },
                        };
                        if let Err(err) = app.emit("pairsync-udp:message", event) {
                            log::warn!("failed to emit datagram event: {err}");
                        }
                    }
                    Err(err) => match err.kind() {
                        ErrorKind::WouldBlock
                        | ErrorKind::TimedOut
                        | ErrorKind::Interrupted => continue,
                        _ => {
                            log::debug!("UDP socket #{socket_id} receive loop ending: {err}");
                            break;
                        }
                    },
                }
            }
        });
}

/// Address families we can route a datagram or group membership to.
#[derive(Debug, Clone, Copy)]
enum Family {
    V4,
    V6,
}

impl Family {
    fn of_address(address: &str) -> Self {
        if address.contains(':') {
            Family::V6
        } else {
            Family::V4
        }
    }
}

fn lock_map<'a>(state: &'a State<'_, SocketMap>) -> MutexGuard<'a, HashMap<u32, SocketEntry>> {
    state.0.lock().unwrap()
}

fn socket_for(
    state: &State<'_, SocketMap>,
    socket_id: u32,
    family: &Family,
) -> Result<Arc<UdpSocket>, String> {
    let map = lock_map(state);
    let entry = map
        .get(&socket_id)
        .ok_or_else(|| format!("unknown UDP socket #{socket_id}"))?;
    let sock = match family {
        Family::V4 => entry.v4.as_ref(),
        Family::V6 => entry.v6.as_ref(),
    };
    sock.cloned()
        .ok_or_else(|| format!("UDP socket #{socket_id} has no {family:?} half"))
}

#[tauri::command]
fn bind<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SocketMap>,
    socket_id: u32,
    port: u16,
) -> Result<(), String> {
    let v4 = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, port));
    let v6 = UdpSocket::bind((Ipv6Addr::UNSPECIFIED, port));
    let (v4, v6) = match (v4, v6) {
        (Ok(v4), Ok(v6)) => (Some(v4), Some(v6)),
        (Ok(v4), Err(_)) => (Some(v4), None),
        (Err(_), Ok(v6)) => (None, Some(v6)),
        (Err(e1), Err(e2)) => return Err(format!("failed to bind UDP discovery port {port}: v4={e1}, v6={e2}")),
    };
    let entry = SocketEntry {
        v4: v4.map(configure),
        v6: v6.map(configure),
        cancel: Arc::new(AtomicBool::new(false)),
    };

    // A re-bind of the same id replaces (and cancels) any previous entry.
    if let Some(previous) = lock_map(&state).remove(&socket_id) {
        previous.cancel.store(true, Ordering::Relaxed);
    }

    if let Some(v4) = entry.v4.clone() {
        spawn_reader(&app, socket_id, v4, entry.cancel.clone());
    }
    if let Some(v6) = entry.v6.clone() {
        spawn_reader(&app, socket_id, v6, entry.cancel.clone());
    }

    lock_map(&state).insert(socket_id, entry);
    Ok(())
}

#[tauri::command]
fn join_group(
    state: State<'_, SocketMap>,
    socket_id: u32,
    group: String,
) -> Result<(), String> {
    let family = Family::of_address(&group);
    let sock = socket_for(&state, socket_id, &family)?;
    let result = match (family, group.parse::<IpAddr>()) {
        (Family::V4, Ok(IpAddr::V4(group))) => {
            sock.join_multicast_v4(&group, &Ipv4Addr::UNSPECIFIED)
        }
        (Family::V6, Ok(IpAddr::V6(group))) => sock.join_multicast_v6(&group, 0),
        _ => return Err(format!("invalid multicast group address {group}")),
    };
    result.map_err(|err| format!("failed to join {group}: {err}"))
}

#[tauri::command]
fn leave_group(
    state: State<'_, SocketMap>,
    socket_id: u32,
    group: String,
) -> Result<(), String> {
    let family = Family::of_address(&group);
    let sock = socket_for(&state, socket_id, &family)?;
    let result = match (family, group.parse::<IpAddr>()) {
        (Family::V4, Ok(IpAddr::V4(group))) => {
            sock.leave_multicast_v4(&group, &Ipv4Addr::UNSPECIFIED)
        }
        (Family::V6, Ok(IpAddr::V6(group))) => sock.leave_multicast_v6(&group, 0),
        _ => return Err(format!("invalid multicast group address {group}")),
    };
    result.map_err(|err| format!("failed to leave {group}: {err}"))
}

#[tauri::command]
fn send(
    state: State<'_, SocketMap>,
    socket_id: u32,
    data: String,
    port: u16,
    address: String,
) -> Result<(), String> {
    let bytes = decode_b64(&data)?;
    let family = Family::of_address(&address);
    let sock = socket_for(&state, socket_id, &family)?;
    sock.send_to(&bytes, (address.as_str(), port))
        .map_err(|err| format!("failed to send datagram to {address}:{port}: {err}"))?;
    Ok(())
}

#[tauri::command]
fn close(state: State<'_, SocketMap>, socket_id: u32) -> Result<(), String> {
    if let Some(entry) = lock_map(&state).remove(&socket_id) {
        // Reader threads poll this flag and exit; dropping the entry's Arcs
        // then closes the underlying sockets.
        entry.cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}
