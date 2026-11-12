import { strFromU8, strToU8, unzip, zip, type Zippable, type Unzipped } from 'fflate';
import { blobOf, hash, inspectImage, releasePhotos } from './images';
import {
  effectiveDpi,
  LIMITS,
  manifestSchema,
  photoName,
  validateOrder,
  type Manifest,
  type Order,
  type Photo,
} from './model';

export function buildManifest(order: Order): Manifest {
  validateOrder(order);
  return manifestSchema.parse({
    format: 'photorequest',
    schemaVersion: 1,
    order: {
      id: order.id,
      name: order.name.trim(),
      customer: order.customer,
      notes: order.notes,
      targetDpi: order.targetDpi,
      createdAt: order.createdAt,
    },
    photos: order.photos.map((p, i) => ({
      id: photoName(i),
      file: `images/${photoName(i)}.${p.mime === 'image/jpeg' ? 'jpg' : p.mime === 'image/png' ? 'png' : 'webp'}`,
      originalName: p.originalName,
      sha256: p.sha256,
      byteLength: p.data.byteLength,
      width: p.width,
      height: p.height,
      sourceDpi: p.sourceDpi,
      colorSpace: p.colorSpace,
      mime: p.mime,
      requests: p.requests.map((r) => ({ ...r, effectiveDpi: effectiveDpi(p, r) })),
    })),
  });
}
export async function exportOrder(order: Order): Promise<Uint8Array> {
  const manifest = buildManifest(order);
  const json = strToU8(JSON.stringify(manifest, null, 2));
  if (json.byteLength > 4 * 1024 * 1024)
    throw new Error(
      'The order details exceed 4 MB. Split the order or shorten the paper notes before exporting.',
    );
  const entries: Zippable = {
    'order.json': json,
    'README.txt': strToU8(
      'PHOTO REQUEST - PORTABLE ORDER\n\nOpen this ZIP in PhotoRequest to review and print the order.\norder.json contains sizes in inches, quantities, finishes, original dimensions, source density (when available), and SHA-256 image checksums.\nimages/ contains the unchanged source files with sequential filenames.\nPrint desk creates separate PDFs for each paper finish. Print PDFs at Actual size / 100%, one PDF page per sheet.\nHolographic effects require the specified physical paper or finishing process; they are not digitally added.\nOriginal images retain their embedded metadata, including any location data.\n',
    ),
  };
  order.photos.forEach((p, i) => {
    entries[manifest.photos[i].file] = [p.data, { level: 0 }];
  });
  return new Promise((resolve, reject) =>
    zip(entries, { level: 0 }, (err, bytes) => (err ? reject(err) : resolve(bytes))),
  );
}

export async function unpack(data: Uint8Array): Promise<Unzipped> {
  if (data.byteLength > LIMITS.orderBytes + 10 * 1024 * 1024)
    throw new Error('This ZIP exceeds the 512 MB order limit.');
  let total = 0,
    count = 0;
  const seen = new Set<string>();
  return new Promise((resolve, reject) => {
    try {
      unzip(
        data,
        {
          filter: (entry) => {
            if (++count > LIMITS.photos + 10) throw new Error('The ZIP has too many files.');
            if (
              entry.name.startsWith('/') ||
              entry.name.includes('\\') ||
              entry.name.includes('\0') ||
              entry.name.split('/').some((s) => s === '..' || s === '.')
            )
              throw new Error('The ZIP contains an unsafe file path.');
            if (seen.has(entry.name)) throw new Error('The ZIP contains duplicate file paths.');
            seen.add(entry.name);
            if (entry.name.endsWith('/')) return false;
            if (
              entry.name !== 'order.json' &&
              entry.name !== 'README.txt' &&
              !/^images\/photo\d{5}\.(jpg|png|webp)$/.test(entry.name)
            )
              throw new Error('This is not a PhotoRequest order ZIP.');
            const cap =
              entry.name === 'order.json' || entry.name === 'README.txt'
                ? 4 * 1024 * 1024
                : LIMITS.fileBytes;
            total += entry.originalSize;
            if (
              !Number.isSafeInteger(entry.originalSize) ||
              entry.originalSize < 0 ||
              entry.originalSize > cap ||
              total > LIMITS.orderBytes + 8 * 1024 * 1024
            )
              throw new Error('The ZIP exceeds the image or order size limit.');
            return true;
          },
        },
        (err, files) =>
          err
            ? reject(
                new Error(
                  'The ZIP could not be read. It may be damaged or use unsupported compression.',
                ),
              )
            : resolve(files),
      );
    } catch (err) {
      reject(err);
    }
  });
}

export async function importOrder(data: Uint8Array): Promise<Order> {
  const files = await unpack(data);
  if (!files['order.json'])
    throw new Error('No order.json found. Choose a ZIP exported by PhotoRequest.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(files['order.json']));
  } catch {
    throw new Error('The order.json file is not valid JSON.');
  }
  const result = manifestSchema.safeParse(parsed);
  if (!result.success)
    throw new Error(
      `Unsupported or invalid order: ${result.error.issues[0]?.message || 'check order.json'}`,
    );
  const manifest = result.data;
  const ids = new Set<string>(),
    paths = new Set<string>();
  const photos: Photo[] = [];
  try {
    for (const p of manifest.photos) {
      if (ids.has(p.id) || paths.has(p.file) || p.file.split('/')[1].split('.')[0] !== p.id)
        throw new Error('The order contains duplicate or mismatched image references.');
      ids.add(p.id);
      paths.add(p.file);
      if (new Set(p.requests.map((r) => r.id)).size !== p.requests.length)
        throw new Error('The order contains duplicate print request IDs.');
      const bytes = files[p.file];
      if (!bytes || bytes.byteLength !== p.byteLength)
        throw new Error(`${p.id} is missing or has an incorrect file size.`);
      if ((await hash(bytes)) !== p.sha256)
        throw new Error(
          `${p.id} failed its integrity check. Ask the sender to export the order again.`,
        );
      const metadata = await inspectImage(bytes);
      if (metadata.width !== p.width || metadata.height !== p.height || metadata.mime !== p.mime)
        throw new Error(`${p.id} image information does not match the order.`);
      photos.push({
        ...metadata,
        id: p.id,
        originalName: p.originalName,
        data: bytes,
        sha256: p.sha256,
        requests: p.requests,
        url: URL.createObjectURL(blobOf(bytes, metadata.mime)),
      });
    }
    if (Object.keys(files).some((path) => path.startsWith('images/') && !paths.has(path)))
      throw new Error('The ZIP includes images that are not referenced by this order.');
    const order: Order = { ...manifest.order, photos };
    validateOrder(order);
    return order;
  } catch (error) {
    releasePhotos(photos);
    throw error;
  }
}
