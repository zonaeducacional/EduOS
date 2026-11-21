<script lang="ts">
  import { Delete } from 'lucide-svelte';
  import { calculate } from '@eduos/desktop-core';
  import type { Operator } from '@eduos/desktop-core';

  const keys = ['C', '±', '⌫', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '='];
  const operators: Operator[] = ['+', '−', '×', '÷'];
  const labels: Record<string, string> = {
    C: 'Limpar', '±': 'Trocar sinal', '⌫': 'Apagar dígito', '÷': 'Dividir', '×': 'Multiplicar',
    '−': 'Subtrair', '+': 'Somar', ',': 'Vírgula decimal', '=': 'Calcular resultado',
  };

  let entry = $state('0');
  let left = $state<number | null>(null);
  let operator = $state<Operator | null>(null);
  let fresh = $state(false);
  let equation = $state('');

  function clear() {
    entry = '0';
    left = null;
    operator = null;
    fresh = false;
    equation = '';
  }

  function commit() {
    if (left === null || operator === null) return;
    equation = `${String(left).replace('.', ',')} ${operator} ${entry.replace('.', ',')} =`;
    const result = calculate(left, Number(entry), operator);
    entry = result === null ? 'Erro' : String(result);
    left = null;
    operator = null;
    fresh = true;
  }

  function press(key: string) {
    if (key === 'C') {
      clear();
      return;
    }
    if (entry === 'Erro') clear();
    const nextOperator = operators.find((item) => item === key);
    if (nextOperator) {
      if (!fresh) commit();
      if (entry === 'Erro') return;
      left = Number(entry);
      operator = nextOperator;
      fresh = true;
      equation = `${entry.replace('.', ',')} ${key}`;
      return;
    }
    if (key === '=') {
      commit();
      return;
    }
    if (key === '±') {
      if (operator && fresh) {
        entry = '-0';
        fresh = false;
      } else if (Number(entry) !== 0) {
        entry = entry.startsWith('-') ? entry.slice(1) : `-${entry}`;
      }
      return;
    }
    if (key === '⌫') {
      if (!fresh) entry = entry.slice(0, -1).replace(/^-$|^$/, '0');
      return;
    }
    if (fresh) {
      entry = '0';
      fresh = false;
      if (!operator) equation = '';
    }
    if (key === ',') {
      if (!entry.includes('.')) entry += '.';
    } else if (entry.length < 15) {
      entry = entry === '0' ? key : entry === '-0' ? `-${key}` : entry + key;
    }
  }

  function keyboard(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;
    const mapping: Record<string, string> = { '*': '×', '/': '÷', '-': '−', '.': ',', Enter: '=', Backspace: '⌫', Delete: 'C' };
    const key = mapping[event.key] ?? event.key;
    if (!keys.includes(key)) return;
    event.preventDefault();
    press(key);
  }
</script>

<div class="calculator app-content" role="group" aria-label="Teclado da calculadora">
  <div class="calc-display">
    <span>{equation || 'Modo padrão'}</span>
    <output aria-label="Visor">{entry.replace('.', ',')}</output>
  </div>
  <div class="calc-keys">
    {#each keys as key (key)}
      <button class:equals={key === '='} class:zero={key === '0'} class:operator={operators.some((item) => item === key)}
        type="button" aria-label={labels[key] ?? key} onkeydown={keyboard} onclick={() => press(key)}>
        {#if key === '⌫'}<Delete size={18} />{:else}{key}{/if}
      </button>
    {/each}
  </div>
</div>
