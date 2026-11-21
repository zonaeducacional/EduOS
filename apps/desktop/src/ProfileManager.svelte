<script lang="ts">
  import { ArrowLeft, ImageUp, LockKeyhole, UserRound } from 'lucide-svelte';
  import { tick } from 'svelte';
  import { readWallpaperImage } from './wallpaper';
  import { builtinCatalog as apps } from './builtins/registry';
  import type { BuiltinAppId } from '@eduos/desktop-core';
  import { memberRoles, roleLabels } from './profiles';
  import type { MemberRole, Profile, ProfileDatabase } from './profiles';

  let { database, onsave, onback, onswitch, onshop }: {
    database: ProfileDatabase;
    onsave: (database: ProfileDatabase) => boolean;
    onback: () => void;
    onswitch: () => void;
    onshop: () => void;
  } = $props();

  let formOpen = $state(false);
  let createButton = $state<HTMLButtonElement>();
  let nameInput = $state<HTMLInputElement>();
  let avatar = $state<string | undefined>();
  let photoPending = $state(false);
  let editing = $state<string | null>(null);
  let editingAdmin = $derived(database.profiles.find(({ id }) => id === editing)?.role === 'administrator');
  let name = $state('');
  let role = $state<MemberRole>('student');
  let enabled = $state(true);
  let failure = $state('');
  let status = $state('');

  async function edit(profile?: Profile) {
    avatar = profile?.avatar;
    formOpen = true;
    editing = profile?.id ?? null;
    name = profile?.name ?? '';
    role = profile?.role === 'teacher' ? 'teacher' : 'student';
    enabled = profile?.enabled ?? true;
    failure = '';
    status = '';
    await tick();
    nameInput?.focus();
  }

  async function closeForm() {
    formOpen = false;
    editing = null;
    failure = '';
    await tick();
    createButton?.focus();
  }

  async function importAvatar(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    photoPending = true;
    failure = '';
    try {
      avatar = await readWallpaperImage(file, 160, 65_000);
    } catch (error) {
      failure = error instanceof Error ? error.message : 'Não foi possível importar a foto.';
    } finally {
      photoPending = false;
    }
  }

  function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    if (photoPending) return;
    failure = '';
    status = '';
    const cleaned = name.trim();
    if (!cleaned) {
      failure = 'Informe o nome do perfil.';
      return;
    }
    if (database.profiles.some((profile) => profile.id !== editing && profile.name.toLocaleLowerCase('pt-BR') === cleaned.toLocaleLowerCase('pt-BR'))) {
      failure = 'Já existe um perfil com esse nome.';
      return;
    }
    const profile: Profile = { id: editing ?? crypto.randomUUID(), name: cleaned, role: editingAdmin ? 'administrator' : role, enabled, avatar };
    const profiles = editing ? database.profiles.map((item) => item.id === editing ? profile : item) : [...database.profiles, profile];
    if (!onsave({ ...database, profiles })) {
      failure = 'Não foi possível salvar o perfil.';
      return;
    }
    void closeForm();
    status = `Perfil ${cleaned} salvo.`;
  }

  function toggleAccess(memberRole: MemberRole, app: BuiltinAppId, event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const current = database.allowed[memberRole];
    const allowed = input.checked ? [...current, app] : current.filter((id) => id !== app);
    if (onsave({ ...database, allowed: { ...database.allowed, [memberRole]: allowed } })) {
      failure = '';
      status = 'Permissões salvas.';
    } else {
      input.checked = current.includes(app);
      status = '';
      failure = 'Não foi possível salvar as permissões.';
    }
  }
</script>

<div class="profile-screen profile-overlay">
  <section class="profile-card management" aria-label="Gerenciar perfis">
    <header class="management-header">
      <button class="profile-secondary" type="button" onclick={onback}><ArrowLeft size={16} /> Área de trabalho</button>
      <div class="shop-actions">
        <button class="profile-secondary" type="button" onclick={onshop}>Estúdio e Lojinha</button>
        <button class="profile-secondary" type="button" onclick={onswitch}>Trocar perfil</button>
      </div>
    </header>
    <h1>Gerenciar perfis</h1>
    <div class="management-grid">
      <div>
        <h2>Perfis neste dispositivo</h2>
        <div class="profile-list">
          {#each database.profiles as profile (profile.id)}
            <button class="profile-row" type="button" disabled={photoPending} aria-pressed={editing === profile.id} onclick={() => edit(profile)}>
              <span class="profile-emblem">{#if profile.avatar}<img src={profile.avatar} alt="" />{:else if profile.role === 'administrator'}<LockKeyhole size={17} />{:else}<UserRound size={17} />{/if}</span>
              <span><strong>{profile.name}</strong><small>{roleLabels[profile.role]}{profile.enabled ? '' : ' · Desativado'}</small></span>
            </button>
          {/each}
        </div>
        {#if formOpen}
          <h2>{editing ? 'Editar perfil' : 'Criar perfil'}</h2>
          <form onsubmit={saveProfile}>
            <label>Nome<input type="text" maxlength={45} required bind:this={nameInput} bind:value={name} /></label>
            {#if !editingAdmin}<label>Função<select bind:value={role}><option value="student">Estudante</option><option value="teacher">Professor</option></select></label>{/if}
            <div class="profile-photo">
              <span class="profile-emblem">{#if avatar}<img src={avatar} alt="Foto do perfil" />{:else}<UserRound size={20} />{/if}</span>
              <label class="profile-secondary import-wallpaper">
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={photoPending} aria-label="Escolher foto do perfil" onchange={importAvatar} />
                <ImageUp size={16} /> {photoPending ? 'Carregando…' : 'Escolher foto'}
              </label>
              {#if avatar}<button class="profile-secondary" type="button" disabled={photoPending} onclick={() => { avatar = undefined; }}>Remover foto</button>{/if}
            </div>
            {#if editing && !editingAdmin}<label class="profile-checkbox"><input type="checkbox" bind:checked={enabled} /> Perfil ativo</label>{/if}
            <div class="profile-actions">
              <button class="profile-secondary" type="button" disabled={photoPending} onclick={closeForm}>Cancelar</button>
              <button class="profile-primary" type="submit" disabled={photoPending}>{editing ? 'Salvar alterações' : 'Criar perfil'}</button>
            </div>
          </form>
        {:else}
          <button class="profile-primary new-profile" type="button" bind:this={createButton} onclick={() => edit()}>Novo perfil</button>
        {/if}
      </div>
      <div>
        <h2>Aplicativos liberados</h2>
        {#each memberRoles as memberRole (memberRole)}
          <fieldset>
            <legend>{roleLabels[memberRole]}</legend>
            {#each apps as app (app.id)}
              <label class="profile-checkbox"><input type="checkbox" checked={database.allowed[memberRole].includes(app.id)} onchange={(event) => toggleAccess(memberRole, app.id, event)} /> {app.name}</label>
            {/each}
          </fieldset>
        {/each}
      </div>
    </div>
    {#if failure}<p class="profile-error" role="alert">{failure}</p>{/if}
    {#if status}<p class="profile-status" role="status">{status}</p>{/if}
  </section>
</div>
