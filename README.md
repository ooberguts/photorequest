# PhotoRequest

A Tauri 2 desktop app for creating photo print orders and opening received orders on macOS and Windows. The desktop shell uses Rust; the interface uses React and TypeScript.

## Features

- Follow guided steps to add photos, choose prints, and review/export the order. Switch to **All tools** at any time for the full workspace, without changing the order.
- Load a printer's paper catalog to choose their specific stock and see sheet sizes, costs, availability, weight, and handling notes. Printers can add/edit/remove papers and export/import the same JSON list.
- Add JPEG, PNG, and WebP images through a file picker or drag and drop.
- Configure multiple print sizes per image, custom dimensions in inches or millimeters, and copies per size.
- Review every size and finish as a separate cart item. Change its quantity, edit it, add another size, or remove it without duplicating the original image.
- Choose matte, gloss, or holographic paper. Holographic patterns include Rainbow, Broken glass, Sparkle, Stars, Hearts, and a custom stock name.
- Preview center cropping or fit the entire image inside a print frame.
- Check effective DPI at each requested size, with a configurable quality target and resolution warnings.
- Name an order, add recipient details and print instructions, and export one ZIP.
- Preserve original image bytes in the ZIP while renaming the packaged copies `photo00001.jpg`, `photo00002.png`, etc.
- Include a versioned `order.json` with image metadata, SHA-256 checksums, sizes, copies, finishes, and effective DPI.
- Import and verify an order ZIP, review specifications, and edit or export the order again.
- Auto-arrange mixed print sizes into available spaces, trying multiple packing strategies to reduce sheet count while retaining exact dimensions and cutting gaps.
- Choose standard or custom sheet sizes in inches or millimeters, automatic/portrait/landscape orientation, and multiple prints per sheet or one print per sheet. Preview printable-area usage and sheet savings.
- Keep paper finishes and holographic patterns in separate PDF batches. Confirm the required finish, pattern, sheet size, and matching printer media settings before opening a print job.
- Open batch PDFs in the default PDF viewer to print, or save them separately. Track completed batches locally.
- Recover the current draft locally. Image bytes are stored once in IndexedDB, independently of specification edits.
- Work offline without an account, cloud service, or remote font dependency.
- Check for signed private GitHub releases automatically, display the installed commit/build number, and save the active order before installing and restarting. See [application updates](docs/UPDATES.md) for private repository sign-in and commit versioning.

## Develop

