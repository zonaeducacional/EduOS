<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Globe, Package, Search, Store } from 'lucide-svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import { searchKey } from '@eduos/desktop-core';
  import { permissionNames } from './store-types';
  import type { CatalogEntry, Role } from './store-types';

  let { role, profileId, onback }: { role: Role; profileId: string; onback: () => void } = $props();
  const webCatalog = import.meta.env.VITE_EDUOS_WEB_STORE_URL?.trim();
  let entries = $state<CatalogEntry[]>([]);
  let query = $state('');
  let selected = $state<CatalogEntry | null>(null);
  let busy = $state(false);
  let failure = $state('');
  let success = $state('');
  let results = $derived(entries.filter(({ manifest }) => searchKey(manifest.name + ' ' + manifest.id).includes(searchKey(query))));

  async function load() {
    if (isTauri()) entries = await invoke<CatalogEntry[]>('catalog_list', { profile: role });
  }

  async function run(operation: () => Promise<void>) {
    busy = true;
    failure = '';
    success = '';
    try { await operation(); }
    catch (error) { failure = typeof error === 'string' ? error : 'Não foi possível consultar a Lojinha.'; }
    finally { busy = false; }
  }

  onMount(() => { void run(load); });

  function openWebCatalog() {
    if (!webCatalog) {
      failure = 'O endereço da Lojinha online ainda não foi configurado.';
      return;
    }
    if (!isTauri()) {
      try {
        const url = new URL(webCatalog);
        if (url.protocol !== 'https:' && !(import.meta.env.DEV && url.protocol === 'http:' && url.hostname === '127.0.0.1')) {
          throw new Error('Endereço inválido.');
        }
        window.open(url.href, '_blank', 'noopener,noreferrer');
      } catch {
        failure = 'O endereço da Lojinha online é inválido.';
      }
      return;
    }
    void run(async () => {
      await invoke('native_app_open', { id: 'mini-browser', profile: profileId, url: webCatalog });
    });
  }

  function install(entry: CatalogEntry) {
    void run(async () => {
      await invoke('catalog_install', { id: entry.manifest.id, version: entry.manifest.version, profile: role, consent: entry.consent });
      selected = null;
      await load();
      success = `${entry.manifest.name} ${entry.manifest.version} instalado neste dispositivo.`;
    });
  }
</script>

<section class="catalog" aria-labelledby="catalog-title">
  <header class="catalog-header">
    <button class="icon-button" type="button" aria-label="Voltar à área de trabalho" disabled={busy} {@attach (element) => { element.focus(); }} onclick={onback}><ArrowLeft size={20} /></button>
    <div><h1 id="catalog-title"><Store size={24} /> Lojinha</h1><p>Pacotes locais</p></div>
    <label class="search"><Search size={17} /><input type="search" bind:value={query} aria-label="Buscar na Lojinha" placeholder="Buscar aplicativos" /></label>
  </header>
  <div class="shop-actions">
    <button class="catalog-secondary" type="button" disabled={busy} onclick={openWebCatalog}><Globe size={16} /> Vitrine online</button>
  </div>
  {#if failure}<p class="catalog-feedback" role="alert">{failure}</p>{/if}
  {#if success}<p class="catalog-feedback" role="status">{success}</p>{/if}
  {#if selected}
    <section class="catalog-review" aria-label="Confirmar instalação">
      <h2>{selected.manifest.name} {selected.manifest.version}</h2>
      <p>{selected.installed_version ? 'Atualização publicada pelo administrador.' : 'Pacote publicado pelo administrador.'}</p>
      <h3>Permissões autorizadas</h3>
      {#if selected.consent.permissions.length}
        <ul>{#each selected.consent.permissions as permission (permission)}<li>{permissionNames[permission]}</li>{/each}</ul>
      {:else}
        <p>Sem permissões especiais.</p>
      {/if}
      <div class="shop-actions">
        <button class="catalog-secondary" type="button" disabled={busy} onclick={() => { selected = null; }}>Cancelar</button>
        <button class="start-button" type="button" disabled={busy} onclick={() => { if (selected) install(selected); }}>{selected.installed_version ? 'Confirmar atualização' : 'Confirmar instalação'}</button>
      </div>
    </section>
  {/if}
  {#if results.length}
    <div class="catalog-grid">
      {#each results as item (item.manifest.id)}
        <article class="catalog-card">
          <span class="catalog-icon"><Package size={23} /></span>
          <div><h2>{item.manifest.name}</h2><p>Versão {item.manifest.version}</p></div>
          {#if item.installable}
            <button class="start-button" type="button" disabled={busy}
              aria-label={`${item.installed_version ? 'Atualizar' : 'Instalar'} ${item.manifest.name}`}
              onclick={() => { selected = item; failure = ''; success = ''; }}>{item.installed_version ? 'Atualizar' : 'Instalar'}</button>
          {:else}
            <span class="catalog-installed">Instalado{item.installed_version ? ` · ${item.installed_version}` : ''}</span>
          {/if}
        </article>
      {/each}
    </div>
  {:else if busy}
    <p class="catalog-empty" role="status">Carregando aplicativos…</p>
  {:else}
    <p class="catalog-empty">{searchKey(query) ? 'Nenhum aplicativo encontrado.' : 'Nenhum aplicativo publicado para este perfil.'}</p>
  {/if}
</section>
