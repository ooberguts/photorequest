use std::fs;
use tauri::{ipc::{InvokeBody, Request}, Manager};

/// Only accepts PDF bytes, never a caller-provided path or shell command.
#[tauri::command]
fn open_print_pdf(app: tauri::AppHandle, request: Request<'_>) -> Result<(), String> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        _ => return Err("Expected binary PDF data.".into()),
    };
    if !bytes.starts_with(b"%PDF-") || bytes.len() > 256 * 1024 * 1024 {
        return Err("Invalid PDF or print file exceeds 256 MB. Save the PDF instead.".into());
    }
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("print-jobs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Remove only old PDFs in this application's own cache.
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let old = entry.metadata().ok().and_then(|m| m.modified().ok())
                .and_then(|t| t.elapsed().ok()).is_some_and(|age| age.as_secs() > 7 * 24 * 60 * 60);
            if old && path.extension().is_some_and(|ext| ext == "pdf") { let _ = fs::remove_file(path); }
        }
    }
    let path = dir.join(format!("photorequest-{}.pdf", uuid::Uuid::new_v4()));
    fs::write(&path, bytes).map_err(|e| format!("Could not create the print PDF: {e}"))?;
    open::that(&path).map_err(|e| format!("Could not open a PDF viewer: {e}. Use Save batch PDF instead."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![open_print_pdf])
        .run(tauri::generate_context!())
        .expect("error while running PhotoRequest");
}
