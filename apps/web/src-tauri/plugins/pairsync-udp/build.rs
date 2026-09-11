const COMMANDS: &[&str] = &[
    "bind",
    "join_group",
    "leave_group",
    "send",
    "close",
    "local_interfaces",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
