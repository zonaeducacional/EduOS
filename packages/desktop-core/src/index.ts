export const gameAppIds = ['jogo-dos-pontinhos', 'quadro-de-poesia'] as const;
export const puterAppIds = ['puter-notes', 'puter-email', 'puter-photo-studio', 'puter-video-studio', 'puter-audio-studio', 'puter-music-studio'] as const;
export const builtinAppIds = ['notes', 'calculator', 'markdown', 'schedule', 'draw', 'bookmarks', 'recorder', 'files', 'escola-office', ...puterAppIds, 'biblioteca', 'grade-management', 'mini-browser', ...gameAppIds] as const;
export type BuiltinAppId = typeof builtinAppIds[number];
export type AppId = BuiltinAppId | `external-${string}`;
export type Theme = 'light' | 'dark' | 'contrast';
export type Area = { width: number; height: number };
export type Rect = Area & { x: number; y: number };
export type AppWindow = { id: AppId; rect: Rect; minimized: boolean; maximized: boolean };
export type Desktop = { windows: AppWindow[]; active: AppId | null };
type Action =
  | { type: 'open'; id: AppId; rect: Rect }
  | { type: 'activate' | 'task' | 'close' | 'minimize' | 'maximize'; id: AppId }
  | { type: 'geometry'; id: AppId; rect: Rect };

export const themes = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
  { id: 'contrast', label: 'Alto contraste' },
] as const;

export function parseTheme(value: string | null): Theme {
  return themes.find((theme) => theme.id === value)?.id ?? 'light';
}

export function searchKey(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function fit(rect: Rect, area: Area): Rect {
  const width = clamp(rect.width, Math.min(300, area.width), area.width);
  const height = clamp(rect.height, Math.min(235, area.height), area.height);
  return {
    x: clamp(rect.x, 0, area.width - width),
    y: clamp(rect.y, 0, area.height - height),
    width,
    height,
  };
}

export function resize(rect: Rect, dx: number, dy: number, area: Area): Rect {
  return fit({
    ...rect,
    width: Math.min(rect.width + dx, area.width - rect.x),
    height: Math.min(rect.height + dy, area.height - rect.y),
  }, area);
}

export function transition(state: Desktop, action: Action): Desktop {
  const current = state.windows.find((window) => window.id === action.id);
  const others = state.windows.filter((window) => window.id !== action.id);
  const front = (window: AppWindow): Desktop => ({
    windows: [...others, { ...window, minimized: false }],
    active: window.id,
  });
  const fallback = () => others.slice().reverse().find((window) => !window.minimized)?.id ?? null;

  if (action.type === 'open') {
    return front(current ?? { id: action.id, rect: action.rect, minimized: false, maximized: false });
  }
  if (!current) return state;

  switch (action.type) {
    case 'activate':
      return front(current);
    case 'task':
      if (state.active !== current.id) return front(current);
      return transition(state, { type: 'minimize', id: current.id });
    case 'close':
      return { windows: others, active: state.active === current.id ? fallback() : state.active };
    case 'minimize':
      return {
        windows: state.windows.map((window) => window.id === current.id ? { ...window, minimized: true } : window),
        active: state.active === current.id ? fallback() : state.active,
      };
    case 'maximize':
      return front({ ...current, maximized: !current.maximized });
    case 'geometry':
      return {
        ...state,
        windows: state.windows.map((window) => window.id === current.id ? { ...window, rect: action.rect } : window),
      };
  }
}

export type Operator = '+' | '−' | '×' | '÷';

export function calculate(left: number, right: number, operator: Operator): number | null {
  const result = { '+': () => left + right, '−': () => left - right, '×': () => left * right, '÷': () => left / right }[operator]();
  return Number.isFinite(result) ? Number(result.toPrecision(12)) : null;
}