Install [Node.js 24 LTS](https://nodejs.org/), a current stable [Rust toolchain](https://rustup.rs/), and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

- **macOS:** Xcode Command Line Tools (`xcode-select --install`). The app targets macOS 12 or newer.
- **Windows:** Microsoft C++ Build Tools with the **Desktop development with C++** workload, Windows SDK, and Microsoft Edge WebView2.

```sh
npm ci
npm run tauri dev
```

For a browser preview of the same interface:

```sh
npm run dev
```

Open `http://127.0.0.1:1420`. Browser mode downloads ZIP/PDF files normally and opens print PDFs in a separate tab. The desktop app uses a native Save dialog and opens PDFs in the OS default viewer.

## Build desktop installers

On a Mac:

```sh
npm run tauri build -- --bundles app,dmg
```

On Windows:

```powershell
npm run tauri build -- --bundles nsis,msi
```

Builds appear under `src-tauri/target/release/bundle/`. macOS builds use ad-hoc signing; Windows installers are unsigned. For public distribution, configure [macOS signing and notarization](https://v2.tauri.app/distribute/sign/macos/) and [Windows signing](https://v2.tauri.app/distribute/sign/windows/) using your own developer certificates. Replace the macOS `signingIdentity` of `-` when configuring a Developer ID certificate.

The included GitHub Actions workflow runs checks and builds installers for Apple Silicon Macs, Intel Macs, and Windows x64. Successful main builds publish a complete signed GitHub release with an updater manifest. Release names include the exact commit and commit-count build number. PR builds do not receive signing secrets. Download installers from Releases or workflow artifacts. See [update and release configuration](docs/UPDATES.md).

## Request an order

1. In **Add photos**, choose images from your computer or drop them into the upload area. Continue to **Choose prints**.
2. Pick a size, copies, and paper. Load the printer's paper list if supplied, or specify a finish. Check the photos that should receive these choices and apply the settings. Choose **Add another size and keep existing choices** to request several sizes of the same photos.
3. Use **Edit prints & preview** for individual photos, custom sizes, or crop previews. **Review & export** shows every requested size, independent copies, paper, and quality/cropping reminders. Give the order a name and add any instructions.
4. Choose **Export order ZIP**, save the file, and send it to the person printing. Export a new copy after making changes.

**All tools** keeps the complete workspace available for direct cart editing, bulk specifications, ordering/reordering images, and custom dimensions. The view preference is remembered; both views edit the same draft.

## Share a paper catalog

Open **Paper catalog** in the sidebar, or **Manage paper catalog** in Print desk. Add your stocks and sheet sizes, mark availability, enter costs per sheet and useful facts, and **Save paper list**. **Export paper list JSON** creates the file to send to customers. Customers use **Load paper list** or **Load printer’s paper list**; importing previews the list's name, available count, and currency before replacing their current catalog.

Paper selections travel inside the order JSON as snapshots. Removing a paper or changing its price in a later catalog does not rewrite existing orders. Sheet cost is the cost of the physical paper; the app does not present it as the total price of an order. See [paper catalog format and usage](docs/PAPERS.md).

Image numbering follows the gallery order. Use the arrows on image previews to reorder. Removing images causes the next export to use a new contiguous sequence. The original filenames are retained in `order.json`; the files on your disk are not renamed.

## Receive and print an order

1. Choose **Open order ZIP**. The app checks the manifest and verifies the images before replacing an active draft.
2. Open **Print desk** and select a paper batch.
3. Choose a standard or custom sheet size, orientation, margins, and cutting gap. **Auto arrange** tries multiple layouts and fills available spaces without resizing the prints. The preview reports prints per sheet, printable-area usage, and sheets saved against one print per sheet.
4. Load the specified physical paper and choose **Open PDF to print**. Review the required finish, holographic pattern, and sheet size in the paper-confirmation popup. Check the acknowledgement before continuing. **Save batch PDF** exports a file without opening a print job.
5. In the PDF viewer, select the matching paper size and media type. Print at **Actual size / 100%**, **one page per sheet**, **single-sided**, and **one copy**. Requested copies are already expanded into the PDF.
6. Select color settings in the printer driver and mark the batch printed when finished.

The app generates PDF geometry in points (72 points per inch). It does not silently shrink a print to fit a sheet. A print that cannot fit produces an actionable message. Printer nonprintable margins, borderless expansion, and driver scaling can still change a physical print; measure a test print before producing an order.

See [printing details](docs/PRINTING.md) for color handling, borderless printing, and resolution calculations.

## Order format

```text
Example order.zip
├── order.json
├── README.txt
└── images/
    ├── photo00001.jpg
    └── photo00002.png
```

The [format specification](docs/FORMAT.md) and [JSON Schema](schema/order-v1.schema.json) describe the portable v1 format. All physical dimensions in JSON are inches, regardless of the interface's display units. Original image bytes, profiles, and metadata remain intact inside the ZIP, including location metadata if present.

An order supports up to 500 images, 100 MB per image, 80 megapixels per image, 512 MB of originals, and 5,000 total prints. Convert HEIC, TIFF, RAW, and GIF files to a supported format first. The active draft is stored locally; exported ZIPs are the portable backup. Opening another order or starting a new order replaces that active draft after confirmation.

## Checks

```sh
npm run check
npm run schema:check
npx playwright install chromium
npm run test:e2e
```

If Chrome is already installed, `PLAYWRIGHT_CHROME=1 npm run test:e2e` uses an isolated Chrome profile on macOS/Linux. On PowerShell, set `$env:PLAYWRIGHT_CHROME="1"` before running the test command.

Unit tests cover resolution calculations, physical sheet geometry, quantities, finish grouping, archive checksums, schema validation, and unsafe ZIP entries. Packing tests include gap-filling regressions, deterministic layouts, randomized geometry checks, and 5,000-copy orders. Browser tests use actual image files and verify editing, local recovery, ZIP round trips, custom landscape PDF geometry, paper-confirmation acknowledgement/cancellation, mixed formats, bulk operations, and non-fitting print sizes. Native printing and printer driver behavior need testing on actual target machines and hardware.

## Project layout

```text
src/
  components/          Image editor, print desk, and instructions
  lib/model.ts         Order types, validation, sizes, and DPI
  lib/package.ts       ZIP import/export and integrity checks
  lib/images.ts        Image decoding and source metadata
  lib/printing.ts      Physical sheet layout and PDF generation
  lib/packing.ts       Multi-strategy rectangle packing and gap handling
  lib/storage.ts       Local draft and image storage
  lib/files.ts         Browser and Tauri file adapters
src-tauri/             Rust shell, native PDF opening, permissions, icons
schema/                Generated public order JSON Schema
tests/                 Unit and end-to-end workflow tests
.github/workflows/     Cross-platform checks and installer builds
```
