<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { profileStorage } from '../profiles';
  import { readSaved } from './local';

  type Bookmark = { id: string; title: string; value: string; kind: 'link' | 'page' };
  let { storage }: { storage: ReturnType<typeof profileStorage> } = $props();
  function initial() { return readSaved<Bookmark[]>(storage.read, 'bookmarks', []); }
  let entries = $state(initial());
  let title = $state('');
  let url = $state('');
  let selected = $state<Bookmark | null>(null);
  let status = $state('');
  let busy = $state(false);
  let active = true;
  onDestroy(() => { active = false; });

  function write(next: Bookmark[]) {
    if (!storage.write('bookmarks', JSON.stringify(next))) {
      status = 'O armazenamento local está cheio ou indisponível.';
      return false;
    }
    entries = next;
    return true;
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    try {
      const link = new URL(url.trim());
      if (!['https:', 'http:'].includes(link.protocol)) throw new Error();
      if (write([...entries, { id: crypto.randomUUID(), title: title.trim() || link.hostname, value: link.href, kind: 'link' }])) {
        title = ''; url = ''; status = 'Marcador salvo.';
      }
    } catch { status = 'Informe um endereço HTTP ou HTTPS válido.'; }
  }

  async function importPage(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy) return;
    if (file.size > 512_000) { status = 'Escolha uma página HTML de até 512 KB.'; return; }
    busy = true;
    try {
      const source = await file.text();
      const document = new DOMParser().parseFromString(source, 'text/html');
      document.querySelectorAll('script,style,noscript,template,iframe').forEach((node) => node.remove());
      const content = document.body.textContent?.replace(/\n{3,}/g, '\n\n').trim() ?? '';
      if (!active) return;
      const entry: Bookmark = { id: crypto.randomUUID(), kind: 'page', title: document.title || file.name, value: content };
      if (write([...entries, entry])) { selected = entry; status = 'Página disponível offline como texto.'; }
    } catch { status = 'Não foi possível ler a página.'; }
    finally { busy = false; }
  }

  function remove(entry: Bookmark) {
    if (write(entries.filter(({ id }) => id !== entry.id))) {
      if (selected?.id === entry.id) selected = null;
      status = 'Item removido.';
    }
  }
</script>

<div class="app-content builtin-tool">
  <form class="builtin-form" onsubmit={add}>
    <label>Nome<input bind:value={title} maxlength={100} placeholder="Nome do marcador" /></label>
    <label>Endereço<input type="url" bind:value={url} maxlength={2048} required placeholder="https://…" /></label>
    <button class="catalog-secondary" type="submit">Salvar marcador</button>
  </form>
  <label class="builtin-file catalog-secondary">Importar página HTML<input aria-label="Importar página HTML" type="file" accept=".html,.htm,text/html" disabled={busy} onchange={importPage} /></label>
  <div class="builtin-list">
    {#each entries as entry (entry.id)}
      <div class="builtin-row"><button class="catalog-secondary" type="button" onclick={() => { selected = entry; }}>{entry.title}</button>
        <button class="catalog-secondary" type="button" aria-label={`Remover ${entry.title}`} onclick={() => remove(entry)}>Remover</button></div>
    {:else}<p class="app-status">Nenhum marcador ou página salva.</p>{/each}
  </div>
  {#if selected}
    <h2>{selected.title}</h2>
    <p class="external-text">{selected.value}</p>
  {/if}
  {#if status}<p class="app-status" role="status">{status}</p>{/if}
</div>
