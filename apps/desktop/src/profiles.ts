import { builtinAppIds } from '@eduos/desktop-core';
import type { BuiltinAppId } from '@eduos/desktop-core';
import { readLocal, writeLocal } from './storage';
import { isLocalImage } from './wallpaper';

export const roleLabels = { administrator: 'Administrador', teacher: 'Professor', student: 'Estudante' } as const;
export const memberRoles = ['teacher', 'student'] as const;
export type MemberRole = typeof memberRoles[number];
export type Profile = { id: string; name: string; role: 'administrator' | MemberRole; enabled: boolean; avatar?: string };
export type ProfileDatabase = {
  builtinVersion: 8;
  credential: { salt: string; hash: string };
  profiles: Profile[];
  allowed: Record<MemberRole, BuiltinAppId[]>;
};

const databaseKey = 'profiles';
const adminId = 'administrator';
const appIds = builtinAppIds;
const encoder = new TextEncoder();
const asHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validProfile(value: unknown): value is Profile {
  if (!record(value)) return false;
  return typeof value.id === 'string' && typeof value.name === 'string' &&
    typeof value.enabled === 'boolean' &&
    (value.avatar === undefined || (isLocalImage(value.avatar) && value.avatar.length <= 65_000)) &&
    (value.id === adminId ? value.role === 'administrator' && value.enabled : memberRoles.some((role) => role === value.role));
}

function validAppList(value: unknown): value is BuiltinAppId[] {
  return Array.isArray(value) && value.every((item) => appIds.includes(item));
}

export function loadProfiles(): ProfileDatabase | null {
  const stored = readLocal(databaseKey);
  if (stored === null) return null;
  const data: unknown = JSON.parse(stored);
  if (!record(data) || !record(data.credential) || !record(data.allowed) ||
    typeof data.credential.salt !== 'string' || !/^[a-f0-9]{32}$/.test(data.credential.salt) ||
    typeof data.credential.hash !== 'string' || !/^[a-f0-9]{64}$/.test(data.credential.hash) ||
    !Array.isArray(data.profiles) || !data.profiles.every(validProfile) ||
    !data.profiles.some(({ id }) => id === adminId) ||
    new Set(data.profiles.map(({ id }) => id)).size !== data.profiles.length ||
    !validAppList(data.allowed.teacher) || !validAppList(data.allowed.student)) {
    throw new Error('Os dados dos perfis locais estão inválidos.');
  }
  const existingCatalog = data.builtinVersion === 8 ? appIds.length
    : data.builtinVersion === 7 ? appIds.indexOf('jogo-dos-pontinhos')
    : data.builtinVersion === 6 ? appIds.indexOf('mini-browser')
    : data.builtinVersion === 5 ? appIds.indexOf('grade-management')
    : data.builtinVersion === 4 ? appIds.indexOf('biblioteca')
    : data.builtinVersion === 3 ? appIds.indexOf('puter-notes')
      : data.builtinVersion === 2 ? appIds.indexOf('escola-office')
        : 2;
  function enabledFor(saved: BuiltinAppId[]) {
    return Array.from(new Set([...saved, ...appIds.slice(existingCatalog)]));
  }

  return {
    builtinVersion: 8,
    profiles: data.profiles,
    credential: { salt: data.credential.salt, hash: data.credential.hash },
    allowed: { teacher: enabledFor(data.allowed.teacher), student: enabledFor(data.allowed.student) },
  };
}

export function saveProfiles(database: ProfileDatabase): boolean {
  return writeLocal(databaseKey, JSON.stringify(database));
}

export function profileStorage(id: string) {
  const prefix = id === adminId ? '' : `profile.${id}.`;
  return {
    read: (key: string) => readLocal(`${prefix}${key}`),
    write: (key: string, value: string) => writeLocal(`${prefix}${key}`, value),
  };
}

async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt: encoder.encode(salt), iterations: 600_000, hash: 'SHA-256',
  }, key, 256);
  return asHex(new Uint8Array(bytes));
}

export async function createProfiles(password: string): Promise<ProfileDatabase> {
  const salt = asHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(password, salt);
  const database: ProfileDatabase = {
    builtinVersion: 8,
    credential: { salt, hash },
    profiles: [{ id: adminId, name: roleLabels.administrator, role: 'administrator', enabled: true }],
    allowed: { teacher: [...appIds], student: [...appIds] },
  };
  if (!saveProfiles(database)) throw new Error('Não foi possível salvar o perfil Administrador.');
  return database;
}

export async function verifyPassword(credential: ProfileDatabase['credential'], password: string): Promise<boolean> {
  const hash = await passwordHash(password, credential.salt);
  let difference = 0;
  for (let index = 0; index < hash.length; index++) {
    difference |= hash.charCodeAt(index) ^ credential.hash.charCodeAt(index);
  }
  return difference === 0;
}
