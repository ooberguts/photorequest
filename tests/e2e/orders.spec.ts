import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';

test('build, edit, save, round trip, and print a real photo order', async ({ page }) => {
  const errors: string[] = [],
    remote: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:1420'))
      remote.push(r.url());
  });
  await mkdir('tmp', { recursive: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await page.getByLabel('ORDER NAME', { exact: true }).fill('Weekend print order');
  await page.getByLabel('Order notes').fill('Please use the specified physical paper. Thank you!');
  await page.getByRole('button', { name: 'Edit photo00001', exact: true }).click();
  await page.getByLabel('Print 1 size', { exact: true }).selectOption('5x7');
  await page.getByLabel('Print 1 copies', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Holographic', exact: true }).click();
  await page.getByLabel('Print 1 holographic pattern').selectOption('Broken glass');
  await page.getByRole('button', { name: 'Add another print size' }).click();
  await page.getByRole('button', { name: 'Save specifications' }).click();
  await expect(page.locator('.photo-card').first()).toContainText('×4');
  await expect(page.getByText('Draft saved on this device')).toBeVisible();
  await page.reload();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await expect(page.getByLabel('Order notes')).toHaveValue(
    'Please use the specified physical paper. Thank you!',
  );
  await page.screenshot({ path: 'tmp/studio.png', fullPage: true });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export order ZIP' }).click();
  await (await download).saveAs('tmp/order-roundtrip.zip');
  const entries = unzipSync(new Uint8Array(await readFile('tmp/order-roundtrip.zip')));
  const manifest = JSON.parse(strFromU8(entries['order.json']));
  expect(manifest.order.name).toBe('Weekend print order');
  expect(manifest.photos.map((p: { file: string }) => p.file)).toEqual([
    'images/photo00001.jpg',
    'images/photo00002.jpg',
    'images/photo00003.jpg',
  ]);
  expect(manifest.photos[0].requests[0]).toMatchObject({
    widthInches: 5,
    heightInches: 7,
    quantity: 3,
    finish: 'holographic',
    holographicStyle: 'Broken glass',
    effectiveDpi: 400,
  });

  await page.getByRole('button', { name: 'New order', exact: false }).click();
  await page.getByRole('button', { name: 'Start new order', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(0);
  await page.getByLabel('Choose order ZIP').setInputFiles('tmp/order-roundtrip.zip');
  await expect(page.getByRole('heading', { name: 'Print desk' })).toBeVisible();
  await expect(page.locator('.batch-card')).toHaveCount(4);
  await page
    .locator('.batch-card')
    .filter({ has: page.getByText('Matte', { exact: true }) })
    .click();
  await expect(page.locator('.sheet-photo')).toHaveCount(1);
  await page.screenshot({ path: 'tmp/print-desk.png', fullPage: true });
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save batch PDF' }).click();
  await (await pdfDownload).saveAs('tmp/test-print.pdf');
  const pdf = await PDFDocument.load(await readFile('tmp/test-print.pdf'));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
  await page.getByRole('button', { name: 'Mark batch printed', exact: true }).click();
  await expect(page.getByText('1 of 4 batches marked printed')).toBeVisible();
  await expect(page.getByText('Draft saved on this device')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Print desk', exact: false }).click();
  await expect(page.getByText('1 of 4 batches marked printed')).toBeVisible();
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test('reads embedded density and EXIF display orientation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose images' })).toBeEnabled();
  await page
    .getByLabel('Choose photos')
    .setInputFiles(['tests/fixtures/oriented-240dpi.jpg', 'tests/fixtures/density-300dpi.png']);
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Edit photo00001', exact: true }).click();
  await expect(page.getByText('600 × 400 px', { exact: true })).toBeVisible();
  await expect(page.getByText('240 × 240 DPI', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close editor' }).click();
  await page.getByRole('button', { name: 'Edit photo00002', exact: true }).click();
  await expect(page.getByText('300 × 300 DPI', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close editor' }).click();
});

test('bulk edits, custom millimeter sizes, unsupported files, and oversized prints', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'mm', exact: true }).click();
  await page.getByLabel('Select all photos').check();
  await page.getByRole('button', { name: 'Edit specifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit 3 selected photos' })).toBeVisible();
  await page.getByLabel('Print 1 width', { exact: true }).fill('279.4');
  await page.getByLabel('Print 1 height', { exact: true }).fill('355.6');
  await page.getByRole('button', { name: 'Save specifications' }).click();
  await expect(page.locator('.photo-card').first()).toContainText('279.4 × 355.6 mm');
  await page.getByRole('button', { name: 'Prepare to print' }).click();
  await expect(page.getByText('Print exceeds the selected sheet size')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save batch PDF' })).toBeDisabled();
  await page.getByLabel('Sheet size').selectOption('13x19');
  await expect(page.getByText('Print exceeds the selected sheet size')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save batch PDF' })).toBeEnabled();
  await page.getByRole('button', { name: 'Order studio', exact: false }).click();
  await page.getByLabel('Choose photos').setInputFiles({
    name: 'not-a-photo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test'),
  });
  await expect(page.getByRole('alert')).toContainText('Use a JPEG, PNG, or WebP image');
  await expect(page.locator('.photo-card')).toHaveCount(3);
});

test('imports PNG and WebP bytes, skips duplicates, and guards low DPI exports', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose images' })).toBeEnabled();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 400;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#cc8844';
    ctx.fillRect(0, 0, 600, 400);
    return c.toDataURL('image/png').split(',')[1];
  });
  const webp = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 600;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#4488cc';
    ctx.fillRect(0, 0, 400, 600);
    return c.toDataURL('image/webp').split(',')[1];
  });
  const file = { name: 'landscape.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
  await page
    .getByLabel('Choose photos')
    .setInputFiles([
      file,
      { name: 'portrait.webp', mimeType: 'image/webp', buffer: Buffer.from(webp, 'base64') },
    ]);
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await expect(page.locator('.quality-badge').first()).toContainText('100 DPI');
  await page.getByLabel('Choose photos').setInputFiles(file);
  await expect(page.getByRole('status').filter({ hasText: 'duplicate' })).toBeVisible();
  await expect(page.locator('.photo-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Export order ZIP' }).click();
  await expect(page.getByRole('heading', { name: 'Resolution warnings' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
});
