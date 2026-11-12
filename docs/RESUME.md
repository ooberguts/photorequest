# Project checkpoint — November 11, 2026

The requested pause has ended. This checkpoint completes the multi-size cart and fixes signed release publication.

## Current behavior

- One original image can have multiple cart items with independent sizes, quantities, finishes, holographic patterns, and fitting.
- **Review cart** scrolls to the cart. **Add size** opens a new size; editing an item focuses its existing specification. Removing one size keeps the others. Removing the last size asks before removing the image.
- Quantities accept 1–999 copies per item and enforce the 5,000-print order limit. Invalid changes preserve the previous quantity. The specifications dialog also explains the limit before saving.
- Draft recovery and ZIP export preserve all items. The ZIP includes one original payload per image, with each requested size recorded in `order.json`.
- Smart sheet packing, separate paper batches, exact-size PDF output, and required paper confirmation remain available in Print desk.
- Automatic update checks use signed GitHub releases. The app displays the installed commit and commit-count build number, saves the active order before installing, and restarts after an explicitly requested installation.

## Release and local setup

- Private repository: https://github.com/ooberguts/photorequest.
- The publisher finds unpublished drafts through the release list and uses their stable IDs for asset lookup and publication. API errors cannot be mistaken for absent releases. It publishes only after signed packages for Apple Silicon, Intel Mac, and both Windows installer formats are present.
- Pushing `main` runs checks, builds all desktop targets, and publishes a signed commit release. See [UPDATES.md](UPDATES.md) for versioning and authentication.
- The installed Mac app is `/Applications/PhotoRequest.app`. Use its Updates panel to check the installed SHA/build and latest release; those values change with every committed release.
- Updater signing-key backup: `~/Library/Application Support/PhotoRequest/Updater Signing/photorequest.key`, with user-only permissions. GitHub Actions uses `TAURI_SIGNING_PRIVATE_KEY`. Never copy the private key into source control or logs.
- Local Rust toolchain, when needed: `CARGO_HOME=/private/tmp/photorequest-toolchain/cargo`, `RUSTUP_HOME=/private/tmp/photorequest-toolchain/rustup`, and add its `cargo/bin` to PATH.
- Previous installed app backup: `/private/tmp/PhotoRequest-before-updater-e6692d6.app`. Draft storage uses the existing application identity and must be preserved during updates.

## Validation

- Production build, 39 unit tests, 11 browser workflows, schema consistency, and formatting checks passed locally.
- Cart browser coverage includes independent sizes/finishes/copies, correct editor selection, cancellation, recovery, ZIP contents without duplicate originals, item removal, invalid quantities, and the full order limit.
- Release lookup was checked against the existing unpublished GitHub draft. Regression tests cover paginated drafts, missing releases, API errors, and duplicate drafts.
- Existing updater tests check saving before installation and credential isolation. Native signature verification previously accepted the real package and rejected modified bytes.
- Physical printer output and Windows runtime behavior still need testing on the intended machines and printers. CI builds establish installer compilation, not printer-driver acceptance.

Keep interface text functional, without slogans. Railang was invited with write access to collaborate and submit PRs. Do not send messages to collaborators unless requested.
