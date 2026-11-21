<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ArrowLeft, FolderOpen, KeyRound, PackageCheck, Store } from 'lucide-svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import { roleLabels } from './profiles';

  import { permissionNames } from './store-types';
  import type { CatalogEntry, Manifest, Permission, Role } from './store-types';

  type Candidate = { manifest: Manifest; fingerprint: string };
  type Installed = { manifest: Manifest; can_revert: boolean; trusted: boolean };
  type Session = { token: string; fingerprint: string };

  let { onback }: { onback: () => void } = $props();
  const native = isTauri();
  let initialized = $state<boolean | null>(null);
  let session = $state<Session | null>(null);
  let view = $state<'studio' | 'store'>('studio');
  let password = $state('');
  let confirmPassword = $state('');
  let exportPassword = $state('');
  let source = $state<Manifest | null>(null);
  let review = $state<Candidate | null>(null);
  let profiles = $state<Role[]>([]);
  let permissions = $state<Permission[]>([]);
  let installed = $state<Installed[]>([]);
  let publications = $state<CatalogEntry[]>([]);
  let removal = $state<Installed | null>(null);
  let busy = $state(false);
  let failure = $state('');
  let status = $state('');

  async function run(operation: () => Promise<void>) {
    if (busy) return;
    busy = true;
    failure = '';
    status = '';
    try { await operation(); }
    catch (error) { failure = typeof error === 'string' ? error : 'Não foi possível concluir a operação.'; }
    finally { busy = false; }
  }

  async function refresh() {
    if (!session) return;
    const token = session.token;
    [installed, publications] = await Promise.all([
      invoke<Installed[]>('shop_list', { token }),
      invoke<CatalogEntry[]>('shop_publications', { token }),
    ]);
  }

  onMount(() => {
    if (native) void run(async () => { initialized = await invoke<boolean>('shop_has_key'); });
  });

  onDestroy(() => {
    if (session) void invoke('shop_lock', { token: session.token }).catch(() => {});
  });

  function unlock(event: SubmitEvent) {
    event.preventDefault();
    if (!initialized && password !== confirmPassword) {
      failure = 'As senhas não coincidem.';
      return;
    }
    const passphrase = password;
    password = '';
    confirmPassword = '';
    void run(async () => {
      session = await invoke<Session>('shop_unlock', { password: passphrase, create: !initialized });
      initialized = true;
      await refresh();
    });
  }

  function command<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return invoke<T>(name, { ...args, token: session?.token });
  }

  function selectSource() {
    void run(async () => {
      source = null;
      source = await command<Manifest | null>('studio_select');
    });
  }

  function selectPackage() {
    void run(async () => {
      review = null;
      review = await command<Candidate | null>('shop_select');
      profiles = review?.manifest.profiles.slice() ?? [];
      permissions = [];
    });
  }

  function confirmInstall() {
    void run(async () => {
      review = null;
      const result = await command<Installed>('shop_install', { consent: { profiles, permissions } });
      await refresh();
      status = `${result.manifest.name} ${result.manifest.version} foi registrado na Lojinha.`;
    });
  }

  function publish() {
    void run(async () => {
      await command('shop_publish', { consent: { profiles, permissions } });
      review = null;
      await refresh();
      status = 'Pacote publicado na vitrine para os perfis selecionados.';
    });
  }

  function unpublish(item: CatalogEntry) {
    void run(async () => {
      await command('shop_unpublish', { id: item.manifest.id });
      await refresh();
      status = 'Pacote retirado da vitrine.';
    });
  }

  function change(item: Installed, revert: boolean) {
    void run(async () => {
      await command('shop_change', { id: item.manifest.id, revert });
      removal = null;
      await refresh();
      status = revert ? 'Versão anterior restaurada.' : 'Aplicativo removido.';
    });
  }

  function exportPrivate(event: SubmitEvent) {
    event.preventDefault();
    const passphrase = exportPassword;
    exportPassword = '';
    void run(async () => {
      if (await command<boolean>('studio_export', { password: passphrase })) status = 'Cópia protegida exportada.';
    });
  }
</script>

