import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRINT,
  layoutGroup,
  printGroups,
  pageUsage,
  sheetSizeLabel,
} from '../../src/lib/printing';
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
const mixedGroup = (sizes: number[][]) =>
  printGroups({
    ...newOrder(),
    photos: [
      {
        ...photo,
        requests: sizes.map(([widthInches, heightInches, quantity]) => ({
          ...newRequest(),
          widthInches,
          heightInches,
          quantity,
        })),
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
  it('fills the side and bottom spaces around a large frame instead of starting another sheet', () => {
    const pages = layoutGroup(
      mixedGroup([
        [6, 6, 1],
        [1.5, 3, 5],
      ]),
      DEFAULT_PRINT,
    );
    expect(pages).toHaveLength(1);
    expect(pages[0].placements).toHaveLength(6);
    expect(pages[0].placements.filter((p) => p.width * p.height === 4.5)).toHaveLength(5);
    expect(pageUsage(pages[0], DEFAULT_PRINT.margin)).toBe(70);
  });
  it('backfills previous sheets when smaller prints follow several large ones', () => {
    const pages = layoutGroup(
      mixedGroup([
        [6, 6, 2],
        [1.5, 3, 10],
      ]),
      DEFAULT_PRINT,
    );
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.placements.length > 1)).toBe(true);
    expect(pages.flatMap((p) => p.placements)).toHaveLength(12);
  });
  it('honors custom dimensions, landscape pages, and zero-gap edge fits', () => {
    const pages = layoutGroup(group(4, 4, 6), {
      ...DEFAULT_PRINT,
      paper: 'custom',
      customWidth: 8,
      customHeight: 12,
      orientation: 'landscape',
      margin: 0,
      gap: 0,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(12);
    expect(pages[0].height).toBe(8);
    expect(pageUsage(pages[0], 0)).toBe(100);
    expect(sheetSizeLabel(pages[0])).toBe('12 × 8 in');
  });
  it('validates custom sheets and settings rather than ignoring invalid input', () => {
    expect(() =>
      layoutGroup(group(), { ...DEFAULT_PRINT, paper: 'custom', customWidth: 0 }),
    ).toThrow('Custom sheet width');
    expect(() =>
      layoutGroup(group(), { ...DEFAULT_PRINT, paper: 'custom', customHeight: Infinity }),
    ).toThrow('Custom sheet width');
    expect(() => layoutGroup(group(), { ...DEFAULT_PRINT, margin: NaN })).toThrow('Margins');
    expect(() => layoutGroup(group(), { ...DEFAULT_PRINT, gap: -1 })).toThrow('Margins');
  });
  it('returns stable arrangements without changing print specifications', () => {
    const batch = mixedGroup([
      [6, 6, 1],
      [1.5, 3, 5],
      [2, 2, 7],
    ]);
    const original = JSON.stringify(batch);
    const first = layoutGroup(batch, DEFAULT_PRINT);
    expect(layoutGroup(batch, DEFAULT_PRINT)).toEqual(first);
    expect(JSON.stringify(batch)).toBe(original);
  });
  it('keeps randomized mixed sizes, all copies, margins, and cutting gaps intact', () => {
    let seed = 982451653;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let trial = 0; trial < 12; trial++) {
      const sizes = Array.from({ length: 12 }, () => [
        Math.round((0.5 + random() * 6) * 10) / 10,
        Math.round((0.5 + random() * 7) * 10) / 10,
        1 + Math.floor(random() * 3),
      ]);
      const batch = mixedGroup(sizes);
      const settings = {
        ...DEFAULT_PRINT,
        gap: trial % 3 === 0 ? 0 : 0.2,
        orientation: trial % 2 === 0 ? ('portrait' as const) : ('landscape' as const),
      };
      const pages = layoutGroup(batch, settings);
      expect(pages.flatMap((p) => p.placements)).toHaveLength(batch.items.length);
      const identities = pages.flatMap((p) => p.placements.map((i) => `${i.request.id}/${i.copy}`));
      expect(new Set(identities).size).toBe(batch.items.length);
      for (const page of pages)
        for (const [index, p] of page.placements.entries()) {
          expect(p.x).toBeGreaterThanOrEqual(settings.margin - 1e-6);
          expect(p.y).toBeGreaterThanOrEqual(settings.margin - 1e-6);
          expect(p.x + p.width).toBeLessThanOrEqual(page.width - settings.margin + 1e-6);
          expect(p.y + p.height).toBeLessThanOrEqual(page.height - settings.margin + 1e-6);
          expect(p.width * p.height).toBeCloseTo(p.request.widthInches * p.request.heightInches, 8);
          for (const other of page.placements.slice(index + 1))
            expect(
              p.x + p.width + settings.gap <= other.x + 1e-6 ||
                other.x + other.width + settings.gap <= p.x + 1e-6 ||
                p.y + p.height + settings.gap <= other.y + 1e-6 ||
                other.y + other.height + settings.gap <= p.y + 1e-6,
            ).toBe(true);
        }
    }
  });
  it('handles the maximum supported number of print copies', () => {
    const pages = layoutGroup(group(5000), DEFAULT_PRINT);
    expect(pages).toHaveLength(2500);
    expect(pages.flatMap((p) => p.placements)).toHaveLength(5000);
  });
});
