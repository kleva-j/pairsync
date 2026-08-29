const COMMANDS: &[&str] = &["bind", "join_group", "leave_group", "send", "close"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
