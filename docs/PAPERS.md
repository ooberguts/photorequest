# Paper catalogs

A printer exports a paper list from **Paper catalog**. Customers import it with **Load paper list**, then choose a specific stock while setting their prints. No one needs to edit JSON by hand.

## Printer workflow

1. Open **Paper catalog**, also accessible through **Manage paper catalog** in Print desk.
2. Set the list name, printer/business name, and three-letter currency code (USD by default).
3. Add one entry for each physical stock and sheet size. Enter its name, finish, sheet width/height, and cost per sheet. A blank cost means unknown, while zero is an explicitly supplied zero cost.
4. For holographic stock, name the actual pattern. Add a customer description and optional brand/product code, weight in gsm, thickness in microns, printable sides, borderless support, printer/ink compatibility, suggested use, and handling notes.
5. Uncheck **Available for new orders** to retain an entry without offering it. Remove an entry to delete it from the edited list. **Save paper list** applies these changes on this computer; unsaved edits remain while navigating within the app but are not a saved backup.
6. **Export paper list JSON** exports the current validated form, including edits. Send the file to customers. Importing another list asks before replacing the saved list.

There are no assumed prices or inventory entries. The printer supplies the facts. Sheet cost describes the paper itself; labor, ink, packing waste, taxes, and the final selling price are not calculated in this customer workflow.

## Customer workflow

Load the JSON supplied by the printer and confirm the name, currency, and available count. Available stocks appear in the paper selector, with their dimensions and sheet costs. Selecting one displays its facts and sets the matching finish/pattern. A stock that is too small is marked and cannot be saved for that print size. Dimensions account for rotation; printer margins are checked later in Print desk.

Customers can still request a generic finish without choosing a stock. An imported catalog does not restrict custom sizes, multiple sizes, bulk editing, or crop/fitting choices.

Each requested print includes an optional `paper` snapshot with catalog ID/name, printer name, currency, and the full stock record. It remains attached through draft recovery and ZIP export/import. Changing or removing a catalog stock never silently changes an existing order. When the current catalog is for the same printer/list, changed or unavailable stock is flagged; editing the print lets the customer explicitly use the latest details or another paper. Loading a different printer's list preserves existing selections rather than reassigning them.

The printer batches different named stocks separately, initializes the matching sheet size, and requires matching stock/sheet information before opening the PDF. Broader printer workflow and pricing improvements are deferred.

## JSON format

The generated [paper catalog JSON Schema](../schema/paper-catalog-v1.schema.json) is produced from the same validator used for import. Files have this structure:

```json
{
  "format": "photorequest-paper-catalog",
  "schemaVersion": 1,
  "id": "printer-paper-list-id",
  "name": "My available papers",
  "printerName": "My print shop",
  "currency": "USD",
  "updatedAt": "2026-11-12T00:00:00Z",
  "papers": [
    {
      "id": "my-matte-letter-stock",
      "name": "My matte stock",
      "finish": "matte",
      "holographicStyle": "",
      "widthInches": 8.5,
      "heightInches": 11,
      "costPerSheet": null,
      "available": true,
      "description": "Replace this example with your own paper facts."
    }
  ]
}
```

Dimensions are always stored in inches, even when entered in millimeters. IDs are stable through editing/export; use a separate stock ID for another size. Optional text fields default to empty strings, numeric facts to null, and printable-side/borderless flags to false. Catalogs support up to 250 distinct stock IDs, sheet dimensions from 1–60 inches, finite nonnegative costs, and a 1 MB JSON file. Invalid files leave the current catalog and order intact.

The order format remains v1 with this optional paper field. Earlier apps can open the core size/finish requests but may discard paper snapshots on re-export. Use a current release on both computers for paper-aware orders. Order JSON is limited to 4 MB; a very large order with lengthy repeated paper notes may need splitting.

## Ordering flow references

The customer path uses explicit steps, shared size/copy controls, per-photo adjustments, and a final review. These patterns were informed by the official [Shutterfly ordering guide](https://support.shutterfly.com/s/article/a-guide-to-ordering-prints) and [Snapfish app ordering guide](https://support.snapfish.com/hc/en-us/articles/226720388-Order-prints-with-the-iPhone-iPad-app), while retaining the existing offline ZIP workflow.
