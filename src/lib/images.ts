import exifr from 'exifr';
import { LIMITS, newRequest, type ImageMetadata, type Photo } from './model';

export function blobOf(data: Uint8Array, mime = 'application/octet-stream') {
  return new Blob([new Uint8Array(data)], { type: mime });
}
export async function hash(data: Uint8Array) {
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return Array.from(new Uint8Array(result), (x) => x.toString(16).padStart(2, '0')).join('');
}
export function sniffMime(data: Uint8Array): ImageMetadata['mime'] {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
    return 'image/png';
  if (
    String.fromCharCode(...data.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...data.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  throw new Error(
    'Use a JPEG, PNG, or WebP image. Convert HEIC, TIFF, RAW, and GIF files before adding them.',
  );
}
const fourCC = (data: Uint8Array, offset: number) =>
  String.fromCharCode(...data.subarray(offset, offset + 4));
/** Read container dimensions before any bitmap allocation, including WebP. */
export function imageHeader(data: Uint8Array): {
  width: number;
  height: number;
  dpi: ImageMetadata['sourceDpi'];
} {
  const mime = sniffMime(data),
    view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let width = 0,
    height = 0,
    dpi: ImageMetadata['sourceDpi'] = null;
  if (mime === 'image/png' && data.length >= 33 && fourCC(data, 12) === 'IHDR') {
    width = view.getUint32(16);
    height = view.getUint32(20);
    for (let pos = 8; pos + 12 <= data.length;) {
      const length = view.getUint32(pos),
        type = fourCC(data, pos + 4);
      if (pos + length + 12 > data.length) break;
      if (type === 'pHYs' && length === 9 && data[pos + 16] === 1) {
        const x = view.getUint32(pos + 8) * 0.0254,
          y = view.getUint32(pos + 12) * 0.0254;
        if (x > 0 && y > 0) dpi = { x, y };
      }
      pos += length + 12;
    }
  } else if (mime === 'image/jpeg') {
    let pos = 2;
    while (pos + 3 < data.length) {
      if (data[pos++] !== 0xff) break;
      while (data[pos] === 0xff) pos++;
      const marker = data[pos++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (pos + 2 > data.length) break;
      const length = view.getUint16(pos);
      if (length < 2 || pos + length > data.length) break;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7) {
        height = view.getUint16(pos + 3);
        width = view.getUint16(pos + 5);
      }
      if (marker === 0xe0 && length >= 16 && fourCC(data, pos + 2) === 'JFIF') {
        const unit = data[pos + 9],
          scale = unit === 1 ? 1 : unit === 2 ? 2.54 : 0;
        const x = view.getUint16(pos + 10) * scale,
          y = view.getUint16(pos + 12) * scale;
        if (x > 0 && y > 0) dpi = { x, y };
      }
      pos += length;
    }
  } else if (mime === 'image/webp') {
    for (let pos = 12; pos + 8 <= data.length;) {
      const type = fourCC(data, pos),
        length = view.getUint32(pos + 4, true),
        base = pos + 8;
      if (base + length > data.length) break;
      if (type === 'VP8X' && length >= 10) {
        width = 1 + data[base + 4] + (data[base + 5] << 8) + (data[base + 6] << 16);
        height = 1 + data[base + 7] + (data[base + 8] << 8) + (data[base + 9] << 16);
        break;
      }
      if (type === 'VP8 ' && length >= 10) {
        width = view.getUint16(base + 6, true) & 0x3fff;
        height = view.getUint16(base + 8, true) & 0x3fff;
        break;
      }
      if (type === 'VP8L' && length >= 5 && data[base] === 0x2f) {
        width = 1 + data[base + 1] + ((data[base + 2] & 0x3f) << 8);
        height =
          1 + (data[base + 2] >> 6) + (data[base + 3] << 2) + ((data[base + 4] & 0x0f) << 10);
        break;
      }
      pos = base + length + (length % 2);
    }
  }
  if (!width || !height) throw new Error('The image header is damaged or unsupported.');
  if (width * height > LIMITS.pixels) throw new Error('Images must be 80 megapixels or smaller.');
  return { width, height, dpi };
}
export async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}
export async function inspectImage(data: Uint8Array): Promise<ImageMetadata> {
  const mime = sniffMime(data);
  const header = imageHeader(data);
  const blob = blobOf(data, mime);
  // Read dimensions before decoding to reject oversized images without allocating their bitmap.
  let tags: Record<string, unknown> = {};
  try {
    tags =
      (await exifr.parse(blob, {
        tiff: true,
        exif: true,
        jfif: true,
        ihdr: true,
        icc: false,
        gps: false,
      })) || {};
  } catch {
    /* Optional metadata. */
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (!width || !height || width * height > LIMITS.pixels)
      throw new Error('Images must be 80 megapixels or smaller.');
    let x = Number(tags.XResolution),
      y = Number(tags.YResolution);
    const unit = tags.ResolutionUnit;
    if (unit === 3 || unit === 'cm' || unit === 'centimeters') {
      x *= 2.54;
      y *= 2.54;
    } else if (!(unit === 2 || unit === 'inches' || unit === 'inch')) {
      x = 0;
      y = 0;
    }
    if (!(x > 0 && y > 0)) {
      const densityUnit = Number(tags.densityUnits);
      const scale = densityUnit === 1 ? 1 : densityUnit === 2 ? 2.54 : 0;
      x = Number(tags.xDensity) * scale;
      y = Number(tags.yDensity) * scale;
    }
    const colorSpace =
      tags.ColorSpace === 1 || tags.ColorSpace === 'sRGB'
        ? 'sRGB'
        : 'Unspecified / original profile';
    return {
      width,
      height,
      mime,
      sourceDpi: Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 ? { x, y } : header.dpi,
      colorSpace,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function readPhoto(file: File): Promise<Photo> {
  if (!file.size || file.size > LIMITS.fileBytes)
    throw new Error(`${file.name}: images must be between 1 byte and 100 MB.`);
  const data = new Uint8Array(await file.arrayBuffer());
  const metadata = await inspectImage(data);
  return {
    ...metadata,
    id: crypto.randomUUID(),
    originalName: file.name.slice(0, 255),
    data,
    url: URL.createObjectURL(blobOf(data, metadata.mime)),
    sha256: await hash(data),
    requests: [newRequest()],
  };
}
export function releasePhotos(photos: Photo[]) {
  photos.forEach((photo) => URL.revokeObjectURL(photo.url));
}

/** Creates original, local demo artwork; no external image requests. */
export async function samplePhotos(): Promise<Photo[]> {
  const palettes = [
    {
      name: 'coastal-afternoon',
      sky: '#c6dedc',
      sun: '#f5d8a1',
      back: '#7eaaa0',
      front: '#315c50',
      sand: '#e5c6a1',
    },
    {
      name: 'desert-light',
      sky: '#e5d0c5',
      sun: '#fae7bb',
      back: '#c79178',
      front: '#8c5a46',
      sand: '#d3a588',
    },
    {
      name: 'alpine-morning',
      sky: '#d4e0e5',
      sun: '#f7eccd',
      back: '#9eafb1',
      front: '#4a6865',
      sand: '#9aaca0',
    },
  ];
  return Promise.all(
    palettes.map(async (p, index) => {
      const c = document.createElement('canvas');
      c.width = index === 1 ? 2000 : 3000;
      c.height = index === 1 ? 2800 : 2000;
      const ctx = c.getContext('2d')!,
        w = c.width,
        h = c.height;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, p.sky);
      grad.addColorStop(1, p.sand);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = p.sun;
      ctx.beginPath();
      ctx.arc(w * 0.68, h * 0.3, w * 0.115, 0, Math.PI * 2);
      ctx.fill();
      [
        [p.back, 0.55],
        [p.front, 0.7],
        [p.sand, 0.88],
      ].forEach(([color, y], layer) => {
        ctx.fillStyle = String(color);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 15)
          ctx.lineTo(
            x,
            h * Number(y) +
              Math.sin((x / w) * 5 + layer * 2) * h * 0.12 +
              Math.cos((x / w) * 9) * h * 0.025,
          );
        ctx.lineTo(w, h);
        ctx.fill();
      });
      const blob = await new Promise<Blob>((resolve) =>
        c.toBlob((b) => resolve(b!), 'image/jpeg', 0.94),
      );
      const photo = await readPhoto(new File([blob], `${p.name}.jpg`, { type: 'image/jpeg' }));
      photo.requests[0].quantity = index === 0 ? 2 : 1;
      if (index === 1)
        photo.requests[0] = {
          ...photo.requests[0],
          widthInches: 5,
          heightInches: 7,
          finish: 'gloss',
        };
      if (index === 2)
        photo.requests[0] = {
          ...photo.requests[0],
          finish: 'holographic',
          holographicStyle: 'Rainbow',
        };
      return photo;
    }),
  );
}
