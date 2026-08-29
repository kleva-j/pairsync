const COMMANDS: &[&str] = &["advertise", "unpublish", "browse", "stop_browse", "close"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
