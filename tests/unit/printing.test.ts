import { describe, expect, it } from 'vitest';
import { DEFAULT_PRINT, layoutGroup, printGroups } from '../../src/lib/printing';
import { newOrder, newRequest, type Photo } from '../../src/lib/model';

const photo: Photo = {
  id: 'test',
  width: 1800,
  height: 1200,
  requests: [newRequest()],
  originalName: 'test.jpg',
  sha256: 'a'.repeat(64),
  data: new Uint8Array([1]),
  mime: 'image/jpeg',
  sourceDpi: null,
  url: '',
  colorSpace: 'sRGB',
};
const group = (quantity = 2, width = 4, height = 6) =>
  printGroups({
    ...newOrder(),
    photos: [
      {
        ...photo,
        requests: [{ ...newRequest(), quantity, widthInches: width, heightInches: height }],
      },
    ],
  })[0];
describe('print batching and layout', () => {
  it('separates physical media, including different holographic patterns', () => {
    const order = {
      ...newOrder(),
      photos: [
        {
          ...photo,
          requests: [
            newRequest(),
            { ...newRequest(), finish: 'gloss' as const },
            { ...newRequest(), finish: 'holographic' as const, holographicStyle: 'Rainbow' },
            { ...newRequest(), finish: 'holographic' as const, holographicStyle: 'Stars' },
          ],
        },
      ],
    };
    expect(printGroups(order)).toHaveLength(4);
  });
  it('fits two 4x6 photos at actual size on Letter', () => {
    const pages = layoutGroup(group(), DEFAULT_PRINT);
    expect(pages).toHaveLength(1);
    expect(pages[0].placements).toHaveLength(2);
    expect(pages[0].placements.every((p) => p.width * p.height === 24)).toBe(true);
  });
  it('creates additional sheets without shrinking prints or losing copies', () => {
    const pages = layoutGroup(group(5), DEFAULT_PRINT);
    expect(pages).toHaveLength(3);
    expect(pages.flatMap((p) => p.placements)).toHaveLength(5);
  });
  it('centers single prints and expands copies into distinct pages', () => {
    const pages = layoutGroup(group(2), { ...DEFAULT_PRINT, layout: 'single' });
    expect(pages).toHaveLength(2);
    expect(pages[0].placements[0].x).toBe(1.25);
    expect(pages[0].placements[0].y).toBe(3.5);
  });
  it('rotates a landscape print to fit portrait borderless photo paper', () => {
    const pages = layoutGroup(group(1), { ...DEFAULT_PRINT, paper: '4x6', margin: 0 });
    expect(pages).toHaveLength(1);
    expect(pages[0].placements[0].rotated).toBe(true);
    expect(pages[0].placements[0].width).toBe(4);
    expect(pages[0].placements[0].height).toBe(6);
  });
  it('reports a print that does not fit rather than changing requested dimensions', () => {
    expect(() => layoutGroup(group(1, 11, 14), DEFAULT_PRINT)).toThrow('does not fit');
    expect(() => layoutGroup(group(1), { ...DEFAULT_PRINT, paper: '4x6' })).toThrow('does not fit');
  });
  it('keeps mixed sizes inside margins and never overlaps them', () => {
    const requests = [
      [2, 3, 3],
      [4, 6, 2],
      [3, 5, 3],
    ].map(([widthInches, heightInches, quantity]) => ({
      ...newRequest(),
      widthInches,
      heightInches,
      quantity,
    }));
    const batch = printGroups({ ...newOrder(), photos: [{ ...photo, requests }] })[0];
    const pages = layoutGroup(batch, DEFAULT_PRINT);
    for (const page of pages)
      for (const [index, p] of page.placements.entries()) {
        expect(p.x).toBeGreaterThanOrEqual(0.25);
        expect(p.y).toBeGreaterThanOrEqual(0.25);
        expect(p.x + p.width).toBeLessThanOrEqual(page.width - 0.25 + 0.00001);
        expect(p.y + p.height).toBeLessThanOrEqual(page.height - 0.25 + 0.00001);
        for (const other of page.placements.slice(index + 1))
          expect(
            p.x + p.width <= other.x ||
              other.x + other.width <= p.x ||
              p.y + p.height <= other.y ||
              other.y + other.height <= p.y,
          ).toBe(true);
      }
  });
});
