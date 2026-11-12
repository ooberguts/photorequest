# Resume checkpoint — November 11, 2026

The user explicitly requested a pause. Resume only when requested.

## Installed application and main branch

- Repository: https://github.com/ooberguts/photorequest (private).
- Latest published source on `main`: `e6692d66e514a0464152d536542d0f92d62f0ef9`, "Add signed GitHub updates and commit-based build versions".
- `/Applications/PhotoRequest.app` was replaced with the verified build from that commit: **build 3 / package version 0.3.3**. The app is open with its Updates panel visible.
- Native UI confirmed commit `e6692d6`, build 3, existing order recovery (three sample images), automatic checking enabled, and private repository access through the user's existing GitHub CLI sign-in.
- Old installed 0.1.0 bundle preserved at `/private/tmp/PhotoRequest-before-updater-e6692d6.app`. Order storage was not removed or moved.
- Updater signing-key backup: `~/Library/Application Support/PhotoRequest/Updater Signing/photorequest.key`, user-only permissions. Repository Actions secret: `TAURI_SIGNING_PRIVATE_KEY`. The secret must not enter source control or tool output.
- Native updater package was verified with its public key; modified bytes were rejected. Its trusted signature metadata contains version `0.3.3`.
- Local native build/toolchain: `CARGO_HOME=/private/tmp/photorequest-toolchain/cargo`, `RUSTUP_HOME=/private/tmp/photorequest-toolchain/rustup`, add its `cargo/bin` to PATH. Signed Mac installer is under `src-tauri/target/release/bundle/dmg/PhotoRequest_0.3.3_aarch64.dmg`.

## Release publication still needs a fix

- Workflow run: https://github.com/ooberguts/photorequest/actions/runs/43122369032.
- Quality checks and **all three signed desktop builds passed**: Apple Silicon, Intel Mac, Windows x64.
- The final **Publish signed commit release** job failed. The release `commit-3-e6692d6` exists as a **draft**; there is no published updater feed yet. The installed app correctly reports no signed update release published.
- Failure: `scripts/release.mjs:144` calls `gh api repos/ooberguts/photorequest/releases/tags/commit-3-e6692d6` after creating/uploading a draft, and GitHub returns HTTP 404. Draft lookup through the by-tag endpoint is unreliable before the tag is published. Inspect the draft through release listing / release ID and fix both the initial idempotency lookup and the lookup after asset upload. Do not create duplicate drafts or publish incomplete platform manifests.
- Investigate/fix this on resume, publish a complete signed release, then verify the installed app's actual check against `latest.json`. A subsequent cart release is an opportunity to exercise an actual in-app upgrade from installed build 3.
- Main's updater checks on startup/every 12 hours and installs with an explicit "Install and restart" action after saving the active order. Private update credentials stay native (OS credential store or existing GitHub CLI sign-in). Numeric package version is major/minor plus Git commit count; SHA and count are shown in the app.

## Cart request in progress

Latest user request: one original image must support multiple requested sizes in an order-side "cart". Multiple sizes already exist in the data model, photo editor, ZIP manifest, and printer grouping. The new UI makes every size/finish a visible cart line without duplicating original files.

Checkpointed implementation (not released or installed):

- New `src/components/OrderCart.tsx`: groups line items by image, displays size/finish/copies/effective DPI, lets users edit quantities, add sizes, edit a specific item, remove a size, or remove an image.
- `src/components/PhotoEditor.tsx`: optional `initialRequestId` focuses a selected cart item; optional `addSize` appends the next unused preset, copying the first request's finish/fitting.
- `src/App.tsx`: renders the cart below the gallery, updates independent quantities with the 5,000-print order limit, removes individual size requests, opens the editor at a cart line, and resets editor mode on save/cancel.
- `src/styles.css`: cart layout and small-window styling.
- Removing the only remaining size routes through the existing photo-removal confirmation, keeping the manifest's minimum-one-request-per-image invariant.
- **`npm run build` passes for the cart checkpoint. No cart-specific tests or visual QA have been completed yet.** Do not describe the cart as finished.

## Next work

1. Inspect the checkpoint diff and finish cart UX/edge cases. Verify direct quantity changes, invalid quantities, total-limit handling, selecting the correct editor row, adding several sizes with different finishes, and removing one size without losing others.
2. Add an end-to-end cart test using several sizes for one image; verify independent copies/finishes, local recovery, ZIP manifest rows, and that only one original image payload is stored per image.
3. Run appropriate checks (`npm run check`, `npm run schema:check`, `npm run format:check`, `PLAYWRIGHT_CHROME=1 npm run test:e2e` on this Mac), inspect the cart visually, and document its use.
4. Fix and verify signed-release publication. Keep WIP cart code off `main` until it is tested; pushing/merging to `main` starts the release workflow.
5. Build/install or use the app's updater for the finished commit, preserving the active order.

## Validation already completed for main's updater

- 37 unit tests, 9 browser workflows (six order/printing plus three updater scenarios), and one Rust updater URL-safety test passed across local checks. The full GitHub quality job also passed.
- Browser tests mock native IPC for updater UX and assert the current order is saved before install. A test race was fixed by waiting for sample-image loading before changing the order's name/notes.
- The previous PDF browser test's immediate `blob:` URL assertion was removed because headless Chromium can download PDFs while leaving the new tab blank; PDF content/geometry and popup acknowledgement remain verified.

The user asked to remove slogans; keep all new interface copy functional. Railang was invited with write access to collaborate and submit PRs. Do not send messages to collaborators unless the user asks.
