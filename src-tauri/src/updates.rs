use serde::Serialize;
use serde_json::Value;
use std::{
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const REPO: &str = "ooberguts/photorequest";
const API: &str = "https://api.github.com/repos/ooberguts/photorequest";
const TOKEN_SERVICE: &str = "com.photorequest.github-updates";

#[derive(Default)]
pub struct UpdateState {
    pending: Mutex<Option<Update>>,
    installing: AtomicBool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    version: String,
    commit: String,
    short_commit: String,
    build_number: u64,
}

#[tauri::command]
pub fn get_build_info(app: tauri::AppHandle) -> BuildInfo {
    let commit = env!("PHOTOREQUEST_GIT_SHA").to_string();
    BuildInfo {
        version: app.package_info().version.to_string(),
        short_commit: commit.chars().take(7).collect(),
        commit,
        build_number: env!("PHOTOREQUEST_BUILD_NUMBER").parse().unwrap_or(0),
    }
}

fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(TOKEN_SERVICE, REPO)
        .map_err(|_| "The system credential store is unavailable.".into())
}

fn credential(app: &tauri::AppHandle) -> (Option<String>, &'static str) {
    if let Ok(entry) = token_entry() {
        if let Ok(token) = entry.get_password() {
            if !token.is_empty() {
                return (Some(token), "saved_token");
            }
        }
    }
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin/gh"),
        PathBuf::from("/usr/local/bin/gh"),
    ];
    if let Ok(home) = app.path().home_dir() {
        paths.insert(0, home.join(".local/bin/gh"));
    }
    paths.push(PathBuf::from("gh"));
    for path in paths {
        let mut command = Command::new(path);
        command.args(["auth", "token", "--hostname", "github.com"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        if let Ok(result) = command.output() {
            if result.status.success() {
                let token = String::from_utf8_lossy(&result.stdout).trim().to_string();
                if !token.is_empty() {
                    return (Some(token), "github_cli");
                }
            }
        }
    }
    (None, "none")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    status: &'static str,
    credential_source: &'static str,
    message: String,
    version: Option<String>,
    commit: Option<String>,
    build_number: Option<u64>,
    notes: Option<String>,
}

fn result(status: &'static str, source: &'static str, message: &str) -> CheckResult {
    CheckResult {
        status,
        credential_source: source,
        message: message.into(),
        version: None,
        commit: None,
        build_number: None,
        notes: None,
    }
}

fn valid_asset_url(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("api.github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url
            .path()
            .strip_prefix("/repos/ooberguts/photorequest/releases/assets/")
            .is_some_and(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
}

#[tauri::command]
pub async fn check_app_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateState>,
) -> Result<CheckResult, String> {
    if state.installing.load(Ordering::SeqCst) {
        return Err("An update is being installed.".into());
    }
    *state
        .pending
        .lock()
        .map_err(|_| "Updater is busy.".to_string())? = None;
    let client = reqwest::Client::builder()
        .user_agent("PhotoRequest updater")
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|_| "Could not initialize update checking.".to_string())?;
    // A public release must work on a clean computer with no GitHub CLI,
    // saved credentials, or keychain prompts. Credentials are only a fallback.
    let mut token = None;
    let mut source = "public";
    let mut repo = client
        .get(API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| "Cannot reach GitHub. Your order remains available offline.".to_string())?;
    if [401, 403, 404].contains(&repo.status().as_u16()) {
        let auth_app = app.clone();
        (token, source) = tauri::async_runtime::spawn_blocking(move || credential(&auth_app))
            .await
            .map_err(|_| "Could not read optional GitHub sign-in.".to_string())?;
        if let Some(ref token) = token {
            repo = client
                .get(API)
                .header("Accept", "application/vnd.github+json")
                .bearer_auth(token)
                .send()
                .await
                .map_err(|_| {
                    "Cannot reach GitHub. Your order remains available offline.".to_string()
                })?;
        }
    }
    if repo.status() == 403
        && repo
            .headers()
            .get("x-ratelimit-remaining")
            .is_some_and(|value| value == "0")
    {
        return Err("GitHub's update-check limit has been reached. Keep working and try again later. No additional software is required.".into());
    }
    let get = |url: String| {
        let request = client
            .get(url)
            .header("Accept", "application/vnd.github+json");
        if let Some(ref token) = token {
            request.bearer_auth(token)
        } else {
            request
        }
    };
    if [401, 403, 404].contains(&repo.status().as_u16()) {
        return Ok(result("auth_required", source, "GitHub could not provide access to this release. Public releases normally need no sign-in. Try again later, or use the optional access settings if the repository has become private."));
    }
    if !repo.status().is_success() {
        return Err(format!(
            "GitHub returned {}. Try checking again later.",
            repo.status().as_u16()
        ));
    }
    let response = get(format!("{API}/releases/latest"))
        .send()
        .await
        .map_err(|_| "Could not retrieve the latest release.".to_string())?;
    if response.status() == 404 {
        return Ok(result(
            "no_release",
            source,
            "No signed update release has been published yet.",
        ));
    }
    if !response.status().is_success() {
        return Err(format!(
            "GitHub returned {} while checking releases.",
            response.status().as_u16()
        ));
    }
    let release: Value = response
        .json()
        .await
        .map_err(|_| "GitHub returned an invalid release.".to_string())?;
    let manifest_id = release["assets"]
        .as_array()
        .and_then(|assets| assets.iter().find(|a| a["name"] == "latest.json"))
        .and_then(|a| a["id"].as_u64());
    let Some(manifest_id) = manifest_id else {
        return Ok(result(
            "no_release",
            source,
            "The latest release does not contain a signed update manifest yet.",
        ));
    };
    let mut builder = app
        .updater_builder()
        .endpoints(vec![format!("{API}/releases/assets/{manifest_id}")
            .parse()
            .map_err(|_| "Invalid update endpoint.".to_string())?])
        .map_err(|_| "Could not configure the update endpoint.".to_string())?
        .timeout(Duration::from_secs(60))
        .header("Accept", "application/octet-stream")
        .map_err(|_| "Could not configure update headers.".to_string())?
        .header("User-Agent", "PhotoRequest updater")
        .map_err(|_| "Could not configure update headers.".to_string())?;
    if let Some(token) = token {
        builder = builder
            .header("Authorization", format!("Bearer {token}"))
            .map_err(|_| "The GitHub credential is invalid.".to_string())?;
    }
    let update = builder.build().map_err(|_| "Could not initialize the signed updater.".to_string())?.check().await
        .map_err(|_| "The update manifest could not be read for this platform. Try again after the release build finishes.".to_string())?;
    let Some(update) = update else {
        *state
            .pending
            .lock()
            .map_err(|_| "Updater is busy.".to_string())? = None;
        return Ok(result(
            "current",
            source,
            "This is the latest published build.",
        ));
    };
    let commit = update.raw_json["commit"].as_str().unwrap_or("");
    let build = update.raw_json["buildNumber"].as_u64();
    if commit.len() != 40
        || !commit.bytes().all(|b| b.is_ascii_hexdigit())
        || build.is_none()
        || !valid_asset_url(&update.download_url)
    {
        return Err(
            "The release has invalid commit metadata or an unexpected download address.".into(),
        );
    }
    let info = CheckResult {
        status: "available",
        credential_source: source,
        message: "A signed update is available.".into(),
        version: Some(update.version.clone()),
        commit: Some(commit.into()),
        build_number: build,
        notes: update.body.clone(),
    };
    *state
        .pending
        .lock()
        .map_err(|_| "Updater is busy.".to_string())? = Some(update);
    Ok(info)
}

#[tauri::command]
pub async fn save_update_token(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let token = token.trim().to_string();
    if token.is_empty() || token.len() > 1000 || token.chars().any(char::is_whitespace) {
        return Err("Enter a valid GitHub access token.".into());
    }
    let client = reqwest::Client::new();
    let response = client
        .get(API)
        .header("User-Agent", "PhotoRequest updater")
        .bearer_auth(&token)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Could not verify the token with GitHub.".to_string())?;
    if !response.status().is_success() {
        return Err("This token cannot read ooberguts/photorequest. Check its repository access and Contents: read permission.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        token_entry()?
            .set_password(&token)
            .map_err(|_| "Could not save the token in the system credential store.".to_string())
    })
    .await
    .map_err(|_| "Could not save the GitHub credential.".to_string())??;
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn forget_update_token(state: tauri::State<'_, UpdateState>) -> Result<(), String> {
    *state
        .pending
        .lock()
        .map_err(|_| "Updater is busy.".to_string())? = None;
    tauri::async_runtime::spawn_blocking(|| match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the saved token.".into()),
    })
    .await
    .map_err(|_| "Could not access the system credential store.".to_string())?
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    stage: &'static str,
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn install_app_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateState>,
    expected_commit: String,
) -> Result<(), String> {
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("An update is already being installed.".into());
    }
    let result = async {
        let update = state.pending.lock().map_err(|_| "Updater is busy.".to_string())?.clone().ok_or_else(|| "Check for updates before installing.".to_string())?;
        if update.raw_json["commit"].as_str() != Some(&expected_commit) || !valid_asset_url(&update.download_url) { return Err("The selected update changed. Check for updates again.".into()); }
        let mut downloaded = 0;
        let bytes = update.download(|chunk, total| { downloaded += chunk as u64; let _ = app.emit("updater-progress", Progress { stage: "downloading", downloaded, total }); }, || {}).await
            .map_err(|_| "Could not download or verify this update. The current app has not been changed.".to_string())?;
        let _ = app.emit("updater-progress", Progress { stage: "installing", downloaded, total: Some(downloaded) });
        update.install(bytes).map_err(|_| "The update could not be installed. Close the app and install the latest release manually.".to_string())?;
        app.restart();
        #[allow(unreachable_code)] Ok(())
    }.await;
    state.installing.store(false, Ordering::SeqCst);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_this_repositories_https_asset_api() {
        assert!(valid_asset_url(
            &format!("{API}/releases/assets/123").parse().unwrap()
        ));
        for url in [
            "https://example.com/update.exe",
            "http://api.github.com/repos/ooberguts/photorequest/releases/assets/123",
            "https://api.github.com/repos/other/repo/releases/assets/123",
            "https://api.github.com/repos/ooberguts/photorequest/releases/assets/123?token=secret",
        ] {
            assert!(!valid_asset_url(&url.parse().unwrap()));
        }
    }
}
