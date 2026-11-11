import type { PDFImage } from 'pdf-lib';
import { loadImage } from './images';
import {
  finishLabel,
  orientedSize,
  validateOrder,
  type Order,
  type Photo,
  type PrintRequest,
} from './model';

export const PAPERS = [
  { id: 'letter', label: 'US Letter', detail: '8.5 × 11 in', width: 8.5, height: 11 },
  { id: 'a4', label: 'A4', detail: '210 × 297 mm', width: 210 / 25.4, height: 297 / 25.4 },
  { id: 'legal', label: 'US Legal', detail: '8.5 × 14 in', width: 8.5, height: 14 },
  { id: 'a3', label: 'A3', detail: '297 × 420 mm', width: 297 / 25.4, height: 420 / 25.4 },
  { id: '13x19', label: 'Super B', detail: '13 × 19 in', width: 13, height: 19 },
  { id: '4x6', label: 'Photo 4 × 6', detail: 'Borderless stock', width: 4, height: 6 },
  { id: '5x7', label: 'Photo 5 × 7', detail: 'Borderless stock', width: 5, height: 7 },
  { id: '8x10', label: 'Photo 8 × 10', detail: 'Borderless stock', width: 8, height: 10 },
] as const;
export type PrintSettings = {
  paper: string;
  margin: number;
  gap: number;
  cropMarks: boolean;
  layout: 'pack' | 'single';
};
export const DEFAULT_PRINT: PrintSettings = {
  paper: 'letter',
  margin: 0.25,
  gap: 0.2,
  cropMarks: true,
  layout: 'pack',
};
export type PrintItem = { photo: Photo; request: PrintRequest; copy: number; index: number };
export type PrintGroup = { key: string; label: string; items: PrintItem[] };
export type Placement = PrintItem & {
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
};
export type PrintPage = { width: number; height: number; placements: Placement[] };

export function printGroups(order: Order): PrintGroup[] {
  const groups = new Map<string, PrintGroup>();
  order.photos.forEach((photo, index) =>
    photo.requests.forEach((request) => {
      const key = JSON.stringify([
        request.finish,
        request.finish === 'holographic' ? request.holographicStyle : '',
      ]);
      const group = groups.get(key) || { key, label: finishLabel(request), items: [] };
      for (let copy = 0; copy < request.quantity; copy++)
        group.items.push({ photo, request, copy: copy + 1, index });
      groups.set(key, group);
    }),
  );
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Exact inch geometry; a deterministic shelf packer never scales a requested print. */
export function layoutGroup(group: PrintGroup, settings: PrintSettings): PrintPage[] {
  const paper = PAPERS.find((p) => p.id === settings.paper);
  if (!paper) throw new Error('Choose a supported paper size.');
  if (
    !Number.isFinite(settings.margin) ||
    settings.margin < 0 ||
    settings.margin > 2 ||
    !Number.isFinite(settings.gap) ||
    settings.gap < 0 ||
    settings.gap > 2
  )
    throw new Error('Margins and spacing must be between 0 and 2 inches.');
  const usableW = paper.width - 2 * settings.margin,
    usableH = paper.height - 2 * settings.margin;
  const pages: PrintPage[] = [];
  const fresh = () => {
    const page: PrintPage = { width: paper.width, height: paper.height, placements: [] };
    pages.push(page);
    return page;
  };
  let page = fresh(),
    x = settings.margin,
    y = settings.margin,
    rowHeight = 0;
  const eps = 0.00001;
  const sorted = [...group.items].sort(
    (a, b) =>
      b.request.widthInches * b.request.heightInches -
      a.request.widthInches * a.request.heightInches,
  );
  for (const item of sorted) {
    const size = orientedSize(item.photo, item.request);
    const candidates = [
      { width: size.width, height: size.height, rotated: false },
      { width: size.height, height: size.width, rotated: true },
    ];
    if (!candidates.some((c) => c.width <= usableW + eps && c.height <= usableH + eps))
      throw new Error(
        `A ${item.request.widthInches} × ${item.request.heightInches} in print does not fit on ${paper.label} with these margins. Choose larger paper or reduce the margin.`,
      );
    if (settings.layout === 'single') {
      if (page.placements.length) page = fresh();
      const c = candidates.find((c) => c.width <= usableW + eps && c.height <= usableH + eps)!;
      page.placements.push({
        ...item,
        ...c,
        x: (paper.width - c.width) / 2,
        y: (paper.height - c.height) / 2,
      });
      continue;
    }
    const fits = () =>
      candidates
        .filter(
          (c) =>
            x + c.width <= paper.width - settings.margin + eps &&
            y + c.height <= paper.height - settings.margin + eps,
        )
        .sort(
          (a, b) =>
            Math.max(rowHeight, a.height) - Math.max(rowHeight, b.height) || a.height - b.height,
        )[0];
    let chosen = fits();
    if (!chosen) {
      x = settings.margin;
      y += rowHeight + settings.gap;
      rowHeight = 0;
      chosen = fits();
    }
    if (!chosen) {
      page = fresh();
      x = settings.margin;
      y = settings.margin;
      rowHeight = 0;
      chosen = fits();
    }
    if (!chosen) throw new Error('Could not place a print on this sheet.');
    page.placements.push({ ...item, ...chosen, x, y });
    x += chosen.width + settings.gap;
    rowHeight = Math.max(rowHeight, chosen.height);
  }
  return pages.filter((p) => p.placements.length);
}

async function normalizedJpeg(photo: Photo): Promise<Uint8Array> {
  const image = await loadImage(photo.url);
  const canvas = document.createElement('canvas');
  canvas.width = photo.width;
  canvas.height = photo.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the image for printing.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not render an image for the PDF.'))),
      'image/jpeg',
      0.98,
    ),
  );
  canvas.width = 0;
  canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

