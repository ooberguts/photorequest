import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

test('one original image has independent cart sizes, finishes and quantities through ZIP export and recovery', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  const cart = page.getByRole('region', { name: 'Order cart' });
  const row = (n: number) => cart.getByRole('row', { name: `photo00001 item ${n}`, exact: true });
  await page.getByRole('button', { name: 'Review cart' }).click();
  await expect(row(1)).toContainText('4 × 6 in');
  await expect(row(1).getByRole('spinbutton')).toHaveValue('2');

  await cart.getByRole('button', { name: 'Add size for photo00001', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Print specifications', exact: true });
  await expect(editor.getByLabel('Print 2 size', { exact: true })).toHaveValue('5x7');
  await expect(editor.getByLabel('Print 2 size', { exact: true })).toBeFocused();
  await editor.getByLabel('Print 2 copies', { exact: true }).fill('3');
  await editor
    .locator('.request-panel')
    .nth(1)
    .getByRole('button', { name: 'Gloss', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Save specifications' }).click();
  await expect(row(2)).toContainText('5 × 7 in');
  await expect(row(2)).toContainText('Gloss');
  await expect(row(1)).toContainText('Matte');

  await cart.getByRole('button', { name: 'Add size for photo00001', exact: true }).click();
  await expect(editor.getByLabel('Print 3 size', { exact: true })).toHaveValue('8x10');
  await editor
    .locator('.request-panel')
    .nth(2)
    .getByRole('button', { name: 'Holographic', exact: true })
    .click();
  await editor.getByLabel('Print 3 holographic pattern').selectOption('Sparkle');
  await editor.getByRole('button', { name: 'Save specifications' }).click();
  await expect(row(3)).toContainText('Holographic · Sparkle');
  const copies = row(1).getByRole('spinbutton');
  await copies.fill('4');
  await copies.press('Enter');
  await expect(cart.locator('.cart-totals')).toContainText('3 original images · 5 cart items');
  await expect(cart.locator('.cart-totals')).toContainText('10 total prints');
  await expect(row(2).getByRole('spinbutton')).toHaveValue('3');

  await cart.getByRole('button', { name: 'Edit photo00001 item 2', exact: true }).click();
  await expect(editor.getByLabel('Print 2 size', { exact: true })).toBeFocused();
  await expect(editor.locator('.dpi-readout')).toContainText('400 effective DPI');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await cart.getByRole('button', { name: 'Add size for photo00001', exact: true }).click();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(cart.locator('.cart-totals')).toContainText('5 cart items');
  await expect(page.getByText('Draft saved on this device')).toBeVisible();
  await page.reload();
  await expect(row(1).getByRole('spinbutton')).toHaveValue('4');
  await expect(row(2).getByRole('spinbutton')).toHaveValue('3');
  await expect(row(3)).toContainText('Holographic · Sparkle');
  await mkdir('tmp', { recursive: true });
  await cart.screenshot({ path: 'tmp/order-cart.png' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export order ZIP' }).click();
  await page.getByRole('button', { name: 'Export with warnings', exact: true }).click();
  await (await download).saveAs('tmp/multi-size-cart.zip');
  const files = unzipSync(new Uint8Array(await readFile('tmp/multi-size-cart.zip')));
  expect(Object.keys(files).filter((p) => p.startsWith('images/'))).toHaveLength(3);
  const manifest = JSON.parse(strFromU8(files['order.json']));
  expect(
    manifest.photos[0].requests.map((r: Record<string, unknown>) => [
      r.widthInches,
      r.heightInches,
      r.quantity,
      r.finish,
      r.holographicStyle,
    ]),
  ).toEqual([
    [4, 6, 4, 'matte', ''],
    [5, 7, 3, 'gloss', ''],
    [8, 10, 1, 'holographic', 'Sparkle'],
  ]);
  await cart.getByRole('button', { name: 'Remove photo00001 item 2', exact: true }).click();
  await expect(row(2)).toContainText('8 × 10 in');
  await expect(row(1).getByRole('spinbutton')).toHaveValue('4');
  await cart.getByRole('button', { name: 'Remove photo00001 item 2', exact: true }).click();
  await cart.getByRole('button', { name: 'Remove photo00001 item 1', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove this photo?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('cart rejects invalid quantities and enforces the total order limit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  const cart = page.getByRole('region', { name: 'Order cart' });
  const quantity = cart.getByRole('spinbutton', {
    name: 'Copies for photo00001 item 1',
    exact: true,
  });
  await quantity.fill('0');
  await quantity.press('Enter');
  await expect(quantity).toHaveValue('2');
  await expect(cart.getByRole('alert')).toContainText('Use 1–999.');
  await quantity.fill('2');
  await quantity.press('Enter');
  await cart.getByRole('button', { name: 'Edit photo00001 item 1', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Print specifications', exact: true });
  const sizes = ['4x6', '5x7', '8x10', '8x12', '11x14', '12x18'];
  for (let i = 0; i < sizes.length; i++) {
    if (i) await editor.getByRole('button', { name: 'Add another print size' }).click();
    await editor.getByLabel(`Print ${i + 1} size`, { exact: true }).selectOption(sizes[i]);
    await editor.getByLabel(`Print ${i + 1} copies`, { exact: true }).fill('833');
  }
  await editor.getByRole('button', { name: 'Save specifications' }).click();
  await expect(cart.locator('.cart-totals')).toContainText('5000 total prints');
  await quantity.fill('834');
  await quantity.press('Enter');
  await expect(quantity).toHaveValue('833');
  await expect(cart.locator('.cart-totals')).toContainText('5000 total prints');
  await expect(page.getByRole('alert').filter({ hasText: '5,000 prints' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await cart.getByRole('button', { name: 'Add size for photo00001', exact: true }).click();
  await editor.getByRole('button', { name: 'Save specifications' }).click();
  await expect(editor).toContainText('5,000-print order limit');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(cart.locator('.cart-totals')).toContainText('8 cart items');
});
