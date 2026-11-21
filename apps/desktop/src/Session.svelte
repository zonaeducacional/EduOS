<script lang="ts">
  import App from './App.svelte';
  import Intro from './Intro.svelte';
  import ProfileGateway from './ProfileGateway.svelte';
  import ProfileManager from './ProfileManager.svelte';
  import Shop from './Shop.svelte';
  import Catalog from './Catalog.svelte';
  import { tick } from 'svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import { loadProfiles, saveProfiles } from './profiles';
  import type { ProfileDatabase } from './profiles';

  function initialize() {
    try {
      return { initial: loadProfiles(), loadError: '' };
    } catch {
      return { initial: null, loadError: 'Não foi possível abrir os perfis salvos neste dispositivo.' };
    }
  }

  const { initial, loadError } = initialize();
  let database = $state.raw(initial);
  let intro = $state(true);
  let activeId = $state<string | null>(null);
  let managing = $state(false);
  let shop = $state(false);
  let catalog = $state(false);
  let switchError = $state('');
  let switching = $state(false);
  let active = $derived(database?.profiles.find(({ id, enabled }) => id === activeId && enabled));

  function created(value: ProfileDatabase) {
    database = value;
    activeId = value.profiles[0].id;
  }

  async function switchProfile() {
    if (switching) return;
    switchError = '';
    if (activeId && isTauri()) {
      const profile = activeId;
      switching = true;
      try {
        if (!await invoke<boolean>('native_app_can_switch', { profile })) {
          switchError = 'Feche o navegador ou os aplicativos de Educação abertos antes de trocar de perfil.';
          return;
        }
        void invoke('builtin_close_office', { profile }).catch(() => {});
        void invoke('vibelab_close', { profile }).catch(() => {});
        void invoke('builtin_close_bundled', { profile }).catch(() => {});
      } catch {
        switchError = 'Não foi possível trocar de perfil.';
        return;
      } finally {
        switching = false;
      }
    }
    managing = false;
    shop = false;
    catalog = false;
    activeId = null;
  }

  function openProfiles() {
    if (active?.role === 'administrator') managing = true;
    else switchProfile();
  }

  async function closeCatalog() {
    catalog = false;
    await tick();
    document.querySelector<HTMLButtonElement>('[data-catalog-control]')?.focus();
  }

  function save(value: ProfileDatabase): boolean {
    if (active?.role !== 'administrator' || !saveProfiles(value)) return false;
    database = value;
    return true;
  }
</script>

{#if intro}
  <Intro onfinish={() => { intro = false; }} />
{/if}

{#if database && active}
  {#key active.id}
    <App profile={active} allowed={active.role === 'administrator' ? undefined : database.allowed[active.role]}
      suspended={managing || catalog || switching} onprofiles={openProfiles} oncatalog={() => { catalog = true; }} />
  {/key}
  {#if catalog}<Catalog role={active.role} profileId={active.id} onback={closeCatalog} />{/if}
  {#if managing && active.role === 'administrator'}
    {#if shop}
      <Shop onback={() => { shop = false; }} />
    {:else}
      <ProfileManager {database} onsave={save} onback={() => { managing = false; }} onswitch={switchProfile} onshop={() => { shop = true; }} />
    {/if}
  {/if}
{:else}
  <ProfileGateway {database} {loadError} suspended={intro} oncreate={created} onenter={(id) => { activeId = id; }} />
{/if}

{#if switchError}
  <div class="profile-switch-notice" role="status">{switchError}</div>
{/if}

<style>
  .profile-switch-notice {
    position: fixed;
    z-index: 20;
    inset-inline: 16px;
    bottom: 76px;
    width: fit-content;
    max-width: calc(100% - 32px);
    margin-inline: auto;
    border-radius: 10px;
    padding: 10px 14px;
    background: #252244;
    color: white;
  }
</style>
