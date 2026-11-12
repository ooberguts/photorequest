import { z } from 'zod';

const text = (max = 500) => z.string().trim().max(max).default('');
export const paperSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    finish: z.enum(['matte', 'gloss', 'holographic']),
    holographicStyle: text(100),
    widthInches: z.number().finite().min(1).max(60),
    heightInches: z.number().finite().min(1).max(60),
    costPerSheet: z.number().finite().min(0).max(100000).nullable().default(null),
    available: z.boolean().default(true),
    brand: text(160),
    productCode: text(160),
    description: text(1000),
    weightGsm: z.number().finite().positive().max(2000).nullable().default(null),
    thicknessMicrons: z.number().finite().positive().max(5000).nullable().default(null),
    doubleSided: z.boolean().default(false),
    borderless: z.boolean().default(false),
    printerCompatibility: text(),
    recommendedUse: text(),
    notes: text(1000),
  })
  .superRefine((paper, ctx) => {
    if (paper.finish === 'holographic' && !paper.holographicStyle.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['holographicStyle'],
        message: 'Name the holographic pattern.',
      });
  });
export type Paper = z.infer<typeof paperSchema>;
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, such as USD.')
  .refine((value) => {
    try {
      new Intl.NumberFormat('en', { style: 'currency', currency: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid currency code.');
export const paperCatalogSchema = z
  .object({
    format: z.literal('photorequest-paper-catalog'),
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    printerName: text(160),
    currency: currencySchema,
    updatedAt: z.iso.datetime(),
    papers: z.array(paperSchema).max(250),
  })
  .superRefine((catalog, ctx) => {
    if (new Set(catalog.papers.map((paper) => paper.id)).size !== catalog.papers.length)
      ctx.addIssue({ code: 'custom', path: ['papers'], message: 'Every paper needs a unique ID.' });
  });
export type PaperCatalog = z.infer<typeof paperCatalogSchema>;
export const paperSelectionSchema = z.object({
  catalogId: z.string().min(1).max(100),
  catalogName: z.string().min(1).max(160),
  printerName: text(160),
  currency: currencySchema,
  paper: paperSchema,
});
export type PaperSelection = z.infer<typeof paperSelectionSchema>;
export const CATALOG_KEY = 'photorequest-paper-catalog-v1';
export const MAX_CATALOG_BYTES = 1024 * 1024;
export function catalogIssue(issue: { path: PropertyKey[]; message: string }) {
  const fields: Record<string, string> = {
    name: 'Name',
    printerName: 'Printer name',
    currency: 'Currency code',
    widthInches: 'Sheet width',
    heightInches: 'Sheet height',
    costPerSheet: 'Cost per sheet',
    weightGsm: 'Paper weight',
    thicknessMicrons: 'Paper thickness',
    holographicStyle: 'Holographic pattern',
    format: 'Paper file type',
    schemaVersion: 'Paper file version',
    papers: 'Paper list',
    updatedAt: 'List date',
    id: 'Paper identifier',
  };
  const field = String(issue.path.at(-1) || 'papers');
  const paper =
    issue.path[0] === 'papers' && typeof issue.path[1] === 'number'
      ? `Paper ${issue.path[1] + 1} — `
      : '';
  return `${paper}${fields[field] || 'Paper details'}: ${issue.message}`;
}

export function newCatalog(): PaperCatalog {
  return {
    format: 'photorequest-paper-catalog',
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'My paper list',
    printerName: '',
    currency: 'USD',
    updatedAt: new Date().toISOString(),
    papers: [],
  };
}
export function newPaper(): Paper {
  return paperSchema.parse({
    id: crypto.randomUUID(),
    name: 'New paper',
    finish: 'matte',
    widthInches: 8.5,
    heightInches: 11,
  });
}
export function parseCatalog(json: string): PaperCatalog {
  if (new TextEncoder().encode(json).byteLength > MAX_CATALOG_BYTES)
    throw new Error('Choose a paper list smaller than 1 MB.');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(
      'This file is not valid JSON. Ask the printer to export their paper list again.',
    );
  }
  const parsed = paperCatalogSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `This paper list could not be loaded. ${catalogIssue(issue)} Ask the printer to check and export the list again.`,
    );
  }
  return parsed.data;
}
export function serializeCatalog(catalog: PaperCatalog) {
  return JSON.stringify(paperCatalogSchema.parse(catalog), null, 2) + '\n';
}
export function loadCatalog(): PaperCatalog | null {
  const json = localStorage.getItem(CATALOG_KEY);
  return json ? parseCatalog(json) : null;
}
export function selectPaper(catalog: PaperCatalog, paper: Paper): PaperSelection {
  return paperSelectionSchema.parse({
    catalogId: catalog.id,
    catalogName: catalog.name,
    printerName: catalog.printerName,
    currency: catalog.currency,
    paper,
  });
}
export function fitsPaper(size: { widthInches: number; heightInches: number }, paper: Paper) {
  return (
    Math.min(size.widthInches, size.heightInches) <=
      Math.min(paper.widthInches, paper.heightInches) + 0.0001 &&
    Math.max(size.widthInches, size.heightInches) <=
      Math.max(paper.widthInches, paper.heightInches) + 0.0001
  );
}
export function sheetCost(paper: Paper, currency: string) {
  return paper.costPerSheet === null
    ? 'Cost not supplied'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(paper.costPerSheet) +
        ' / sheet';
}
export function paperNotice(selection: PaperSelection, catalog: PaperCatalog | null) {
  if (!catalog || catalog.id !== selection.catalogId) return '';
  const current = catalog.papers.find((paper) => paper.id === selection.paper.id);
  if (!current || !current.available)
    return 'This paper is no longer listed as available. Check with your printer or choose another paper.';
  if (
    JSON.stringify(current) !== JSON.stringify(selection.paper) ||
    catalog.currency !== selection.currency
  )
    return 'The printer’s paper details have changed. Your saved choice is kept; choose it again to use the new details.';
  return '';
}
