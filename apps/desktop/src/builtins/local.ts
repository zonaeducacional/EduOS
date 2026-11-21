import { invoke, isTauri } from '@tauri-apps/api/core';

export async function saveText(name: string, text: string): Promise<boolean> {
  if (isTauri()) return invoke<boolean>('builtin_save_text', { name, text });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function readSaved<T>(read: (key: string) => string | null, key: string, fallback: T): T {
  try { return JSON.parse(read(key) ?? 'null') as T ?? fallback; }
  catch { return fallback; }
}
