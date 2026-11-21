import { describe, expect, it } from 'vitest';
import { calculate, fit, parseTheme, resize, searchKey, transition } from './index';
import type { Desktop } from './index';

const rect = { x: 60, y: 40, width: 400, height: 300 };
const area = { width: 640, height: 420 };

function twoWindows() {
  const empty: Desktop = { windows: [], active: null };
  const notes = transition(empty, { type: 'open', id: 'notes', rect });
  return transition(notes, { type: 'open', id: 'calculator', rect });
}

describe('gerenciamento de janelas', () => {
  it('traz uma única instância para frente ao reabrir', () => {
    const desktop = transition(twoWindows(), { type: 'open', id: 'notes', rect });
    expect(desktop.active).toBe('notes');
    expect(desktop.windows.map(({ id }) => id)).toEqual(['calculator', 'notes']);
  });

  it('minimiza pela barra de tarefas, foca a outra janela e restaura', () => {
    const minimized = transition(twoWindows(), { type: 'task', id: 'calculator' });
    expect(minimized.active).toBe('notes');
    expect(minimized.windows.find(({ id }) => id === 'calculator')?.minimized).toBe(true);
    const restored = transition(minimized, { type: 'task', id: 'calculator' });
    expect(restored.active).toBe('calculator');
    expect(restored.windows.at(-1)?.minimized).toBe(false);
  });

  it('mantém a geometria ao maximizar e restaurar', () => {
    const moved = { ...rect, x: 100 };
    const desktop = transition(twoWindows(), { type: 'geometry', id: 'calculator', rect: moved });
    const maximized = transition(desktop, { type: 'maximize', id: 'calculator' });
    expect(maximized.windows.at(-1)?.maximized).toBe(true);
    const restored = transition(maximized, { type: 'maximize', id: 'calculator' });
    expect(restored.windows.at(-1)).toMatchObject({ rect: moved, maximized: false });
  });

  it('não foca janelas minimizadas ao fechar a janela ativa', () => {
    const minimized = transition(twoWindows(), { type: 'minimize', id: 'notes' });
    const closed = transition(minimized, { type: 'close', id: 'calculator' });
    expect(closed.active).toBeNull();
    expect(closed.windows.map(({ id }) => id)).toEqual(['notes']);
  });

  it('limita posição e dimensões ao espaço disponível', () => {
    expect(fit({ ...rect, x: 900, y: -10 }, area)).toEqual({ ...rect, x: 240, y: 0 });
    expect(resize(rect, 800, -900, area)).toEqual({ ...rect, width: 580, height: 235 });
    expect(fit(rect, { width: 240, height: 190 })).toEqual({ x: 0, y: 0, width: 240, height: 190 });
  });
});

describe('preferências e apps', () => {
  it('interpreta as preferências conhecidas e usa o tema claro como padrão', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('contrast')).toBe('contrast');
    expect(parseTheme('inválido')).toBe('light');
    expect(parseTheme(null)).toBe('light');
  });

  it('normaliza termos de busca com acentos e maiúsculas', () => {
    expect(searchKey('  MATEMÁTICA ')).toBe('matematica');
  });

  it('calcula as quatro operações e trata divisão por zero', () => {
    expect(calculate(.1, .2, '+')).toBe(.3);
    expect(calculate(3, 5, '−')).toBe(-2);
    expect(calculate(7, 6, '×')).toBe(42);
    expect(calculate(7, 2, '÷')).toBe(3.5);
    expect(calculate(7, 0, '÷')).toBeNull();
  });
});
