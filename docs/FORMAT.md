# PhotoRequest order format, version 1

A standard ZIP containing exactly one `order.json`, an optional `README.txt`, and referenced image files under `images/`. Directory entries are allowed. Images are not recompressed or modified.

`format` must be `photorequest` and `schemaVersion` must be `1`. The authoritative structural definition is [order-v1.schema.json](../schema/order-v1.schema.json), generated from the application's Zod validator using `npm run schema`.

## Manifest

```json
{
  "format": "photorequest",
  "schemaVersion": 1,
  "order": {
    "id": "019example-order-id",
    "name": "Family prints",
    "customer": "Alex",
    "notes": "Use the listed paper finishes.",
    "targetDpi": 300,
    "createdAt": "2026-11-11T18:00:00.000Z"
  },
  "photos": [
    {
      "id": "photo00001",
      "file": "images/photo00001.jpg",
      "originalName": "family.jpg",
      "sha256": "<64 lowercase hexadecimal characters computed from the exact file bytes>",
      "byteLength": 2345678,
      "width": 1800,
      "height": 1200,
      "sourceDpi": { "x": 72, "y": 72 },
      "colorSpace": "sRGB",
      "mime": "image/jpeg",
      "requests": [
        {
          "id": "a-unique-print-request-id",
          "widthInches": 4,
          "heightInches": 6,
          "quantity": 2,
          "finish": "holographic",
          "holographicStyle": "Broken glass",
          "fit": "fill",
          "effectiveDpi": 300
        }
      ]
    }
  ]
}
```

The example's `sha256` value is explanatory; an actual order must contain a real checksum.

## Field semantics

| Field                         | Meaning                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order.id`                    | Persistent order identifier, generated as a UUID by the app.                                                                                                    |
| `createdAt`                   | UTC ISO 8601 creation timestamp.                                                                                                                                |
| `targetDpi`                   | Integer image resolution target, 72–1200. Default 300. Separate from a printer's hardware dot resolution.                                                       |
| `photo.id`                    | `photo` followed by five digits; exports number images contiguously starting at 00001.                                                                          |
| `file`                        | Relative packaged image path. Basename must match the photo ID. Extension is `jpg`, `png`, or `webp`.                                                           |
| `originalName`                | Source filename for the user's reference. It is never used as an extraction path.                                                                               |
| `sha256`                      | Digest of the exact original image bytes.                                                                                                                       |
| `width`, `height`             | Display-oriented pixel dimensions, including EXIF orientation. Rechecked on import.                                                                             |
| `sourceDpi`                   | Embedded source density if present and interpretable, converted to dots per inch; otherwise `null`. A metadata hint, not a quality guarantee.                   |
| `colorSpace`                  | Source color-space hint. The original embedded profile remains inside the image file.                                                                           |
| `requests`                    | One or more independently configurable sizes and paper finishes for this image.                                                                                 |
| `widthInches`, `heightInches` | Requested print-frame dimensions, each between 0.5 and 60 inches. The long edge follows the source orientation. Millimeters are divided by 25.4 before storage. |
| `quantity`                    | Integer 1–999 for this size/finish combination.                                                                                                                 |
| `finish`                      | `matte`, `gloss`, or `holographic`.                                                                                                                             |
| `holographicStyle`            | Physical holographic paper/pattern name. Required and nonempty for holographic requests; normally empty otherwise.                                              |
| `fit`                         | `fill` uses a center crop. `fit` preserves the entire image with white space inside the frame.                                                                  |
| `effectiveDpi`                | Informational computed resolution for this request. The app recalculates it from decoded pixel dimensions and print geometry.                                   |

The same original image can have several requests, including requests for different finishes. Images and request IDs must be unique within their respective scopes. Import rejects image paths whose basenames do not match their declared IDs.

## Import validation

The app does not extract arbitrary archive entries to the filesystem. It bounds compressed and declared uncompressed sizes, rejects traversal paths and duplicate paths, validates the manifest, checks all referenced image sizes and SHA-256 digests, decodes supported images, and compares actual dimensions and MIME type. Unknown schema versions and unrelated files are rejected. Unreferenced images are rejected.

Checksums detect accidental corruption and mismatched files. They do not authenticate the sender. Limits are 500 images, 100 MB per image, 80 megapixels per image, 512 MB of original bytes per order, and 5,000 requested prints.

Native batch-print progress is local workspace state and is not exported into the portable order. Importing a ZIP starts a new print checklist.
