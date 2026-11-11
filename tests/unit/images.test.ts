import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { imageHeader } from '../../src/lib/images';

describe('image headers and density', () => {
  it('reads PNG pixel dimensions and converts pHYs pixels per meter to DPI', () => {
    const header = imageHeader(new Uint8Array(readFileSync('tests/fixtures/density-300dpi.png')));
    expect(header.width).toBe(300);
    expect(header.height).toBe(200);
    expect(header.dpi?.x).toBeCloseTo(300, 1);
    expect(header.dpi?.y).toBeCloseTo(300, 1);
  });
  it('reads original JPEG dimensions and JFIF density before decoding', () => {
    const header = imageHeader(new Uint8Array(readFileSync('tests/fixtures/oriented-240dpi.jpg')));
    expect(header).toEqual({ width: 400, height: 600, dpi: { x: 240, y: 240 } });
  });
  it('rejects huge declared pixel dimensions before attempting decode', () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/density-300dpi.png'));
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 100_000);
    view.setUint32(20, 100_000);
    expect(() => imageHeader(bytes)).toThrow('80 megapixels');
  });
  it('rejects a truncated image header', () => {
    expect(() => imageHeader(new Uint8Array([0xff, 0xd8, 0xff]))).toThrow('damaged');
  });
});
