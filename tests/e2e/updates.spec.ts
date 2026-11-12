import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('photorequest-order-mode', 'all'));
});

async function nativeMock(page: Page, scenario: 'available' | 'auth_required') {
  await page.addInitScript(
    ({ scenario }) => {
      const w = window as unknown as Record<string, any>;
      w.isTauri = true;
      w.updateScenario = scenario;
      w.installCalls = 0;
      w.savedToken = '';
      w.checked = 0;
      let next = 1;
      const callbacks = new Map<number, (event: unknown) => void>();
      w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      w.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(callback: (event: unknown) => void) {
          const id = next++;
          callbacks.set(id, callback);
          return id;
        },
        async invoke(command: string, args: Record<string, unknown>) {
          if (command === 'plugin:event|listen') return next++;
          if (command === 'plugin:event|unlisten') return;
          if (command === 'get_build_info')
            return {
              version: '0.3.10',
              commit: '1'.repeat(40),
              shortCommit: '1111111',
              buildNumber: 10,
            };
          if (command === 'check_app_update') {
            w.checked++;
            if (w.updateScenario === 'auth_required')
              return {
                status: 'auth_required',
                credentialSource: 'none',
                message: 'Sign in with GitHub CLI or save a read-only GitHub token.',
              };
            return {
              status: 'available',
              credentialSource: w.savedToken ? 'saved_token' : 'github_cli',
              message: 'A signed update is available.',
              version: '0.3.11',
              commit: '2'.repeat(40),
              buildNumber: 11,
              notes: 'Commit 2222222',
            };
          }
          if (command === 'save_update_token') {
            w.savedToken = args.token;
            w.updateScenario = 'available';
            return;
          }
          if (command === 'forget_update_token') {
            w.savedToken = '';
            w.updateScenario = 'auth_required';
            return;
          }
          if (command === 'install_app_update') {
            w.installCalls++;
            w.installCommit = args.expectedCommit;
            w.draftBeforeInstall = await new Promise((resolve, reject) => {
              const request = indexedDB.open('keyval-store');
              request.onerror = reject;
              request.onsuccess = () => {
                const read = request.result
                  .transaction('keyval', 'readonly')
                  .objectStore('keyval')
                  .get('photorequest-draft-v1');
                read.onsuccess = () => resolve(read.result);
                read.onerror = reject;
              };
            });
            throw 'Restart deferred by test';
          }
          throw new Error(`Unexpected native test command: ${command}`);
        },
      };
    },
    { scenario },
  );
}

test('automatically finds a commit update and saves the active order before installing', async ({
  page,
}) => {
  await nativeMock(page, 'available');
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a sample order' }).click();
  await expect(page.locator('.photo-card')).toHaveCount(3);
  await page.getByLabel('ORDER NAME', { exact: true }).fill('Unfinished order');
  await page.getByLabel('Order notes').fill('Keep this latest edit before restarting.');
  await expect(page.getByRole('button', { name: /Update available/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect.poll(() => page.evaluate(() => (window as any).installCalls)).toBe(0);
  await page.getByRole('button', { name: /Update available/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Updates', exact: true });
  await expect(dialog).toContainText('Commit 1111111');
  await expect(dialog).toContainText('Update available: commit 2222222');
  await expect(dialog).toContainText('GitHub CLI sign-in');
  await dialog
    .getByRole('checkbox', { name: 'Automatically check on startup and every 12 hours' })
    .uncheck();
  expect(await page.evaluate(() => localStorage.getItem('photorequest-auto-updates'))).toBe(
    'false',
  );
  await page.screenshot({ path: 'tmp/app-updates.png' });
  await dialog.getByRole('button', { name: 'Install and restart' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Restart deferred by test');
  const stored = await page.evaluate(() => ({
    draft: (window as any).draftBeforeInstall,
    commit: (window as any).installCommit,
  }));
  expect(stored.draft.order.name).toBe('Unfinished order');
  expect(stored.draft.order.notes).toBe('Keep this latest edit before restarting.');
  expect(stored.draft.order.photos).toHaveLength(3);
  expect(stored.commit).toBe('2'.repeat(40));
  await dialog.getByRole('button', { name: 'Close updates' }).click();
  await expect(page.getByLabel('ORDER NAME', { exact: true })).toBeEnabled();
});

test('keeps private update credentials out of local storage and order data', async ({ page }) => {
  await nativeMock(page, 'auth_required');
  await page.goto('/');
  await page.getByRole('button', { name: /^Updates/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Updates', exact: true });
  await expect(dialog).toContainText('GitHub sign-in required');
  const token = 'github_pat_fake_test_credential';
  const field = dialog.getByLabel('GitHub update token');
  await expect(field).toHaveAttribute('type', 'password');
  await field.fill(token);
  await dialog.getByRole('button', { name: 'Save token securely' }).click();
  await expect(field).toHaveValue('');
  await expect(dialog).toContainText('system credential store');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(token);
  await dialog.getByRole('button', { name: 'Remove saved token' }).click();
  await expect(dialog).toContainText('GitHub sign-in required');
});

test('browser preview explains that updates require the desktop app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Updates/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Updates', exact: true });
  await expect(dialog).toContainText('Install the desktop app to use automatic updates.');
  await expect(dialog.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
});
