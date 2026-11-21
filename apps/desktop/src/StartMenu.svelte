<script lang="ts" module>
  import type { Store } from 'lucide-svelte';

  export type Category = 'development' | 'education' | 'office' | 'games' | 'collaboration' | 'graphics' | 'internet' | 'media' | 'system' | 'utilities';
  export type StartEntry = {
    id: string;
    name: string;
    description: string;
    tags: string;
    category: Category;
    icon: typeof Store;
    iconClass: string;
    open: () => void;
  };
</script>

<script lang="ts">
  import { Search, Star } from 'lucide-svelte';
  import { searchKey } from '@eduos/desktop-core';
  import type { profileStorage } from './profiles';

  let { entries, storage }: { entries: StartEntry[]; storage: ReturnType<typeof profileStorage> } = $props();
  const categories = [
    { id: 'development', label: 'Desenvolvimento' },
    { id: 'education', label: 'Educação' },
    { id: 'office', label: 'Escritório' },
    { id: 'collaboration', label: 'Colaboração' },
    { id: 'graphics', label: 'Gráficos' },
    { id: 'games', label: 'Jogos' },
    { id: 'internet', label: 'Internet' },
    { id: 'media', label: 'Multimídia' },
    { id: 'system', label: 'Sistema' },
    { id: 'utilities', label: 'Utilitários' },
    { id: 'all', label: 'Todos os aplicativos' },
    { id: 'favorites', label: 'Favoritos' },
  ] as const;

  function loadFavorites(): string[] {
    try {
      const value: unknown = JSON.parse(storage.read('start-favorites') ?? 'null');
      if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    } catch {
      // Use the initial favorites if the saved value cannot be read.
    }
    return ['notes', 'calculator', 'catalog'];
  }

  let favorites = $state(loadFavorites());
  let selected = $state<(typeof categories)[number]['id']>('all');
  let query = $state('');
  let failure = $state(false);
  let container: HTMLElement;

  let term = $derived(searchKey(query));
  let matching = $derived.by(() => {
    if (term) {
      return entries.filter((app) => searchKey(`${app.name} ${app.tags}`).includes(term))
        .sort((left, right) => Number(searchKey(right.name).startsWith(term)) - Number(searchKey(left.name).startsWith(term)));
    }
    if (selected === 'all') return entries;
    if (selected === 'favorites') return entries.filter((app) => favorites.includes(app.id));
    return entries.filter((app) => app.category === selected);
  });
  let heading = $derived(term ? 'Resultados da busca' : categories.find(({ id }) => id === selected)?.label);

  function toggleFavorite(app: StartEntry) {
    const updated = favorites.includes(app.id) ? favorites.filter((id) => id !== app.id) : [...favorites, app.id];
    failure = !storage.write('start-favorites', JSON.stringify(updated));
    if (failure) return;
    if (selected === 'favorites' && !term && !updated.includes(app.id)) {
      container.querySelector<HTMLButtonElement>('.start-category[aria-pressed="true"]')?.focus();
    }
    favorites = updated;
  }

  function searchKeys(event: KeyboardEvent) {
    if (event.key === 'Enter' && matching[0]) {
      event.preventDefault();
      matching[0].open();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      container.querySelector<HTMLButtonElement>('.menu-result')?.focus();
    }
  }
</script>

<section class="popover start-menu" id="start-menu" aria-label="Menu Iniciar" bind:this={container}>
  <label class="search"><Search size={19} /><input type="search" bind:value={query} onkeydown={searchKeys}
    {@attach (element) => { element.focus(); }} placeholder="Buscar aplicativos" aria-label="Buscar aplicativos" /></label>
  <div class="start-layout">
    <nav class="start-categories" aria-label="Categorias de aplicativos">
      {#each categories as category (category.id)}
        <button class="start-category" type="button" aria-pressed={selected === category.id && !term}
          onclick={() => { selected = category.id; query = ''; }}>{category.label}</button>
      {/each}
    </nav>
    <div class="start-results">
      <h2>{heading}</h2>
      {#each matching as app (app.id)}
        <div class="start-result-row">
          <button class="menu-result" type="button" onclick={app.open}>
            <span class="app-icon {app.iconClass}"><app.icon size={21} /></span>
            <span><strong>{app.name}</strong><small>{app.description}</small></span>
          </button>
          <button class="icon-button favorite-toggle" type="button" aria-pressed={favorites.includes(app.id)}
            aria-label={`Favorito: ${app.name}`} title={favorites.includes(app.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            onclick={() => toggleFavorite(app)}><Star size={18} fill={favorites.includes(app.id) ? 'currentColor' : 'none'} /></button>
        </div>
      {:else}
        <p class="empty" role="status">{term ? 'Nenhum aplicativo encontrado.' : selected === 'favorites' ? 'Nenhum aplicativo favorito.' : 'Nenhum aplicativo nesta categoria.'}</p>
      {/each}
      {#if failure}<p class="empty" role="alert">Não foi possível salvar os favoritos neste dispositivo.</p>{/if}
    </div>
  </div>
</section>
