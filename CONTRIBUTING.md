# Development notes

Use Node.js 24 LTS and stable Rust. Install the Tauri prerequisites for the host platform, then run `npm ci` and `npm run tauri dev`.

Run `npm run check`, `npm run schema:check`, and the Playwright tests before submitting changes. If the order validator changes, run `npm run schema` and review compatibility. Incompatible portable format changes require a new schema version and an explicit migration path.

The browser and desktop interfaces share the same order, archive, resolution, and PDF code. Keep native file access in the adapter and the Rust command. Native filesystem permissions should remain restricted to user-selected Save paths. Never accept a raw shell command or arbitrary path in the PDF-opening command.

Use the sample order to exercise multiple finishes. Verify source orientation, cropped and fitted images, multiple copies, mixed print sizes, PDF page dimensions, and image frame dimensions. Visually inspect generated PDFs. Check real printer output at 100% scale on macOS and Windows before claiming hardware acceptance.
