import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('photorequest-order-mode', 'all'));
});

test('fills mixed-size gaps and updates the layout for the selected sheet', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit photo00001', exact: true }).click();
  await page.getByLabel('Print 1 width', { exact: true }).fill('6');
  await page.getByLabel('Print 1 height', { exact: true }).fill('6');
  await page.getByLabel('Print 1 copies', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Add another print size' }).click();
  await page.getByLabel('Print 2 width', { exact: true }).fill('1.5');
  await page.getByLabel('Print 2 height', { exact: true }).fill('3');
  await page.getByLabel('Print 2 copies', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save specifications' }).click();
  await page.getByRole('button', { name: 'Prepare to print' }).click();
  await page
    .locator('.batch-card')
    .filter({ has: page.getByText('Matte', { exact: true }) })
    .click();
  await expect(page.locator('.sheet-photo')).toHaveCount(6);
  await expect(page.getByText('Sheet 1 of 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Printable area used' })).toHaveAttribute(
    'aria-valuenow',
    '70',
  );
  await page.getByLabel('Print layout').selectOption('single');
  await expect(page.getByText('Sheet 1 of 6', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByText('Sheet 2 of 6', { exact: true })).toBeVisible();
  await page.getByLabel('Print layout').selectOption('pack');
  await expect(page.getByText('Sheet 1 of 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '← Previous' })).toBeDisabled();
  await mkdir('tmp', { recursive: true });
  await page.screenshot({ path: 'tmp/smart-mixed-layout.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save batch PDF' }).click();
  await (await download).saveAs('tmp/mixed-packed-sheet.pdf');
  const pdf = await PDFDocument.load(await readFile('tmp/mixed-packed-sheet.pdf'));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
});

test('prints a custom landscape sheet at exact size and requires a matching-paper confirmation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await page.getByRole('button', { name: 'Edit photo00001', exact: true }).click();
  await page.getByLabel('Print 1 copies', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Save specifications' }).click();
  await page.getByRole('button', { name: 'Prepare to print' }).click();
  await page
    .locator('.batch-card')
    .filter({ has: page.getByText('Matte', { exact: true }) })
    .click();
  await page.getByLabel('Sheet size', { exact: true }).selectOption('custom');
  await page.getByLabel('Custom sheet units').selectOption('mm');
  await page.getByLabel('Custom sheet width').fill('203.2');
  await page.getByLabel('Custom sheet height').fill('304.8');
  await page.getByLabel('Page orientation').selectOption('landscape');
  await page.getByLabel('Sheet margin').fill('0');
  await page.getByLabel('Print spacing').fill('0');
  await expect(page.locator('.sheet-photo')).toHaveCount(4);
  await expect(page.getByRole('meter', { name: 'Printable area used' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await expect(page.getByText('Sheet 1 of 1', { exact: true })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save batch PDF' }).click();
  await mkdir('tmp', { recursive: true });
  await (await download).saveAs('tmp/custom-packed-sheet.pdf');
  const pdf = await PDFDocument.load(await readFile('tmp/custom-packed-sheet.pdf'));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(864, 6);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(576, 6);
  const contents = pdf.getPage(0).node.Contents();
  let operators = '';
  if (contents && 'asArray' in contents)
    for (const ref of contents.asArray()) {
      const stream = pdf.context.lookup(ref);
      if (stream instanceof PDFRawStream)
        operators += new TextDecoder().decode(decodePDFRawStream(stream).decode());
    }
  expect(operators.match(/0 0 432 288 re/g)).toHaveLength(4);
  await page.screenshot({ path: 'tmp/custom-packed-sheet.png', fullPage: true });

  let opened = 0;
  page.on('popup', () => opened++);
  await page.getByRole('button', { name: 'Open PDF to print' }).click();
  const dialog = page.getByRole('dialog', { name: 'Check the printer paper' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Matte');
  await expect(dialog).toContainText('12 × 8 in');
  await expect(dialog.getByRole('button', { name: 'Confirm paper and open PDF' })).toBeDisabled();
  expect(opened).toBe(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(opened).toBe(0);

  await page
    .locator('.batch-card')
    .filter({ has: page.getByText('Holographic · Rainbow', { exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Open PDF to print' }).click();
  await expect(dialog).toContainText('Holographic');
  await expect(dialog).toContainText('Rainbow');
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await expect(dialog).toContainText('matching paper size and media type');
  await page.screenshot({ path: 'tmp/paper-confirmation.png' });
  await dialog.getByRole('checkbox').check();
  const popup = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Confirm paper and open PDF' }).click();
  const viewer = await popup;
  // Headless Chromium may download a PDF instead of navigating the new tab to its blob URL.
  // The popup verifies the handoff; the PDF's actual contents and geometry are checked above.
  await viewer.close();
  await expect(dialog).not.toBeVisible();
  expect(opened).toBe(1);

  await page.getByRole('button', { name: 'Open PDF to print' }).click();
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByLabel('Custom sheet width').fill('0');
  await expect(page.getByText('Check sheet settings', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open PDF to print' })).toBeDisabled();
  expect(errors).toEqual([]);
});
