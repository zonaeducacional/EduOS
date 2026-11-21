export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(`eduos.${key}.v1`);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(`eduos.${key}.v1`, value);
    return true;
  } catch {
    return false;
  }
}
