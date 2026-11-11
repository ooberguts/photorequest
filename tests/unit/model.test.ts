import { describe, expect, it } from 'vitest';
import {
  effectiveDpi,
  newOrder,
  newRequest,
  orientedSize,
  quality,
  safeName,
  sizeLabel,
  validateOrder,
  type Photo,
} from '../../src/lib/model';
const photo = { width: 1800, height: 1200 };
describe('print resolution and geometry', () => {
  it('orients a 4x6 frame to the photo and calculates actual resolution', () => {
    expect(orientedSize(photo, newRequest())).toEqual({ width: 6, height: 4 });
    expect(effectiveDpi(photo, newRequest())).toBe(300);
  });
  it('accounts for removed pixels when cropping, and whitespace when fitting', () => {
    const square = { ...newRequest(), widthInches: 6, heightInches: 6 };
    expect(effectiveDpi(photo, square)).toBe(200);
    expect(effectiveDpi(photo, { ...square, fit: 'fit' })).toBe(300);
  });
  it('handles portrait and square images', () => {
    expect(effectiveDpi({ width: 1200, height: 1800 }, newRequest())).toBe(300);
    expect(orientedSize({ width: 1200, height: 1200 }, newRequest())).toEqual({
      width: 4,
      height: 6,
    });
  });
  it('distinguishes target resolution from a low resolution warning', () => {
    expect(quality(300, 300)).toBe('good');
    expect(quality(200, 300)).toBe('fair');
    expect(quality(149, 300)).toBe('low');
    expect(quality(150, 150)).toBe('good');
  });
  it('displays millimeter sizes without changing inch geometry', () => {
    expect(sizeLabel(newRequest(), 'mm')).toBe('101.6 × 152.4 mm');
  });
  it('makes safe portable filenames and rejects empty orders', () => {
    expect(safeName('My / summer: trip?')).toBe('My - summer- trip-');
    expect(safeName('...')).toBe('photo-order');
    expect(safeName('CON')).toBe('order-CON');
    expect(() => validateOrder(newOrder())).toThrow('Add at least one photo');
  });
  it('requires a real holographic pattern and valid copy counts', () => {
    const order = {
      ...newOrder(),
      photos: [
        {
          requests: [{ ...newRequest(), finish: 'holographic', holographicStyle: '' }],
          data: new Uint8Array(1),
        } as Photo,
      ],
    };
    expect(() => validateOrder(order)).toThrow();
  });
});
