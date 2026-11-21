<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type { Permission, Role } from './store-types';

  let { id, version, role }: { id: string; version: string; role: Role } = $props();
  type Field = { id: string; label: string; value: string };
  type Button = { id: string; label: string; text: string; effect: 'none' | 'resource_read' | Permission };
  type View = { text: string; fields: Field[]; buttons: Button[]; state: unknown };
  type Response = { view: View; permissions: Permission[]; notification: string | null };

  let result = $state<Response | null>(null);
  let fields = $state<Record<string, string>>({});
  let busy = $state(false);
  let failure = $state('');

  async function send(button?: Button) {
    if (busy) return;
    busy = true;
    failure = '';
    try {
      result = await invoke<Response>('runtime_event', {
        id, version, profile: role, effect: button?.effect ?? 'none', data: button?.text ?? '',
        event: { action: button?.id ?? 'start', fields, state: result?.view.state ?? null },
      });
      fields = Object.fromEntries(result.view.fields.map((field) => [field.id, field.value]));
    } catch (error) {
      failure = typeof error === 'string' ? error : 'Não foi possível executar o aplicativo.';
    } finally {
      busy = false;
    }
  }

  onMount(() => { void send(); });
</script>

<div class="app-content external-app">
  {#if result}
    <p class="external-text">{result.view.text}</p>
    {#each result.view.fields as field (field.id)}
      <label>{field.label}<input type="text" maxlength={1000} bind:value={fields[field.id]} /></label>
    {/each}
    <div class="shop-actions">
      {#each result.view.buttons as button (button.id)}
        <button class="catalog-secondary" type="button" disabled={busy || (button.effect !== 'none' && button.effect !== 'resource_read' && !result.permissions.includes(button.effect))}
          onclick={() => send(button)}>{button.label}</button>
      {/each}
    </div>
    {#if result.notification}<p role="status">{result.notification}</p>{/if}
  {:else if busy}
    <p role="status">Abrindo aplicativo…</p>
  {/if}
  {#if failure}<p class="external-error" role="alert">{failure}</p>{/if}
</div>
