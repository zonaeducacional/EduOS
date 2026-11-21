import type { Category } from './StartMenu.svelte';
import type { Profile } from './profiles';

export const permissionNames = {
  file_read: 'Ler arquivos',
  file_write: 'Gravar arquivos',
  clipboard_read: 'Ler a área de transferência',
  clipboard_write: 'Escrever na área de transferência',
  notifications: 'Exibir notificações',
};

export type Role = Profile['role'];
export type Permission = keyof typeof permissionNames;
export type Manifest = { id: string; name: string; version: string; entry: string; category?: Category; profiles: Role[]; permissions: Permission[]; window: { width: number; height: number } };
export type Consent = { profiles: Role[]; permissions: Permission[] };
export type CatalogEntry = { manifest: Manifest; consent: Consent; installed_version: string | null; installable: boolean };

export type RuntimeEntry = { manifest: Manifest };
