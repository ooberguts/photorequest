import { describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { buildManifest, exportOrder, importOrder, unpack } from '../../src/lib/package';
import { hash } from '../../src/lib/images';
import { newOrder, newRequest, type Photo } from '../../src/lib/model';
import { newCatalog, newPaper, selectPaper } from '../../src/lib/papers';

// Unit tests isolate archive validation; browser tests exercise real image decoding.
vi.mock('../../src/lib/images', async (original) => ({
  ...(await original<typeof import('../../src/lib/images')>()),
  inspectImage: vi.fn(async () => ({
    width: 1800,
    height: 1200,
    sourceDpi: null,
    colorSpace: 'sRGB',
    mime: 'image/jpeg',
  })),
}));
async function fixture() {
  const data = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const p: Photo = {
    id: 'internal-id',
    originalName: 'vacation.jpg',
    width: 1800,
    height: 1200,
    data,
    sha256: await hash(data),
    sourceDpi: null,
    colorSpace: 'sRGB',
    mime: 'image/jpeg',
    requests: [newRequest()],
    url: '',
  };
  return {
    ...newOrder(),
    name: 'Vacation prints',
    customer: 'A friend',
    notes: 'Handle with care',
    photos: [p],
  };
}
describe('portable orders', () => {
  it('exports original bytes, stable sequential names, and computed print DPI', async () => {
    const order = await fixture(),
      zipped = await exportOrder(order),
      entries = unzipSync(zipped);
    expect(entries['images/photo00001.jpg']).toEqual(order.photos[0].data);
    const manifest = JSON.parse(strFromU8(entries['order.json']));
    expect(manifest.photos[0].originalName).toBe('vacation.jpg');
    expect(manifest.photos[0].requests[0].effectiveDpi).toBe(300);
    expect(manifest.photos[0].file).toBe('images/photo00001.jpg');
    expect(manifest.order.notes).toBe('Handle with care');
  });
  it('round trips images, sizes, finishes, notes, and quantities', async () => {
    const order = await fixture(),
      restored = await importOrder(await exportOrder(order));
    expect(restored.name).toBe(order.name);
    expect(restored.photos[0].data).toEqual(order.photos[0].data);
    expect(restored.photos[0].requests[0].widthInches).toBe(4);
    expect(restored.photos[0].requests[0].quantity).toBe(1);
    URL.revokeObjectURL(restored.photos[0].url);
  });
  it('preserves the exact paper snapshot through a ZIP round trip', async () => {
    const order = await fixture();
    const paper = {
      ...newPaper(),
      name: 'Printer matte',
      costPerSheet: 0.35,
      notes: 'Let ink dry before stacking.',
    };
    order.photos[0].requests[0].paper = selectPaper(newCatalog(), paper);
    const restored = await importOrder(await exportOrder(order));
    expect(restored.photos[0].requests[0].paper).toEqual(order.photos[0].requests[0].paper);
    URL.revokeObjectURL(restored.photos[0].url);
  });
  it('rejects modified image bytes', async () => {
    const entries = unzipSync(await exportOrder(await fixture()));
    entries['images/photo00001.jpg'][3] = 99;
    await expect(importOrder(zipSync(entries))).rejects.toThrow('integrity check');
  });
  it('rejects a missing referenced image', async () => {
    const entries = unzipSync(await exportOrder(await fixture()));
    delete entries['images/photo00001.jpg'];
    await expect(importOrder(zipSync(entries))).rejects.toThrow('missing');
  });
  it('rejects unsupported schema versions', async () => {
    const order = await fixture(),
      manifest = { ...buildManifest(order), schemaVersion: 2 };
    await expect(
      importOrder(zipSync({ 'order.json': strToU8(JSON.stringify(manifest)) })),
    ).rejects.toThrow('Unsupported or invalid');
  });
  it('rejects path traversal and unrelated ZIPs', async () => {
    await expect(unpack(zipSync({ '../unsafe.jpg': new Uint8Array([1]) }))).rejects.toThrow(
      'unsafe',
    );
    await expect(unpack(zipSync({ 'other.txt': new Uint8Array([1]) }))).rejects.toThrow(
      'not a PhotoRequest',
    );
  });
  it('rejects duplicate manifest references and invalid quantities', async () => {
    const order = await fixture(),
      manifest = buildManifest(order);
    manifest.photos.push(manifest.photos[0]);
    const entries = unzipSync(await exportOrder(order));
    entries['order.json'] = strToU8(JSON.stringify(manifest));
    await expect(importOrder(zipSync(entries))).rejects.toThrow('duplicate');
    manifest.photos.pop();
    manifest.photos[0].requests[0].quantity = -1;
    entries['order.json'] = strToU8(JSON.stringify(manifest));
    await expect(importOrder(zipSync(entries))).rejects.toThrow('Unsupported or invalid');
  });
});
