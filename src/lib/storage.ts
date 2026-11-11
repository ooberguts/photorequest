import { get, getMany, setMany, keys, delMany } from 'idb-keyval';
import { blobOf } from './images';
import { type Order, type Photo } from './model';

const KEY = 'photorequest-draft-v1';
const IMAGE_KEY = 'photorequest-image-v1-';
const known = new Set<string>();
type SavedPhoto = Omit<Photo, 'url' | 'data'>;
type SavedDraft = {
  version: 2;
  order: Omit<Order, 'photos'> & { photos: SavedPhoto[] };
  completed: string[];
};
export async function saveDraft(order: Order, completed: string[]) {
  const saved: SavedDraft = {
    version: 2,
    order: { ...order, photos: order.photos.map(({ url: _url, data: _data, ...p }) => p) },
    completed,
  };
  const fresh = order.photos.filter((p) => !known.has(p.sha256));
  await setMany([
    ...fresh.map((p) => [IMAGE_KEY + p.sha256, p.data] as [string, unknown]),
    [KEY, saved],
  ]);
  fresh.forEach((p) => known.add(p.sha256));
  // Image bytes are stored once, not recopied on every edit or keystroke.
  const used = new Set(order.photos.map((p) => IMAGE_KEY + p.sha256));
  const obsolete = (await keys<string>()).filter((k) => k.startsWith(IMAGE_KEY) && !used.has(k));
  if (obsolete.length) {
    await delMany(obsolete);
    obsolete.forEach((k) => known.delete(k.slice(IMAGE_KEY.length)));
  }
}
export async function loadDraft(): Promise<{ order: Order; completed: string[] } | null> {
  const saved = await get<SavedDraft>(KEY);
  if (!saved || saved.version !== 2) return null;
  const data = await getMany<Uint8Array>(saved.order.photos.map((p) => IMAGE_KEY + p.sha256));
  const photos = saved.order.photos.map((p, i) => {
    if (!data[i]) throw new Error('A saved image is missing.');
    known.add(p.sha256);
    return { ...p, data: data[i], url: URL.createObjectURL(blobOf(data[i], p.mime)) };
  });
  return { order: { ...saved.order, photos }, completed: saved.completed || [] };
}