<div class="profile-screen profile-overlay">
  <section class="profile-card management shop" aria-label="Estúdio e Lojinha">
    <header class="management-header">
      <button class="profile-secondary" type="button" disabled={busy} onclick={onback}><ArrowLeft size={16} /> Perfis</button>
      {#if session}
        <div role="group" aria-label="Ferramentas da loja" class="shop-actions">
          <button class="profile-secondary" type="button" aria-pressed={view === 'studio'} onclick={() => { view = 'studio'; }}><PackageCheck size={16} /> Estúdio</button>
          <button class="profile-secondary" type="button" aria-pressed={view === 'store'} onclick={() => { view = 'store'; }}><Store size={16} /> Lojinha</button>
        </div>
      {/if}
    </header>
    {#if !session}
      <h1>Estúdio e Lojinha</h1>
      {#if !native}
        <p>Abra o EduOS no Tauri para usar os arquivos locais do Estúdio e da Lojinha.</p>
      {:else if initialized !== null}
        <p>{initialized ? 'Desbloqueie a chave local do Estúdio para administrar os pacotes.' : 'Crie uma chave Ed25519 local e uma senha separada para protegê-la.'}</p>
        <form onsubmit={unlock}>
          <label>Senha da chave<input type="password" bind:value={password} required minlength={12} maxlength={128} autocomplete={initialized ? 'current-password' : 'new-password'} /></label>
          {#if !initialized}
            <label>Confirmar senha da chave<input type="password" bind:value={confirmPassword} required minlength={12} maxlength={128} autocomplete="new-password" /></label>
          {/if}
          <div class="profile-actions"><button class="profile-primary" disabled={busy} type="submit">{initialized ? 'Desbloquear' : 'Criar e desbloquear chave'}</button></div>
        </form>
      {/if}
    {:else if view === 'studio'}
      <h1>Estúdio da Loja</h1>
      <p>Selecione a pasta que contém <code>manifest.json</code> e os recursos locais do aplicativo.</p>
      <div class="shop-actions">
        <button class="profile-secondary" type="button" disabled={busy} onclick={selectSource}><FolderOpen size={16} /> Importar pasta</button>
        {#if source}<button class="profile-primary" type="button" disabled={busy} onclick={() => run(async () => { if (await command<boolean>('studio_sign')) status = 'Pacote .eduos assinado e salvo.'; })}>Assinar e salvar .eduos</button>{/if}
      </div>
      {#if source}<p class="shop-selected"><strong>{source.name} {source.version}</strong> · {source.id}</p>{/if}
      <h2><KeyRound size={16} /> Chave do Estúdio</h2>
      <p>Identificador da chave</p><p class="shop-fingerprint">{session.fingerprint}</p>
      <div class="shop-actions">
        <button class="profile-secondary" type="button" disabled={busy} onclick={() => run(async () => { if (await command<boolean>('studio_public')) status = 'Chave pública exportada.'; })}>Exportar chave pública</button>
      </div>
      <form onsubmit={exportPrivate}>
        <label>Senha da cópia protegida<input type="password" bind:value={exportPassword} required minlength={12} maxlength={128} autocomplete="new-password" /></label>
        <button class="profile-secondary" type="submit" disabled={busy}>Exportar chave privada protegida</button>
      </form>
    {:else}
      <h1>Lojinha</h1>
      <div class="shop-actions">
        <button class="profile-primary" type="button" disabled={busy} onclick={selectPackage}><FolderOpen size={16} /> Abrir pacote .eduos</button>
        <button class="profile-secondary" type="button" disabled={busy} onclick={() => run(async () => { await command('shop_trust_local'); await refresh(); status = 'Chave do Estúdio adicionada às chaves confiáveis.'; })}>Confiar na chave do Estúdio</button>
        <button class="profile-secondary" type="button" disabled={busy} onclick={() => run(async () => { const id = await command<string | null>('shop_trust_file'); if (id) { await refresh(); status = `Chave pública confiável: ${id}`; } })}>Adicionar chave pública</button>
      </div>
      {#if review}
        <section class="shop-review" aria-label="Revisar pacote">
          <h2>{review.manifest.name} {review.manifest.version}</h2>
          <p>{review.manifest.id}</p><p class="shop-fingerprint">{review.fingerprint}</p>
          <div class="management-grid">
            <fieldset>
              <legend>Perfis liberados</legend>
              {#each review.manifest.profiles as role (role)}
                <label class="profile-checkbox"><input type="checkbox" value={role} bind:group={profiles} /> {roleLabels[role]}</label>
              {/each}
            </fieldset>
            <fieldset>
              <legend>Permissões solicitadas</legend>
              {#each review.manifest.permissions as permission (permission)}
                <label class="profile-checkbox"><input type="checkbox" value={permission} bind:group={permissions} /> {permissionNames[permission]}</label>
              {:else}
                <p>Sem permissões solicitadas.</p>
              {/each}
            </fieldset>
          </div>
          <div class="profile-actions">
            <button class="profile-secondary" type="button" disabled={busy} onclick={() => { review = null; }}>Cancelar</button>
            <button class="profile-secondary" type="button" disabled={busy || !profiles.length} onclick={publish}>Publicar na vitrine</button>
            <button class="profile-primary" type="button" disabled={busy} onclick={confirmInstall}>
              {installed.some((item) => item.manifest.id === review?.manifest.id) ? 'Confirmar atualização' : 'Confirmar instalação'}
            </button>
          </div>
        </section>
      {/if}
      <h2>Publicados na vitrine</h2>
      {#each publications as item (item.manifest.id)}
        <div class="shop-installed">
          <div><strong>{item.manifest.name} {item.manifest.version}</strong><p>{item.consent.profiles.map((role) => roleLabels[role]).join(', ')}</p></div>
          <button class="profile-secondary" type="button" disabled={busy} onclick={() => unpublish(item)}>Retirar da vitrine</button>
        </div>
      {:else}
        <p>Nenhum pacote publicado.</p>
      {/each}
      <h2>Pacotes instalados</h2>
      {#each installed as item (item.manifest.id)}
        <div class="shop-installed">
          <div><strong>{item.manifest.name} {item.manifest.version}</strong><p>{item.manifest.id}{item.trusted ? '' : ' · Chave não confiável'}</p></div>
          <div class="shop-actions">
            {#if item.can_revert}<button class="profile-secondary" type="button" disabled={busy} onclick={() => change(item, true)}>Reverter</button>{/if}
            <button class="profile-secondary" type="button" disabled={busy} onclick={() => { removal = item; }}>Remover</button>
          </div>
        </div>
      {:else}
        <p>Nenhum pacote instalado.</p>
      {/each}
      {#if removal}
        <section class="shop-review" aria-label="Confirmar remoção">
          <p>Remover {removal.manifest.name} e sua versão anterior?</p>
          <div class="profile-actions">
            <button type="button" class="profile-secondary" onclick={() => { removal = null; }}>Cancelar remoção</button>
            <button type="button" class="profile-primary" disabled={busy} onclick={() => { if (removal) change(removal, false); }}>Confirmar remoção</button>
          </div>
        </section>
      {/if}
    {/if}
    {#if busy}<p class="profile-status" role="status">Aguarde…</p>{/if}
    {#if failure}<p class="profile-error" role="alert">{failure}</p>{/if}
    {#if status}<p class="profile-status shop-status" role="status">{status}</p>{/if}
  </section>
</div>
