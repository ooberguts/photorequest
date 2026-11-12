import { isTauri, invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { blobOf } from './images';

export async function saveFile(
  data: Uint8Array,
  filename: string,
  type: 'zip' | 'pdf' | 'json',
): Promise<boolean> {
  if (isTauri()) {
    const path = await save({
      defaultPath: filename,
      filters: [
        {
          name:
            type === 'zip'
              ? 'PhotoRequest order'
              : type === 'json'
                ? 'Printer paper list'
                : 'Print-ready PDF',
          extensions: [type],
        },
      ],
    });
    if (!path) return false;
    await writeFile(path, data);
  } else {
    const url = URL.createObjectURL(
      blobOf(
        data,
        type === 'pdf'
          ? 'application/pdf'
          : type === 'json'
            ? 'application/json'
            : 'application/zip',
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return true;
}

export async function openPrintPdf(data: Uint8Array) {
  if (isTauri()) {
    // The native command can only open PDFs it creates in the app's temporary folder.
    await invoke('open_print_pdf', data);
  } else {
    const url = URL.createObjectURL(blobOf(data, 'application/pdf'));
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 300_000);
  }
}
