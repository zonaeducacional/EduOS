<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import { File, Folder } from 'lucide-svelte';

  let { profileId }: { profileId: string } = $props();
  type Entry = { name: string; folder: boolean };
  type Action = { type: 'list' | 'import' } | { type: 'create' | 'export'; name: string } | { type: 'rename'; original: string; name: string };

  const native = isTauri();
  let path = $state<string[]>([]);
  let entries = $state<Entry[]>([]);
  let busy = $state(false);
  let composer = $state<'create' | 'rename' | null>(null);
  let original = $state('');
  let name = $state('');
  let error = $state('');

  async function run(action: Action, nextPath = path) {
    if (busy || !native) return;
    busy = true;
    error = '';
    try {
      entries = await invoke<Entry[]>('builtin_files', { profile: profileId, path: nextPath, action });
      path = nextPath;
      if (action.type === 'rename' || action.type === 'create' || action.type === 'list') composer = null;
    } catch (cause) { error = typeof cause === 'string' ? cause : 'Operação de arquivos indisponível.'; }
    finally { busy = false; }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (composer === 'rename') void run({ type: 'rename', original, name: name.trim() });
    else void run({ type: 'create', name: name.trim() });
  }

  onMount(() => { void run({ type: 'list' }); });
</script>

<div class="app-content builtin-tool">
  {#if !native}<p>Abra o EduOS no Tauri para acessar os arquivos do perfil.</p>
  {:else}
    <div class="shop-actions">
      <button class="catalog-secondary" disabled={busy || !path.length} type="button" onclick={() => run({ type: 'list' }, path.slice(0, -1))}>Voltar</button>
      <button class="catalog-secondary" disabled={busy} type="button" onclick={() => { composer = 'create'; name = ''; }}>Nova pasta</button>
      <button class="catalog-secondary" disabled={busy} type="button" onclick={() => run({ type: 'import' })}>Importar arquivo</button>
    </div>
    <p class="external-text">Arquivos do perfil{path.length ? ` / ${path.join(' / ')}` : ''}</p>
    {#if composer}
      <form class="shop-actions" onsubmit={submit}>
        <label>Nome <input required maxlength={100} bind:value={name} /></label>
        <button class="catalog-secondary" disabled={busy} type="submit">Salvar nome</button>
        <button class="catalog-secondary" disabled={busy} type="button" onclick={() => { composer = null; }}>Cancelar</button>
      </form>
    {/if}
    <div class="builtin-list">
      {#each entries as entry (entry.name)}
        <div class="builtin-row">
          {#if entry.folder}
            <button type="button" class="catalog-secondary" disabled={busy} onclick={() => run({ type: 'list' }, [...path, entry.name])}><Folder size={16} /> {entry.name}</button>
          {:else}<span><File size={16} /> {entry.name}</span>{/if}
          <button type="button" class="catalog-secondary" disabled={busy} aria-label={`Renomear ${entry.name}`} onclick={() => { composer = 'rename'; original = entry.name; name = entry.name; }}>Renomear</button>
          {#if !entry.folder}<button type="button" class="catalog-secondary" disabled={busy} aria-label={`Exportar ${entry.name}`} onclick={() => run({ type: 'export', name: entry.name })}>Exportar</button>{/if}
        </div>
      {:else}<p class="app-status">{busy ? 'Carregando…' : 'Pasta vazia.'}</p>{/each}
    </div>
    {#if error}<p class="app-status" role="alert">{error}</p>{/if}
  {/if}
</div>
