//! PairSync mDNS advertise/browse commands for the Tauri desktop shell.
//!
//! Backed by the `mdns-sd` crate. Discovery results are emitted as
//! `pairsync-mdns:service-found` / `pairsync-mdns:service-lost` events so
//! the webview adapter can surface them through the core `MdnsService`
//! contract.

use std::{
    collections::{HashMap, HashSet},
    net::IpAddr,
    sync::Mutex,
};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime, State,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceFoundEvent {
    name: String,
    ipv4: Vec<String>,
    ipv6: Vec<String>,
    port: u16,
    txt: HashMap<String, String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceLostEvent {
    name: String,
}

struct Inner {
    daemon: Option<ServiceDaemon>,
    /// Advertised full names keyed by `(service_type, instance name)`.
    advertised: HashMap<(String, String), String>,
    browse_types: HashSet<String>,
}

impl Default for Inner {
    fn default() -> Self {
        Self {
            daemon: None,
            advertised: HashMap::new(),
            browse_types: HashSet::new(),
        }
    }
}

#[derive(Default)]
struct MdnsState(Mutex<Inner>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("pairsync-mdns")
        .setup(|app, _api| {
            app.manage(MdnsState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            advertise,
            unpublish,
            browse,
            stop_browse,
            close
        ])
        .build()
}

fn daemon_of(inner: &mut Inner) -> Result<&ServiceDaemon, String> {
    if inner.daemon.is_none() {
        let daemon =
            ServiceDaemon::new().map_err(|err| format!("failed to start mDNS daemon: {err}"))?;
        inner.daemon = Some(daemon);
    }
    Ok(inner.daemon.as_ref().expect("daemon populated above"))
}

/// Bare instance name for a fully-qualified `<instance>.<type>` record.
fn instance_name(fullname: &str, service_type: &str) -> String {
    fullname
        .strip_suffix(&format!(".{service_type}"))
        .unwrap_or(fullname)
        .to_string()
}

fn split_addresses(addresses: &std::collections::HashSet<mdns_sd::ScopedIp>) -> (Vec<String>, Vec<String>) {
    let mut ipv4 = Vec::new();
    let mut ipv6 = Vec::new();
    for scoped in addresses {
        match scoped.to_ip_addr() {
            IpAddr::V4(addr) => ipv4.push(addr.to_string()),
            IpAddr::V6(addr) => ipv6.push(addr.to_string()),
        }
    }
    (ipv4, ipv6)
}

fn txt_map(info: &mdns_sd::ResolvedService) -> HashMap<String, String> {
    info.get_properties()
        .iter()
        .map(|prop| (prop.key().to_string(), prop.val_str().to_string()))
        .collect()
}

#[tauri::command]
fn advertise(
    state: State<'_, MdnsState>,
    service_type: String,
    name: String,
    port: u16,
    txt: HashMap<String, String>,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    let daemon = daemon_of(&mut inner)?;

    // With addr-auto the daemon fills in real interface addresses at
    // runtime; the placeholder IP is required by the API but unused.
    let host = format!("{}.local.", name.replace(' ', "-").to_lowercase());
    let info = ServiceInfo::new(&service_type, &name, &host, "0.0.0.0", port, txt)
        .map_err(|err| format!("invalid mDNS service info: {err}"))?
        .enable_addr_auto();

    daemon
        .register(info)
        .map_err(|err| format!("failed to register mDNS service: {err}"))?;

    let fullname = format!("{name}.{service_type}");
    inner.advertised.insert((service_type.clone(), name), fullname);
    Ok(())
}

#[tauri::command]
fn unpublish(
    state: State<'_, MdnsState>,
    service_type: String,
    name: String,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    let Some(fullname) = inner.advertised.remove(&(service_type.clone(), name)) else {
        return Ok(()); // nothing advertised under this service_type/name pair
    };
    let Some(daemon) = &inner.daemon else {
        return Ok(());
    };
    if let Err(err) = daemon.unregister(&fullname) {
        log::warn!("mDNS unregister of {fullname} failed: {err}");
    }
    Ok(())
}

#[tauri::command]
fn browse<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, MdnsState>,
    service_type: String,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    let daemon = daemon_of(&mut inner)?;
    let receiver = daemon
        .browse(&service_type)
        .map_err(|err| format!("failed to browse {service_type}: {err}"))?;
    inner.browse_types.insert(service_type.clone());
    drop(inner);

    std::thread::Builder::new()
        .name(format!("pairsync-mdns-browse"))
        .spawn(move || {
            while let Ok(event) = receiver.recv() {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        let fullname = info.get_fullname().to_string();
                        let (ipv4, ipv6) = split_addresses(info.get_addresses());
                        let found = ServiceFoundEvent {
                            name: instance_name(&fullname, &service_type),
                            ipv4,
                            ipv6,
                            port: info.get_port(),
                            txt: txt_map(&info),
                        };
                        if let Err(err) = app.emit("pairsync-mdns:service-found", found) {
                            log::warn!("failed to emit service-found: {err}");
                        }
                    }
                    ServiceEvent::ServiceRemoved(ty, fullname) => {
                        let lost = ServiceLostEvent {
                            name: instance_name(&fullname, &ty),
                        };
                        if let Err(err) = app.emit("pairsync-mdns:service-lost", lost) {
                            log::warn!("failed to emit service-lost: {err}");
                        }
                    }
                    ServiceEvent::SearchStopped(_) => break,
                    _ => {}
                }
            }
        })
        .map_err(|err| format!("failed to spawn browse thread: {err}"))?;
    Ok(())
}

#[tauri::command]
fn stop_browse(state: State<'_, MdnsState>) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    let types: Vec<String> = inner.browse_types.drain().collect();
    if let Some(daemon) = &inner.daemon {
        for ty in types {
            if let Err(err) = daemon.stop_browse(&ty) {
                log::warn!("mDNS stop_browse({ty}) failed: {err}");
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn close(state: State<'_, MdnsState>) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    let types: Vec<String> = inner.browse_types.drain().collect();
    if let Some(daemon) = &inner.daemon {
        for ty in types {
            if let Err(err) = daemon.stop_browse(&ty) {
                log::warn!("mDNS stop_browse({ty}) failed: {err}");
            }
        }
        for fullname in inner.advertised.values() {
            if let Err(err) = daemon.unregister(fullname) {
                log::warn!("mDNS unregister of {fullname} failed: {err}");
            }
        }
    }
    inner.advertised.clear();
    Ok(())
}
