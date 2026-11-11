# GitHub updates and commit versions

The installed application checks signed releases from the private `ooberguts/photorequest` GitHub repository. Photo creation, ZIP import/export, and PDF printing continue to work offline.

## Using updates

Open **Updates** in the sidebar. The panel shows the installed commit ID, commit-count build number, and technical package version. Automatic checking is enabled by default, at startup and every 12 hours; it can be disabled in this panel. A background check only changes the sidebar notification. It never closes an order or installs a release automatically while someone is working.

When a newer signed release is available, choose **Install and restart**. The app saves the current order, downloads and verifies the package, installs it, and restarts. If verification or downloading fails, the existing application remains installed. The printer's finish-confirmation popup is independent of application updates.

The first copy with this updater must be installed manually. Older 0.1/0.2 applications have no update code to fetch it themselves.

## Private GitHub access

Each person must have access to the private repository. The native updater first looks for a token explicitly saved in the operating system credential store. Otherwise, it uses an existing `gh auth login` sign-in from the official GitHub CLI when available.

If GitHub CLI is unavailable, create a fine-grained GitHub token scoped to `ooberguts/photorequest` with **Contents: read**. Save it in the Updates panel. The app validates repository access before saving. macOS uses Keychain; Windows uses Credential Manager. Credentials are never bundled with the application, included in a ZIP, returned by the native updater to the interface, or stored in browser local storage. **Remove saved token** deletes that app-specific entry; a separate GitHub CLI login remains owned by GitHub CLI.

The updater uses authenticated GitHub release-asset API URLs, including for the manifest. A private repository does not require making the source or installers public. Image files and orders are not sent to GitHub.

## Commit-based versions

The interface identifies releases by the short Git commit SHA. Its build number is `git rev-list --count HEAD`. The Tauri command wrapper derives the numeric package version from the major/minor line in `package.json` and that count, for example `0.3.42` for build 42. This keeps versions compatible with macOS and Windows installers and permits the updater's normal newer-version comparison.

The full commit SHA and build count are embedded in the frontend, native application, release metadata, and updater manifest. A working checkout with uncommitted modifications is identified as a local development build. Releases are published only from clean commits on `main`. Complete Git history is required; the included CI checks out the full history. Use `npm run tauri build`, which supplies the matching native version automatically.

Do not rewrite published `main` history. If release ancestry or versioning policy changes, migrate the release version line deliberately. Windows MSI packages constrain the numeric build component to 0–65535; the build helper rejects values outside that range.

## Publishing

The GitHub Actions workflow tests each main commit, builds both Mac architectures and Windows x64, and generates signed updater payloads. After every platform succeeds, the publish job:

1. Creates a draft release named `commit-<count>-<short SHA>` targeting that exact commit.
2. Uploads installers, updater packages, and signatures.
3. Generates `latest.json` containing authenticated asset API addresses for every platform and installer type.
4. Publishes the release only after all assets and the manifest exist and the commit is still the latest `main` commit.

Failed or superseded builds never replace the latest usable release. Pull-request builds do not receive the signing secret and cannot publish releases. Repository collaborators can submit PRs; merging approved changes to `main` produces the next release automatically.

The signing private key is stored as the repository Actions secret **TAURI_SIGNING_PRIVATE_KEY**. Only the public verification key is in `tauri.conf.json`. On the original development Mac, a user-only backup is stored at `~/Library/Application Support/PhotoRequest/Updater Signing/photorequest.key`. Keep that backup private and preserve it: existing installations trust its matching public key. This updater signature is independent of Apple Developer ID signing/notarization and Windows Authenticode signing.

For a signed local build, set `TAURI_SIGNING_PRIVATE_KEY` to that key file path, set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to an empty string for the initial key, and run `npm run tauri build`. Without a signing key, local and PR builds create installers without updater payloads; the installed application still verifies signed future updates.
