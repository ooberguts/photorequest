import { describe, expect, it } from 'vitest';
import {
  newCatalog,
  newPaper,
  parseCatalog,
  serializeCatalog,
  selectPaper,
  fitsPaper,
  paperNotice,
} from '../../src/lib/papers';
import { newOrder, newRequest, requestSchema, type Photo } from '../../src/lib/model';
import { printGroups, layoutGroup, DEFAULT_PRINT } from '../../src/lib/printing';

const catalog = {
  ...newCatalog(),
  name: 'Print shop',
  papers: [{ ...newPaper(), name: 'Matte 230', costPerSheet: 0.45, weightGsm: 230 }],
};
const selection = selectPaper(catalog, catalog.papers[0]);
describe('portable paper catalogs', () => {
  it('round trips complete paper facts without making up an unknown price', () => {
    expect(parseCatalog(serializeCatalog(catalog))).toEqual(catalog);
    expect(
      parseCatalog(serializeCatalog({ ...catalog, papers: [newPaper()] })).papers[0].costPerSheet,
    ).toBeNull();
  });
  it('rejects malformed or unsupported catalogs, duplicate IDs, and invalid facts', () => {
    for (const value of [
      { ...catalog, schemaVersion: 2 },
      { ...catalog, papers: [catalog.papers[0], catalog.papers[0]] },
      { ...catalog, papers: [{ ...catalog.papers[0], costPerSheet: -1 }] },
      { ...catalog, papers: [{ ...catalog.papers[0], widthInches: 0 }] },
      {
        ...catalog,
        papers: [{ ...catalog.papers[0], finish: 'holographic', holographicStyle: '' }],
      },
    ])
      expect(() => parseCatalog(JSON.stringify(value))).toThrow('could not be loaded');
    expect(() => parseCatalog('{bad')).toThrow('not valid JSON');
    expect(() => parseCatalog(' '.repeat(1024 * 1024 + 1))).toThrow('1 MB');
  });
  it('allows rotated sizes but rejects prints larger than the physical sheet', () => {
    expect(fitsPaper({ widthInches: 11, heightInches: 8.5 }, selection.paper)).toBe(true);
    expect(requestSchema.safeParse({ ...newRequest(), paper: selection }).success).toBe(true);
    expect(
      requestSchema.safeParse({
        ...newRequest(),
        widthInches: 12,
        heightInches: 18,
        paper: selection,
      }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ ...newRequest(), finish: 'gloss', paper: selection }).success,
    ).toBe(false);
  });
  it('keeps a historical selection independent and identifies unavailable or changed stock', () => {
    const selected = selectPaper(catalog, catalog.papers[0]);
    const next = { ...catalog, papers: [{ ...catalog.papers[0], costPerSheet: 0.75 }] };
    expect(selected.paper.costPerSheet).toBe(0.45);
    expect(paperNotice(selected, next)).toContain('changed');
    expect(paperNotice(selected, { ...catalog, papers: [] })).toContain('no longer');
    expect(
      paperNotice(selected, { ...catalog, papers: [{ ...catalog.papers[0], available: false }] }),
    ).toContain('no longer');
    expect(paperNotice(selected, { ...catalog, id: 'another' })).toBe('');
  });
  it('keeps distinct stocks of the same finish in separate printer batches and matches sheets', () => {
    const photo = {
      id: 'p',
      width: 3000,
      height: 2000,
      requests: [
        { ...newRequest(), paper: selection },
        {
          ...newRequest(),
          paper: selectPaper(catalog, {
            ...catalog.papers[0],
            id: 'other',
            name: 'Different stock',
          }),
        },
      ],
    } as Photo;
    const groups = printGroups({ ...newOrder(), photos: [photo] });
    expect(groups).toHaveLength(2);
    expect(layoutGroup(groups[0], DEFAULT_PRINT)).toHaveLength(1);
    expect(() => layoutGroup(groups[0], { ...DEFAULT_PRINT, paper: 'a4' })).toThrow(
      'matching sheet',
    );
  });
});
