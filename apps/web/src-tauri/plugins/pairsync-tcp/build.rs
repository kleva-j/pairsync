const COMMANDS: &[&str] = &["connect", "send", "close"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
