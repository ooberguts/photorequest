import { z } from 'zod';

export const LIMITS = {
  photos: 500,
  fileBytes: 100 * 1024 * 1024,
  orderBytes: 512 * 1024 * 1024,
  pixels: 80_000_000,
  prints: 5000,
};
export const SIZES = [
  { label: '4 × 6', width: 4, height: 6 },
  { label: '5 × 7', width: 5, height: 7 },
  { label: '8 × 10', width: 8, height: 10 },
  { label: '8 × 12', width: 8, height: 12 },
  { label: '11 × 14', width: 11, height: 14 },
  { label: '12 × 18', width: 12, height: 18 },
  { label: '4 × 4', width: 4, height: 4 },
  { label: '5 × 5', width: 5, height: 5 },
] as const;
export const HOLOGRAPHIC = ['Rainbow', 'Broken glass', 'Sparkle', 'Stars', 'Hearts', 'Custom'];
export const requestSchema = z
  .object({
    id: z.string().min(1).max(100),
    widthInches: z.number().finite().min(0.5).max(60),
    heightInches: z.number().finite().min(0.5).max(60),
    quantity: z.number().int().min(1).max(999),
    finish: z.enum(['matte', 'gloss', 'holographic']),
    holographicStyle: z.string().max(100),
    fit: z.enum(['fill', 'fit']),
  })
  .superRefine((r, ctx) => {
    if (r.finish === 'holographic' && !r.holographicStyle.trim())
      ctx.addIssue({ code: 'custom', message: 'Choose a holographic pattern.' });
  });
export type PrintRequest = z.infer<typeof requestSchema>;
export type ImageMetadata = {
  width: number;
  height: number;
  sourceDpi: { x: number; y: number } | null;
  colorSpace: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
};
export type Photo = ImageMetadata & {
  id: string;
  originalName: string;
  data: Uint8Array;
  url: string;
  sha256: string;
  requests: PrintRequest[];
};
export type Order = {
  id: string;
  name: string;
  customer: string;
  notes: string;
  targetDpi: number;
  createdAt: string;
  photos: Photo[];
};

export const manifestSchema = z.object({
  format: z.literal('photorequest'),
  schemaVersion: z.literal(1),
  order: z.object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    customer: z.string().max(200),
    notes: z.string().max(5000),
    targetDpi: z.number().int().min(72).max(1200),
    createdAt: z.iso.datetime(),
  }),
  photos: z
    .array(
      z.object({
        id: z.string().regex(/^photo\d{5}$/),
        file: z.string().regex(/^images\/photo\d{5}\.(jpg|png|webp)$/),
        originalName: z.string().min(1).max(255),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        byteLength: z.number().int().positive().max(LIMITS.fileBytes),
        width: z.number().int().positive().max(80_000),
        height: z.number().int().positive().max(80_000),
        sourceDpi: z.object({ x: z.number().positive(), y: z.number().positive() }).nullable(),
        colorSpace: z.string().max(200),
        mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        requests: z
          .array(requestSchema.safeExtend({ effectiveDpi: z.number().int().nonnegative() }))
          .min(1)
          .max(100),
      }),
    )
    .min(1)
    .max(LIMITS.photos),
});
export type Manifest = z.infer<typeof manifestSchema>;

export function newOrder(): Order {
  return {
    id: crypto.randomUUID(),
    name: 'Untitled order',
    customer: '',
    notes: '',
    targetDpi: 300,
    createdAt: new Date().toISOString(),
    photos: [],
  };
}
export function newRequest(): PrintRequest {
  return {
    id: crypto.randomUUID(),
    widthInches: 4,
    heightInches: 6,
    quantity: 1,
    finish: 'matte',
    holographicStyle: '',
    fit: 'fill',
  };
}
export function photoName(index: number) {
  return `photo${String(index + 1).padStart(5, '0')}`;
}
export function orientedSize(photo: Pick<ImageMetadata, 'width' | 'height'>, req: PrintRequest) {
  const landscape = photo.width > photo.height;
  const [small, large] = [
    Math.min(req.widthInches, req.heightInches),
    Math.max(req.widthInches, req.heightInches),
  ];
  return { width: landscape ? large : small, height: landscape ? small : large };
}
export function effectiveDpi(photo: Pick<ImageMetadata, 'width' | 'height'>, req: PrintRequest) {
  const { width, height } = orientedSize(photo, req);
  return Math.floor(
    (req.fit === 'fill' ? Math.min : Math.max)(photo.width / width, photo.height / height),
  );
}
export function quality(dpi: number, target: number): 'good' | 'fair' | 'low' {
  return dpi >= target ? 'good' : dpi >= Math.min(150, target) ? 'fair' : 'low';
}
export function finishLabel(req: Pick<PrintRequest, 'finish' | 'holographicStyle'>) {
  return req.finish === 'holographic'
    ? `Holographic · ${req.holographicStyle}`
    : req.finish === 'gloss'
      ? 'Gloss'
      : 'Matte';
}
export function sizeLabel(
  req: Pick<PrintRequest, 'widthInches' | 'heightInches'>,
  units: 'in' | 'mm' = 'in',
) {
  const factor = units === 'mm' ? 25.4 : 1;
  const fmt = (n: number) => Number((n * factor).toFixed(1));
  return `${fmt(req.widthInches)} × ${fmt(req.heightInches)} ${units === 'in' ? 'in' : 'mm'}`;
}
export function stats(order: Order) {
  const requests = order.photos.flatMap((p) => p.requests);
  return {
    photos: order.photos.length,
    prints: requests.reduce((n, r) => n + r.quantity, 0),
    finishes: new Set(requests.map(finishLabel)).size,
    bytes: order.photos.reduce((n, p) => n + p.data.byteLength, 0),
    warnings: order.photos.filter((p) =>
      p.requests.some((r) => effectiveDpi(p, r) < order.targetDpi),
    ).length,
  };
}
export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function safeName(name: string) {
  const safe =
    name
      .normalize('NFKC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .trim()
      .slice(0, 100)
      .replace(/[. ]+$/g, '') || 'photo-order';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `order-${safe}` : safe;
}
export function validateOrder(order: Order) {
  if (!order.name.trim()) throw new Error('Give your order a name first.');
  if (!order.photos.length) throw new Error('Add at least one photo to your order.');
  if (stats(order).bytes > LIMITS.orderBytes)
    throw new Error('This order exceeds the 512 MB limit. Split it into smaller orders.');
  if (stats(order).prints > LIMITS.prints)
    throw new Error('An order can contain up to 5,000 prints.');
  for (const photo of order.photos) {
    if (!photo.requests.length)
      throw new Error(`${photo.originalName} needs at least one print size.`);
    photo.requests.forEach((r) => requestSchema.parse(r));
  }
}
