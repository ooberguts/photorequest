import type { PDFImage } from 'pdf-lib';
import { loadImage } from './images';
import { packPrints } from './packing';
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
  { id: 'tabloid', label: 'Tabloid', detail: '11 × 17 in', width: 11, height: 17 },
  { id: 'a3', label: 'A3', detail: '297 × 420 mm', width: 297 / 25.4, height: 420 / 25.4 },
  { id: '13x19', label: 'Super B', detail: '13 × 19 in', width: 13, height: 19 },
  { id: '4x6', label: 'Photo 4 × 6', detail: 'Borderless stock', width: 4, height: 6 },
  { id: '5x7', label: 'Photo 5 × 7', detail: 'Borderless stock', width: 5, height: 7 },
  { id: '8x10', label: 'Photo 8 × 10', detail: 'Borderless stock', width: 8, height: 10 },
] as const;
export type PrintSettings = {
  paper: string;
  customWidth: number;
  customHeight: number;
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: number;
  gap: number;
  cropMarks: boolean;
  layout: 'pack' | 'single';
};
export const DEFAULT_PRINT: PrintSettings = {
  paper: 'letter',
  customWidth: 8.5,
  customHeight: 11,
  orientation: 'auto',
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
export type PaperSize = { label: string; width: number; height: number };

export function paperSize(settings: PrintSettings): PaperSize {
  if (settings.paper === 'custom') {
    if (
      ![settings.customWidth, settings.customHeight].every(
        (n) => Number.isFinite(n) && n >= 1 && n <= 60,
      )
    )
      throw new Error(
        'Custom sheet width and height must each be between 1 and 60 inches (25.4–1524 mm).',
      );
    return { label: 'Custom sheet', width: settings.customWidth, height: settings.customHeight };
  }
  const paper = PAPERS.find((p) => p.id === settings.paper);
  if (!paper) throw new Error('Choose a supported paper size.');
  return paper;
}

export function sheetSizeLabel(
  page: Pick<PrintPage, 'width' | 'height'>,
  units: 'in' | 'mm' = 'in',
) {
  const scale = units === 'mm' ? 25.4 : 1;
  return `${Number((page.width * scale).toFixed(units === 'mm' ? 1 : 3))} × ${Number((page.height * scale).toFixed(units === 'mm' ? 1 : 3))} ${units}`;
}

export function pageUsage(page: PrintPage, margin: number) {
  const usable = (page.width - 2 * margin) * (page.height - 2 * margin);
  const used = page.placements.reduce((n, p) => n + p.width * p.height, 0);
  return usable > 0 ? Math.min(100, Math.round((used / usable) * 100)) : 0;
}

export function printGroups(order: Order): PrintGroup[] {
  const groups = new Map<string, PrintGroup>();
  order.photos.forEach((photo, index) =>
    photo.requests.forEach((request) => {
      const key = JSON.stringify([
        request.finish,
        request.finish === 'holographic' ? request.holographicStyle : '',
        ...(request.paper
          ? [
              request.paper.catalogId,
              request.paper.paper.id,
              request.paper.paper.name,
              request.paper.paper.widthInches,
              request.paper.paper.heightInches,
            ]
          : []),
      ]);
      const group = groups.get(key) || {
        key,
        label: request.paper
          ? `${request.paper.paper.name} · ${finishLabel(request)}`
          : finishLabel(request),
        items: [],
      };
      for (let copy = 0; copy < request.quantity; copy++)
        group.items.push({ photo, request, copy: copy + 1, index });
      groups.set(key, group);
    }),
  );
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Preview and PDF output use the same exact-size, paper-aware layout. */
export function layoutGroup(group: PrintGroup, settings: PrintSettings): PrintPage[] {
  const paper = paperSize(settings);
  const stock = group.items[0]?.request.paper?.paper;
  if (
    stock &&
    (Math.abs(
      Math.min(paper.width, paper.height) - Math.min(stock.widthInches, stock.heightInches),
    ) > 0.001 ||
      Math.abs(
        Math.max(paper.width, paper.height) - Math.max(stock.widthInches, stock.heightInches),
      ) > 0.001)
  )
    throw new Error(
      `This batch requests ${stock.name} on ${stock.widthInches} × ${stock.heightInches} in sheets. Select the matching sheet size.`,
    );
  if (
    !Number.isFinite(settings.margin) ||
    settings.margin < 0 ||
    settings.margin > 2 ||
    !Number.isFinite(settings.gap) ||
    settings.gap < 0 ||
    settings.gap > 2
  )
    throw new Error('Margins and spacing must be between 0 and 2 inches.');
  if (!['auto', 'portrait', 'landscape'].includes(settings.orientation))
    throw new Error('Choose a supported page orientation.');
  if (!['pack', 'single'].includes(settings.layout))
    throw new Error('Choose a supported page layout.');
  const small = Math.min(paper.width, paper.height),
    large = Math.max(paper.width, paper.height);
  const orientations =
    settings.orientation === 'auto'
      ? [
          { width: small, height: large },
          { width: large, height: small },
        ]
      : [
          {
            width: settings.orientation === 'portrait' ? small : large,
            height: settings.orientation === 'portrait' ? large : small,
          },
        ];
  const items = group.items.map((data) => ({ data, ...orientedSize(data.photo, data.request) }));
  const usableW = small - 2 * settings.margin,
    usableH = large - 2 * settings.margin;
  const eps = 1e-7;
  for (const item of items) {
    if (
      !Number.isFinite(item.width) ||
      !Number.isFinite(item.height) ||
      item.width <= 0 ||
      item.height <= 0
    )
      throw new Error('Print dimensions must be positive numbers.');
    if (!(
      (item.width <= usableW + eps && item.height <= usableH + eps) ||
      (item.height <= usableW + eps && item.width <= usableH + eps)
    ))
      throw new Error(
        `A ${item.data.request.widthInches} × ${item.data.request.heightInches} in print does not fit on ${paper.label} with these margins. Choose larger paper or reduce the margin.`,
      );
  }
  let best: PrintPage[] | undefined;
  for (const orientation of orientations) {
    const width = orientation.width - 2 * settings.margin,
      height = orientation.height - 2 * settings.margin;
    const packed =
      settings.layout === 'single'
        ? items.map((item) => {
            const rotated = item.width > width + eps || item.height > height + eps;
            const w = rotated ? item.height : item.width,
              h = rotated ? item.width : item.height;
            return {
              placements: [
                {
                  data: item.data,
                  width: w,
                  height: h,
                  rotated,
                  x: (width - w) / 2,
                  y: (height - h) / 2,
                },
              ],
            };
          })
        : packPrints(items, width, height, settings.gap);
    const pages = packed.map((p) => ({
      ...orientation,
      placements: p.placements.map(({ data, ...frame }) => ({
        ...data,
        ...frame,
        x: frame.x + settings.margin,
        y: frame.y + settings.margin,
      })),
    }));
    // Prefer fewer sheets; portrait wins equal results for predictable driver defaults.
    if (!best || pages.length < best.length) best = pages;
  }
  return best || [];
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
