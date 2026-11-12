use std::{fs, path::PathBuf};
use tauri::Manager;

pub const HELP_URL: &str =
    "https://github.com/ooberguts/photorequest/blob/main/public/INSTALLATION.txt";

#[tauri::command]
pub fn open_install_help(app: tauri::AppHandle) -> Result<(), String> {
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|p| p.join("INSTALLATION.txt"));
    if let Some(path) = bundled.filter(|p| p.is_file()) {
        if open::that(path).is_ok() {
            return Ok(());
        }
    }
    open::that(HELP_URL).map_err(|_| "The installation guide could not be opened. It is included as INSTALLATION.txt beside the application.".into())
}

fn failure_message(log: Option<&std::path::Path>) -> String {
    let steps = if cfg!(target_os = "windows") {
        "Run the latest PhotoRequest setup again. It includes Microsoft Edge WebView2. Restart Windows if setup requests it. If permissions or company policy block setup, ask your administrator to allow the installation."
    } else {
        "PhotoRequest requires macOS 12.3 or newer. Check Software Update, copy the app into Applications, and try opening it again."
    };
    format!("PhotoRequest could not start. Your saved orders have not been cleared.\n\n{steps}\n\nInstallation help: {HELP_URL}\n\n{}", log.map(|p| format!("Diagnostic details were saved on this computer:\n{}", p.display())).unwrap_or_else(|| "Diagnostic details could not be saved. Check free disk space and folder permissions.".into()))
}

pub fn report_failure(error: &str) {
    let path: PathBuf =
        std::env::temp_dir().join(format!("PhotoRequest-startup-{}.txt", uuid::Uuid::new_v4()));
    let text = format!(
        "PhotoRequest startup failure\nBuild: {}\nCommit: {}\nSystem: {} {}\nError: {error}\n",
        env!("PHOTOREQUEST_BUILD_NUMBER"),
        env!("PHOTOREQUEST_GIT_SHA"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
    let saved = fs::write(&path, text).is_ok();
    rfd::MessageDialog::new()
        .set_title("PhotoRequest could not start")
        .set_level(rfd::MessageLevel::Error)
        .set_description(failure_message(saved.then_some(path.as_path())))
        .show();
}
