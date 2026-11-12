import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { newCatalog, newPaper } from '../../src/lib/papers';

async function snapshot(page: import('@playwright/test').Page, name: string) {
  await mkdir('tmp', { recursive: true });
  await page.screenshot({ path: `tmp/${name}.png`, fullPage: true });
}

test('guided ordering builds a multi-size list and keeps the full workspace available', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Next: choose prints' })).toBeDisabled();
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.guided-photo')).toHaveCount(3);
  await snapshot(page, 'guided-photos');
  await page.getByRole('button', { name: 'Next: choose prints' }).click();
  await page.getByLabel('Guided print size', { exact: true }).selectOption('5x7');
  await page.getByLabel('Guided copies').fill('2');
  await page.getByLabel('Guided paper finish').selectOption('gloss');
  await expect(page.getByRole('button', { name: 'Next: review order' })).toBeDisabled();
  await page.getByRole('button', { name: 'Set prints for 3 photos' }).click();
  await expect(page.getByText('Print choices set for 3 photos.', { exact: false })).toBeVisible();
  await page.getByLabel('Apply settings to desert-light.jpg').uncheck();
  await page.getByLabel('Apply settings to alpine-morning.jpg').uncheck();
  await page.getByLabel('Apply print choices mode').selectOption('add');
  await page.getByLabel('Guided print size', { exact: true }).selectOption('4x6');
  await page.getByLabel('Guided copies').fill('1');
  await page.getByLabel('Guided paper finish').selectOption('matte');
  await page.getByRole('button', { name: 'Add this size to 1 photo', exact: true }).click();
  await snapshot(page, 'guided-choices');
  await page.getByRole('button', { name: 'Next: review order' }).click();
  const cart = page.getByRole('region', { name: 'Order cart' });
  await expect(cart).toContainText('7 total prints');
  await expect(cart).toContainText('4 cart items');
  await page.getByLabel('Order name', { exact: true }).fill('Guided photo order');
  await snapshot(page, 'guided-review');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export order ZIP', exact: true }).click();
  const orderDownload = await download;
  await orderDownload.saveAs('tmp/guided-order.zip');
  const files = unzipSync(new Uint8Array(await readFile('tmp/guided-order.zip')));
  const manifest = JSON.parse(strFromU8(files['order.json']));
  expect(manifest.order.name).toBe('Guided photo order');
  expect(
    manifest.photos[0].requests.map((r: any) => [r.widthInches, r.quantity, r.finish]),
  ).toEqual([
    [5, 2, 'gloss'],
    [4, 1, 'matte'],
  ]);
  expect(Object.keys(files).filter((n) => n.startsWith('images/'))).toHaveLength(3);
  await page.getByRole('button', { name: 'All tools', exact: true }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await expect(page.getByLabel('ORDER NAME', { exact: true })).toHaveValue('Guided photo order');
  await page.reload();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Guided steps', exact: true }).click();
  await expect(page.locator('.guided-photo')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('printer edits, exports and reloads a paper list; a customer selects it and exports the snapshot', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paper catalog', exact: true }).click();
  await page.getByLabel('Paper list name').fill('Available photo paper');
  await page.getByLabel('Printer name', { exact: true }).fill('Local print shop');
  await page.getByRole('button', { name: 'Add paper type', exact: true }).click();
  await page.getByLabel('Paper name', { exact: true }).fill('Matte 230');
  await page.getByLabel('Cost per sheet').fill('0.45');
  await page.getByLabel('Paper description').fill('Low shine with a smooth surface.');
  await page.getByText('More paper facts (optional)', { exact: true }).click();
  await page.getByLabel('Paper weight', { exact: true }).fill('230');
  await page.getByLabel('Paper notes', { exact: true }).fill('Let ink dry before stacking.');
  // A second stock can be retained in the catalog but hidden from new orders.
  await page.getByRole('button', { name: 'Add paper type', exact: true }).click();
  await page.getByLabel('Paper name', { exact: true }).fill('Gloss 4x6');
  await page.getByLabel('Paper finish', { exact: true }).selectOption('gloss');
  await page.getByLabel('Paper sheet width').fill('4');
  await page.getByLabel('Paper sheet height').fill('6');
  await page.getByLabel('Available for new orders').uncheck();
  // Navigating away does not silently discard catalog edits.
  await page.getByRole('button', { name: 'Order studio', exact: true }).click();
  await page.getByRole('button', { name: 'Paper catalog', exact: true }).click();
  await expect(page.getByLabel('Paper name', { exact: true })).toHaveValue('Gloss 4x6');
  await page.getByRole('button', { name: 'Save paper list', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Paper catalog', exact: true }).click();
  await expect(page.locator('.catalog-list')).toContainText('Matte 230');
  const listDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export paper list JSON', exact: true }).click();
  await (await listDownload).saveAs('tmp/printer-paper-list.json');
  const list = JSON.parse(await readFile('tmp/printer-paper-list.json', 'utf8'));
  expect(list.papers).toHaveLength(2);
  expect(list.papers[0].costPerSheet).toBe(0.45);
  expect(list.papers[1].available).toBe(false);
  await snapshot(page, 'paper-catalog');
  // Re-import through the same customer-facing entry point.
  await page.getByRole('button', { name: 'Order studio', exact: true }).click();
  await page.getByLabel('Choose paper catalog JSON').setInputFiles('tmp/printer-paper-list.json');
  await page.getByRole('button', { name: 'Use paper list', exact: true }).click();
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.guided-photo')).toHaveCount(3);
  await page.getByRole('button', { name: 'Next: choose prints' }).click();
  const paper = page.getByLabel('Printer paper', { exact: true });
  await expect(paper.locator('option')).toHaveCount(2);
  await expect(paper).not.toContainText('Gloss 4x6');
  await paper.selectOption(list.papers[0].id);
  await expect(page.locator('.paper-facts')).toContainText('230 gsm');
  await expect(page.locator('.paper-facts')).toContainText('0.45');
  await page.getByRole('button', { name: 'Set prints for 3 photos', exact: true }).click();
  await page.getByRole('button', { name: 'Next: review order' }).click();
  await expect(page.getByRole('region', { name: 'Order cart' })).toContainText('Matte 230');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export order ZIP', exact: true }).click();
  await (await download).saveAs('tmp/paper-order.zip');
  const files = unzipSync(new Uint8Array(await readFile('tmp/paper-order.zip')));
  const manifest = JSON.parse(strFromU8(files['order.json']));
  expect(manifest.photos[0].requests[0].paper.paper).toEqual(list.papers[0]);
  await page.getByRole('button', { name: 'Paper catalog', exact: true }).click();
  await page.getByLabel('Cost per sheet').fill('0.65');
  await page.getByRole('button', { name: 'Save paper list', exact: true }).click();
  await page.getByRole('button', { name: 'Order studio', exact: true }).click();
  await page.getByRole('button', { name: 'Review & export', exact: false }).click();
  await expect(page.locator('.guided-checks')).toContainText('paper details have changed');
  await expect(page.getByRole('region', { name: 'Order cart' })).toContainText('0.45');
  await page.getByRole('button', { name: 'Paper catalog', exact: true }).click();
  await page.getByRole('button', { name: 'Remove paper type', exact: true }).click();
  await page.getByRole('button', { name: 'Save paper list', exact: true }).click();
  await expect(page.locator('.catalog-list')).not.toContainText('Matte 230');
  await page.getByRole('button', { name: 'Order studio', exact: true }).click();
  await page.getByRole('button', { name: 'Review & export', exact: false }).click();
  await expect(page.locator('.guided-checks')).toContainText('no longer listed as available');
  await expect(page.getByRole('region', { name: 'Order cart' })).toContainText('Matte 230');
});

test('customer import rejects invalid files, allows cancellation, and flags a sheet that is too small', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Choose paper catalog JSON');
  await input.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{bad'),
  });
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  const catalog = {
    ...newCatalog(),
    name: 'Small paper only',
    papers: [{ ...newPaper(), name: 'Small matte', widthInches: 4, heightInches: 6 }],
  };
  const file = {
    name: 'paper.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(catalog)),
  };
  await input.setInputFiles(file);
  const confirmation = page.getByRole('dialog', { name: 'Load this printer’s paper list?' });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  expect(
    await page.evaluate(() => localStorage.getItem('photorequest-paper-catalog-v1')),
  ).toBeNull();
  await input.setInputFiles(file);
  await page.getByRole('button', { name: 'Use paper list', exact: true }).click();
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.guided-photo')).toHaveCount(3);
  await page.getByRole('button', { name: 'Next: choose prints' }).click();
  await page.getByLabel('Guided print size', { exact: true }).selectOption('8x10');
  await page.getByLabel('Printer paper', { exact: true }).selectOption(catalog.papers[0].id);
  await expect(page.getByRole('alert')).toContainText('larger than the chosen sheet');
  await page.getByRole('button', { name: 'Set prints for 3 photos', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'larger than the selected paper' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next: review order' })).toBeDisabled();
  await page.getByRole('button', { name: 'discard these setting changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next: review order' })).toBeEnabled();
  await page.setViewportSize({ width: 900, height: 700 });
  await snapshot(page, 'guided-small');
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(900);
});
