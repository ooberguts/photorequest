# Printing

## Physical dimensions

PDF pages and print frames are defined in points: 72 points equals one inch. Print requests are never automatically scaled down to fit a sheet. Choose an appropriate paper size or smaller margins if a frame does not fit.

Supported sheets include Letter, A4, Legal, Tabloid, A3, 13×19-inch Super B, and 4×6, 5×7, and 8×10 photo stock. Custom sheets accept dimensions in inches or millimeters, from 1 to 60 inches per edge. Select automatic, portrait, or landscape orientation. The same final geometry is used for the preview and PDF.

**Auto arrange** tries multiple item orders and rectangle-packing heuristics. It fills free spaces around large prints, revisits earlier sheets for smaller prints, and rotates frames 90 degrees when useful. It retains a row-based candidate, choosing a result with no more sheets than the previous row layout. The automatic orientation option compares both sheet orientations and chooses the result with fewer pages, preferring portrait on a tie. Large orders use a bounded number of strategies to keep the interface responsive. This is a heuristic search; it does not guarantee the mathematical optimum for every mixture of sizes.

Margins are kept clear and the specified gap is reserved between print frames, with no extra gap required at the sheet edges. Printable-area usage measures the combined area of print frames as a percentage of the area inside the margins; it is not an ink-coverage estimate. The savings comparison uses one print per sheet as the baseline. **One print per sheet** remains available and centers each requested copy on its own sheet.

Prints are grouped by finish and, for holographic paper, by pattern name. Load the corresponding stock for each batch. Pattern names describe materials; the application does not create simulated holographic pixels.

## Printer settings

Every **Open PDF to print** action first displays a paper-confirmation popup. It lists the required finish, holographic pattern when applicable, actual sheet size and orientation, sheet count, and print count. The operator must acknowledge checking the loaded stock and using matching printer paper settings. Cancelling does not generate or open a print PDF; the acknowledgement resets before the next print action. Saving a PDF is an export action and does not require this popup.

This confirmation is an operator check. The application cannot inspect a printer's loaded paper or enforce settings in an external PDF viewer. The reminder explicitly tells the operator to select matching paper size and media type in the viewer's print dialog.

Use **Actual size / 100%**, one PDF page per physical sheet, single-sided, and one copy. All requested copies are already included in the PDF pages. Disable “Fit to page,” “Shrink oversized pages,” and automatic scaling.

Set media type, output quality, printer hardware DPI, paper tray, and color controls in the PDF viewer's print dialog or printer driver. The app does not enumerate printers, send raw spool jobs, or apply device-specific media settings. Opening a PDF uses the default PDF viewer on macOS or Windows. Saving a PDF is available if no viewer is registered.

Most printers cannot print to the edge. Keep margins at least as large as your printer's nonprintable area. For borderless photo stock, choose zero margins, disable cut guides if unneeded, and turn off any driver “borderless expansion” or overscan. Print and measure a test sheet before a full run.

## Image orientation and fitting

The long print dimension follows the source image's orientation. An EXIF-rotated JPEG is decoded in its display orientation. The preview and PDF both use that orientation. In the sheet packer, a frame may be rotated to use the available paper.

“Fill & crop” centers the photo and crops it to fill the requested rectangle. “Fit whole image” centers the entire photo inside the rectangle and leaves white space when the aspect ratios differ. Custom focal-point positioning and bleed are not part of version 1.

## Resolution

The interface calls effective image PPI “DPI” to match common print-order terminology. It is separate from a printer's dot resolution. For a print frame oriented to the image:

```text
fill (center crop): min(pixel width / print width, pixel height / print height)
fit (whole image):  max(pixel width / print width, pixel height / print height)
```

The result is rounded down. A 1800×1200-pixel image at 6×4 inches has 300 effective DPI. The same image cropped to 6×6 inches has 200 effective DPI. Fitting the entire image inside that 6×6 frame yields a 6×4 image at 300 DPI, with white space above and below.

At or above the target is marked ready. Below target but at least 150 DPI is a review warning; below 150 DPI is a low-resolution warning. If the target is lower than 150, that lower threshold applies. The application never claims that increasing the source DPI tag creates detail.

## Color and output encoding

The ZIP preserves original image bytes, including source profiles and metadata. Print PDFs use the system webview's image decoder and canvas color pipeline, flatten transparency onto white, and encode a print copy as high-quality JPEG without increasing its source pixel dimensions. This makes JPEG, PNG, and WebP printable with consistent orientation, but the PDF is not a lossless or ICC-preserving reproduction of every input.

PDFs are intended for convenient consumer printing. For a production workflow requiring controlled ICC conversion, CMYK output, soft proofing, PDF/X, or lossless archival output, use the packaged originals and manifest in the appropriate professional print software. No ICC-profile selection is exposed in this version.

## Progress and recovery

Mark a paper batch printed after it finishes. This is an operator checklist; the app cannot determine whether a physical printer completed a job. Changing image specifications resets completion flags. Exported orders do not carry completion flags.

The active draft is saved locally in IndexedDB. Check the save status before closing the window. The native PDF-opening command writes only PDF bytes to the application's own cache and removes print PDFs older than seven days when opening another print file. ZIP backups are independent of that cache.