export async function generatePrintPdf(
  order: Order,
  group: PrintGroup,
  settings: PrintSettings,
): Promise<Uint8Array> {
  const {
    PDFDocument,
    rgb,
    pushGraphicsState,
    popGraphicsState,
    rectangle,
    clip,
    endPath,
    concatTransformationMatrix,
  } = await import('pdf-lib');
  validateOrder(order);
  const pages = layoutGroup(group, settings);
  if (!pages.length) throw new Error('This print batch is empty.');
  const doc = await PDFDocument.create();
  doc.setTitle(`${order.name} - ${group.label}`);
  doc.setSubject(`PhotoRequest | ${group.label} | Print at 100% / Actual size`);
  doc.setCreator('PhotoRequest');
  doc.setProducer('PhotoRequest / pdf-lib');
  const embedded = new Map<string, PDFImage>();
  for (const plan of pages) {
    const page = doc.addPage([plan.width * 72, plan.height * 72]);
    for (const p of plan.placements) {
      let image = embedded.get(p.photo.id);
      if (!image) {
        image = await doc.embedJpg(await normalizedJpeg(p.photo));
        embedded.set(p.photo.id, image);
      }
      const px = p.x * 72,
        py = (plan.height - p.y - p.height) * 72;
      const localW = (p.rotated ? p.height : p.width) * 72,
        localH = (p.rotated ? p.width : p.height) * 72;
      const scale = (p.request.fit === 'fill' ? Math.max : Math.min)(
        localW / image.width,
        localH / image.height,
      );
      const w = image.width * scale,
        h = image.height * scale;
      page.pushOperators(
        pushGraphicsState(),
        p.rotated
          ? concatTransformationMatrix(0, 1, -1, 0, px + p.width * 72, py)
          : concatTransformationMatrix(1, 0, 0, 1, px, py),
        rectangle(0, 0, localW, localH),
        clip(),
        endPath(),
      );
      page.drawImage(image, { x: (localW - w) / 2, y: (localH - h) / 2, width: w, height: h });
      page.pushOperators(popGraphicsState());
      if (settings.cropMarks) {
        const left = px,
          right = px + p.width * 72,
          bottom = py,
          top = py + p.height * 72;
        const length = Math.min((settings.gap * 72) / 2, settings.margin * 72, 6),
          offset = 1.5;
        if (length > offset)
          for (const [cx, cy, dx, dy] of [
            [left, bottom, -1, -1],
            [left, top, -1, 1],
            [right, bottom, 1, -1],
            [right, top, 1, 1],
          ]) {
            page.drawLine({
              start: { x: cx + dx * offset, y: cy },
              end: { x: cx + dx * length, y: cy },
              thickness: 0.35,
              color: rgb(0.5, 0.5, 0.5),
            });
            page.drawLine({
              start: { x: cx, y: cy + dy * offset },
              end: { x: cx, y: cy + dy * length },
              thickness: 0.35,
              color: rgb(0.5, 0.5, 0.5),
            });
          }
      }
    }
  }
  return doc.save();
}
