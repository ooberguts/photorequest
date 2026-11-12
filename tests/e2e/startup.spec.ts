import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('an outdated runtime shows recovery steps without replacing the saved draft', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.guided-photo')).toHaveCount(3);
  await expect(page.getByText('Draft saved on this device')).toBeVisible();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'structuredClone', { value: undefined, configurable: true });
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'A system component needs attention' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Image and paper data handling');
  await expect(page.getByRole('alert')).toContainText('macOS 12.3 or newer');
  await expect(page.getByRole('button', { name: 'Try opening again' })).toBeVisible();
  const photos = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = reject;
        request.onsuccess = () => {
          const draft = request.result
            .transaction('keyval', 'readonly')
            .objectStore('keyval')
            .get('photorequest-draft-v1');
          draft.onsuccess = () => resolve(draft.result.order.photos.length);
          draft.onerror = reject;
        };
      }),
  );
  expect(photos).toBe(3);
  await mkdir('tmp', { recursive: true });
  await page.screenshot({ path: 'tmp/startup-recovery.png' });
  await page.getByRole('button', { name: 'Open installation help' }).click();
  await expect(page.locator('body')).toContainText('INSTALLATION AND STARTUP HELP');
  await expect(page.locator('body')).toContainText('Evergreen Standalone Runtime');
});

test('blocked local storage shows an error recovery screen rather than a blank window', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage access was blocked by system policy');
    };
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'PhotoRequest could not finish opening' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your saved order has not been cleared');
  await page.getByText('Technical details for support', { exact: true }).click();
  await expect(page.locator('pre')).toContainText('Storage access was blocked');
});
