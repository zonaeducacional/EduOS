<script lang="ts">
  import { ArrowRight, LockKeyhole, UserRound } from 'lucide-svelte';
  import loginWallpaper from './assets/login-wallpaper.jpeg';
  import { createProfiles, roleLabels, verifyPassword } from './profiles';
  import type { Profile, ProfileDatabase } from './profiles';

  let { database, loadError, suspended, onenter, oncreate }: {
    database: ProfileDatabase | null;
    loadError: string;
    suspended: boolean;
    onenter: (id: string) => void;
    oncreate: (database: ProfileDatabase) => void;
  } = $props();

  let selected = $state<Profile | null>(null);
  let password = $state('');
  let confirmation = $state('');
  let error = $state('');
  let busy = $state(false);

  function select(profile: Profile) {
    error = '';
    password = '';
    if (profile.role === 'administrator') selected = profile;
    else onenter(profile.id);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    error = '';
    if (!database && password !== confirmation) {
      error = 'As senhas não coincidem.';
      return;
    }
    busy = true;
    try {
      if (!database) {
        oncreate(await createProfiles(password));
      } else if (selected && await verifyPassword(database.credential, password)) {
        onenter(selected.id);
      } else {
        error = 'Senha incorreta.';
      }
    } catch (cause) {
      error = database ? 'Não foi possível verificar a senha neste dispositivo.' :
        cause instanceof Error ? cause.message : 'Não foi possível criar o perfil.';
    } finally {
      password = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<main class="profile-screen profile-gateway" aria-label="Perfis locais" inert={suspended}>
  <div class="login-wallpaper" aria-hidden="true" style:background-image={`url("${loginWallpaper}")`}></div>
  <section class="profile-card">
    <div class="profile-emblem"><UserRound size={24} /></div>
    {#if loadError}
      <h1>Perfis indisponíveis</h1>
      <p role="alert">{loadError}</p>
    {:else if !database || selected}
      <h1>{database ? 'Entrar como Administrador' : 'Criar perfil Administrador'}</h1>
      <p>{database ? 'Digite a senha local para continuar.' : 'Defina a senha usada para gerenciar perfis e liberar aplicativos neste dispositivo.'}</p>
      <form onsubmit={submit}>
        <label>Senha<input type="password" bind:value={password} minlength={database ? undefined : 8} maxlength={128}
          autocomplete={database ? 'current-password' : 'new-password'} required /></label>
        {#if !database}
          <label>Confirmar senha<input type="password" bind:value={confirmation} autocomplete="new-password" minlength={8} maxlength={128} required /></label>
          <small>Use pelo menos 8 caracteres.</small>
        {/if}
        {#if error}<p class="profile-error" role="alert">{error}</p>{/if}
        <div class="profile-actions">
          {#if selected}<button class="profile-secondary" type="button" disabled={busy} onclick={() => { selected = null; password = ''; error = ''; }}>Voltar</button>{/if}
          <button class="profile-primary" type="submit" disabled={busy}>{busy ? 'Aguarde…' : database ? 'Entrar' : 'Criar perfil'}</button>
        </div>
      </form>
    {:else}
      <h1>Escolha seu perfil</h1>
      <div class="profile-list">
        {#each database.profiles.filter((profile) => profile.enabled) as profile (profile.id)}
          <button class="profile-row" type="button" onclick={() => select(profile)}>
            <span class="profile-emblem">{#if profile.avatar}<img src={profile.avatar} alt="" />{:else if profile.role === 'administrator'}<LockKeyhole size={18} />{:else}<UserRound size={18} />{/if}</span>
            <span><strong>{profile.name}</strong>{#if profile.role !== 'administrator'}<small>{roleLabels[profile.role]}</small>{/if}</span>
            <ArrowRight size={17} />
          </button>
        {/each}
      </div>
    {/if}
  </section>
</main>
