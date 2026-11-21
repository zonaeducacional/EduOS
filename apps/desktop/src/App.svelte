<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    Accessibility, ArrowDownRight, ArrowUpRight, CalendarDays, Check,
    Grid2X2, ImageUp, Keyboard, Maximize2, Minus, Moon, Move, Package,
    Store, Sun, UserRound, X,
  } from 'lucide-svelte';
  import { fit, gameAppIds, parseTheme, puterAppIds, resize, themes, transition } from '@eduos/desktop-core';
  import type { AppId, BuiltinAppId, Desktop, Rect, Theme } from '@eduos/desktop-core';
  import Notes from './Notes.svelte';
  import Calendar from './Calendar.svelte';
  import Wallpaper from './Wallpaper.svelte';
  import Calculator from './Calculator.svelte';
  import StartMenu from './StartMenu.svelte';
  import ExternalApp from './ExternalApp.svelte';
  import Editor from './builtins/Editor.svelte';
  import Draw from './builtins/Draw.svelte';
  import Bookmarks from './builtins/Bookmarks.svelte';
  import Recorder from './builtins/Recorder.svelte';
  import Files from './builtins/Files.svelte';
  import { builtinCatalog as appCatalog } from './builtins/registry';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import type { RuntimeEntry } from './store-types';
  import type { StartEntry } from './StartMenu.svelte';
  import { profileStorage } from './profiles';
  import type { Profile } from './profiles';
  import { parseWallpaper, readWallpaperImage, wallpapers } from './wallpaper';

  let { profile, allowed, suspended, onprofiles, oncatalog }: {
    profile: Profile; allowed?: readonly BuiltinAppId[]; suspended: boolean; onprofiles: () => void; oncatalog: () => void;
  } = $props();
  const storage = $derived(profileStorage(profile.id));

  const themeIcons = { light: Sun, dark: Moon, contrast: Accessibility };
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function readPreference(key: string) { return storage.read(key); }

  let theme = $state(parseTheme(readPreference('theme')));
  let themeSaved = $state(true);
  let desktopShortcuts = $state(readPreference('desktop-shortcuts') !== 'hidden');
  let shortcutsSaved = $state(true);
  let wallpaper = $state(parseWallpaper(readPreference('wallpaper')));
  let customWallpaper = $derived(wallpaper.startsWith('data:'));
  let wallpaperImage = $derived(customWallpaper ? wallpaper : wallpapers.find(({ id }) => id === wallpaper)?.image);
  let wallpaperError = $state('');
  let wallpaperLoading = $state(false);
  let now = $state(new Date());
  let desktop = $state<Desktop>({ windows: [], active: null });
  let width = $state(0);
  let height = $state(0);
  let menu = $state(false);
  let preferences = $state(false);
  let help = $state(false);
  let calendar = $state(false);
  let clockButton: HTMLButtonElement;
  let launcher: HTMLButtonElement;
  let launchError = $state('');
  let preferencesButton: HTMLButtonElement;
  let helpButton: HTMLButtonElement;
  let firstTheme = $state<HTMLButtonElement>();
  let helpClose = $state<HTMLButtonElement>();
  let installed = $state<RuntimeEntry[]>([]);
  let builtins = $derived(allowed ? appCatalog.filter(({ id }) => allowed.includes(id)) : appCatalog);
  let shortcuts = $derived(builtins.filter(({ id }) => id === 'notes' || id === 'calculator'));
  let dockApps = $derived(builtins.filter(({ id }) => id === 'files' || id === 'notes' || id === 'calculator'));
  let apps = $derived([
    ...builtins.map((app) => ({ ...app, iconClass: `${app.id}-icon`, external: undefined })),
    ...installed.map(({ manifest }) => ({
      id: `external-${manifest.id}` as const, name: manifest.name, category: manifest.category ?? 'utilities' as const,
      description: `Versão ${manifest.version}`, tags: manifest.id, icon: Package, iconClass: 'catalog-icon',
      width: manifest.window.width, height: manifest.window.height, external: manifest,
    })),
  ]);
  $effect(() => {
    if (suspended || !isTauri()) return;
    let canceled = false;
    const role = profile.role;
    void invoke<RuntimeEntry[]>('runtime_list', { profile: role }).then((entries) => {
      if (canceled) return;
      untrack(() => {
        for (const appWindow of desktop.windows) {
          const old = installed.find(({ manifest }) => `external-${manifest.id}` === appWindow.id);
          if (old && !entries.some(({ manifest }) => manifest.id === old.manifest.id && manifest.version === old.manifest.version)) {
            desktop = transition(desktop, { type: 'close', id: appWindow.id });
          }
        }
        installed = entries;
      });
    }).catch(() => {});
    return () => { canceled = true; };
  });
  let startEntries: StartEntry[] = $derived([
    ...apps.map((app) => ({ ...app, open: () => openApp(app.id) })),
    { id: 'catalog', name: 'Lojinha', description: 'Descubra e instale aplicativos', tags: 'loja aplicativos instalar',
      icon: Store, iconClass: 'catalog-icon', category: 'system', open: openCatalog },
  ]);
  let area = $derived({ width, height });

  let gesture: { id: AppId; pointer: number; x: number; y: number; rect: Rect; mode: 'move' | 'resize' } | undefined;
  let adjustment = $state<{ id: AppId; rect: Rect; mode: 'move' | 'resize' } | null>(null);

  onMount(() => {
    const timer = setInterval(() => { now = new Date(); }, 1000);
    return () => clearInterval(timer);
  });

  function dismiss() {
    menu = false;
    preferences = false;
    help = false;
    calendar = false;
  }

  function dismissOnOutsideClick(event: PointerEvent) {
    if (!(menu || preferences || help || calendar)) return;
    const target = event.target;
    if (target instanceof Element && !target.closest('.popover, button[aria-expanded]')) dismiss();
  }

  function toggleMenu() {
    const shouldOpen = !menu;
    dismiss();
    if (!shouldOpen) return launcher.focus();
    menu = true;
  }

  async function togglePreferences() {
    const shouldOpen = !preferences;
    dismiss();
    if (!shouldOpen) return preferencesButton.focus();
    preferences = true;
    await tick();
    firstTheme?.focus();
  }

  async function toggleHelp() {
    const shouldOpen = !help;
    dismiss();
    if (!shouldOpen) return helpButton.focus();
    help = true;
    await tick();
    helpClose?.focus();
  }

  function toggleCalendar() {
    const shouldOpen = !calendar;
    dismiss();
    if (!shouldOpen) return clockButton.focus();
    now = new Date();
    calendar = true;
  }

  function focusCalendar(element: HTMLButtonElement) {
    element.focus();
  }

  function selectTheme(value: Theme) {
    theme = value;
    themeSaved = storage.write('theme', value);
  }

  function toggleDesktopShortcuts(event: Event & { currentTarget: HTMLInputElement }) {
    desktopShortcuts = event.currentTarget.checked;
    shortcutsSaved = storage.write('desktop-shortcuts', desktopShortcuts ? 'visible' : 'hidden');
  }

  function selectWallpaper(value: string) {
    if (!storage.write('wallpaper', value)) {
      wallpaperError = 'Não foi possível salvar o papel de parede neste dispositivo.';
      return;
    }
    wallpaper = value;
    wallpaperError = '';
  }

  async function importWallpaper(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    wallpaperLoading = true;
    wallpaperError = '';
    try {
      selectWallpaper(await readWallpaperImage(file));
    } catch (error) {
      wallpaperError = error instanceof Error ? error.message : 'Não foi possível importar a imagem.';
    } finally {
      wallpaperLoading = false;
    }
  }

  async function focusApp(id: AppId | null, fallback?: HTMLElement) {
    await tick();
    const window = id ? document.getElementById(`window-${id}`) : null;
    const target = window?.querySelector<HTMLElement>('[data-initial-focus]:not(:disabled), .maximized [data-maximize]') ?? fallback ?? launcher;
    target?.focus();
  }

  function openApp(id: AppId) {
    dismiss();
    const app = apps.find((item) => item.id === id);
    if (!app) return;
    if (id === 'mini-browser' || id === 'schedule' || id === 'grade-management') {
      launchError = '';
      if (isTauri()) {
        void invoke('native_app_open', { profile: profile.id, id }).catch((error: unknown) => {
          launchError = typeof error === 'string' ? error : `Não foi possível abrir ${app.name}.`;
        });
      } else {
        launchError = `Abra o EduOS no Tauri para usar ${app.name}.`;
      }
      return;
    }
    if (id === 'files' && isTauri()) {
      launchError = '';
      void invoke('vibelab_open', { profile: profile.id }).catch((error: unknown) => {
        launchError = typeof error === 'string' ? error : 'Não foi possível abrir o VibeLab.';
      });
      return;
    }
    if (id === 'biblioteca' || gameAppIds.some((gameId) => gameId === id) || puterAppIds.some((puterId) => puterId === id)) {
      launchError = '';
      if (isTauri()) {
        void invoke('builtin_open_bundled', { profile: profile.id, id }).catch((error: unknown) => {
          launchError = typeof error === 'string' ? error : `Não foi possível abrir ${app.name}.`;
        });
      } else {
        launchError = `Abra o EduOS no Tauri para usar ${app.name}.`;
      }
      return;
    }
    if (id === 'escola-office') {
      launchError = '';
      if (isTauri()) {
        void invoke('builtin_open_office', { profile: profile.id }).catch((error: unknown) => {
          launchError = typeof error === 'string' ? error : 'Não foi possível abrir o Escola Office.';
        });
      } else {
        launchError = 'Abra o EduOS no Tauri para usar o Escola Office.';
      }
      return;
    }
    const offset = id === 'notes' ? -135 : id === 'calculator' ? 200 : 0;
    const rect = fit({
      x: (width - app.width) / 2 + offset,
      y: (height - app.height) / 2 + (id === 'notes' ? -28 : 22),
      width: app.width,
      height: app.height,
    }, area);
    desktop = transition(desktop, { type: 'open', id, rect });
    void focusApp(id);
  }

  function activate(id: AppId) {
    if (desktop.active !== id) desktop = transition(desktop, { type: 'activate', id });
  }

  function windowAction(id: AppId, type: 'task' | 'close' | 'minimize' | 'maximize', fallback?: HTMLElement) {
    adjustment = null;
    dismiss();
    desktop = transition(desktop, { type, id });
    if (type !== 'maximize') void focusApp(desktop.active, fallback);
  }

  function changeGeometry(id: AppId, rect: Rect, dx: number, dy: number, mode: 'move' | 'resize') {
    const next = mode === 'move' ? fit({ ...rect, x: rect.x + dx, y: rect.y + dy }, area) : resize(rect, dx, dy, area);
    desktop = transition(desktop, { type: 'geometry', id, rect: next });
  }

  function startPointer(event: PointerEvent & { currentTarget: HTMLButtonElement }, id: AppId, rect: Rect, mode: 'move' | 'resize') {
    if (event.button !== 0) return;
    adjustment = null;
    gesture = { id, rect, mode, x: event.clientX, y: event.clientY, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointer(event: PointerEvent) {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    changeGeometry(gesture.id, gesture.rect, event.clientX - gesture.x, event.clientY - gesture.y, gesture.mode);
  }

  function stopPointer(event: PointerEvent) {
    if (gesture?.pointer === event.pointerId) gesture = undefined;
  }

  function startAdjustment(event: MouseEvent, id: AppId, rect: Rect, mode: 'move' | 'resize') {
    if (event.detail !== 0) return;
    adjustment = { id, rect, mode };
  }

  function adjustmentKeys(event: KeyboardEvent, id: AppId, rect: Rect, mode: 'move' | 'resize') {
    if (adjustment?.id !== id || adjustment.mode !== mode) return;
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        desktop = transition(desktop, { type: 'geometry', id, rect: fit(adjustment.rect, area) });
      }
      adjustment = null;
      return;
    }
    const step = event.shiftKey ? 32 : 8;
    const directions: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    changeGeometry(id, rect, ...direction, mode);
  }

  function globalKeys(event: KeyboardEvent) {
    if (suspended) return;
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') {
      event.preventDefault();
      void toggleMenu();
    } else if (event.key === 'Escape' && (menu || preferences || help || calendar)) {
      event.preventDefault();
      const target = menu ? launcher : preferences ? preferencesButton : help ? helpButton : clockButton;
      dismiss();
      target.focus();
    }
  }

  function openCatalog() {
    dismiss();
    oncatalog();
  }

</script>

<svelte:window onkeydown={globalKeys} onpointerdown={dismissOnOutsideClick} />

<div class="shell" inert={suspended} data-theme={theme} data-wallpaper={wallpaperImage ? 'custom' : wallpaper}>
  <Wallpaper image={wallpaperImage} />
  <main class="desktop" aria-label="Área de trabalho" bind:clientWidth={width} bind:clientHeight={height}>
    <div class="desktop-content">
      {#if desktopShortcuts}
        <div class="shortcuts" aria-label="Aplicativos">
          {#each shortcuts as app (app.id)}
            <button class="shortcut" type="button" onclick={() => openApp(app.id)}>
              <span class="app-icon {app.id}-icon"><app.icon size={25} strokeWidth={1.8} /></span>
              <span>{app.name}</span>
              <ArrowUpRight size={15} class="shortcut-arrow" />
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <span id="move-description" hidden>Ative com Enter e use as setas para mover a janela.</span>
    <span id="resize-description" hidden>Ative com Enter e use as setas para redimensionar a janela.</span>
    {#each apps as app (app.id)}
      {@const index = desktop.windows.findIndex((item) => item.id === app.id)}
      {@const appWindow = desktop.windows[index]}
      {#if appWindow}
        {@const rect = fit(appWindow.rect, area)}
        <section id="window-{app.id}" class="app-window" class:active={desktop.active === app.id}
          class:maximized={appWindow.maximized} hidden={appWindow.minimized} aria-labelledby="title-{app.id}"
          style:left={appWindow.maximized ? '0px' : `${rect.x}px`}
          style:top={appWindow.maximized ? '0px' : `${rect.y}px`}
          style:width={appWindow.maximized ? '100%' : `${rect.width}px`}
          style:height={appWindow.maximized ? '100%' : `${rect.height}px`}
          style:z-index={index + 2} onfocusin={() => activate(app.id)} onpointerdown={() => { dismiss(); activate(app.id); }}>
          <div class="titlebar">
            <button class="window-title" id="title-{app.id}" type="button" aria-label={app.name}
              aria-describedby="move-description" data-initial-focus disabled={appWindow.maximized}
              onpointerdown={(event) => startPointer(event, app.id, rect, 'move')} onpointermove={movePointer}
              onpointerup={stopPointer} onlostpointercapture={stopPointer} ondblclick={() => windowAction(app.id, 'maximize')}
              onkeydown={(event) => adjustmentKeys(event, app.id, rect, 'move')} onblur={() => { adjustment = null; }}
              onclick={(event) => startAdjustment(event, app.id, rect, 'move')}>
              <span class="title-icon {app.iconClass}"><app.icon size={15} /></span><span>{app.name}</span><Move size={14} class="move-icon" />
            </button>
            <div class="window-controls">
              <button class="icon-button" type="button" aria-label="Minimizar" onclick={() => windowAction(app.id, 'minimize', document.getElementById(`task-${app.id}`) ?? undefined)}><Minus size={16} /></button>
              <button class="icon-button" type="button" aria-label={appWindow.maximized ? 'Restaurar tamanho' : 'Maximizar'} data-maximize onclick={() => windowAction(app.id, 'maximize')}><Maximize2 size={15} /></button>
              <button class="icon-button window-close" type="button" aria-label="Fechar" onclick={() => windowAction(app.id, 'close')}><X size={17} /></button>
            </div>
          </div>
          {#if app.external}<ExternalApp id={app.external.id} version={app.external.version} role={profile.role} />
          {:else if app.id === 'notes'}<Notes {storage} />
          {:else if app.id === 'calculator'}<Calculator />
          {:else if app.id === 'markdown'}<Editor {storage} />
          {:else if app.id === 'draw'}<Draw {storage} />
          {:else if app.id === 'bookmarks'}<Bookmarks {storage} />
          {:else if app.id === 'recorder'}<Recorder />
          {:else if app.id === 'files'}<Files profileId={profile.id} />{/if}
          {#if !appWindow.maximized}
            <button class="resize-handle" type="button" aria-label="Redimensionar janela" aria-describedby="resize-description"
              onpointerdown={(event) => startPointer(event, app.id, rect, 'resize')} onpointermove={movePointer}
              onpointerup={stopPointer} onlostpointercapture={stopPointer}
              onkeydown={(event) => adjustmentKeys(event, app.id, rect, 'resize')} onblur={() => { adjustment = null; }}
              onclick={(event) => startAdjustment(event, app.id, rect, 'resize')}><ArrowDownRight size={17} /></button>
          {/if}
        </section>
      {/if}
    {/each}
    {#if launchError}<div class="launch-error" role="alert">{launchError}<button class="icon-button" aria-label="Fechar aviso" onclick={() => { launchError = ''; }}><X size={16} /></button></div>{/if}
    {#if adjustment}<div class="adjustment" role="status">{adjustment.mode === 'move' ? 'Mover' : 'Redimensionar'} · Use as setas · Enter confirma · Esc cancela</div>{/if}
  </main>

  {#if menu}<StartMenu entries={startEntries} {storage} />{/if}

  {#if preferences}
    <section class="popover tray-popover" id="appearance" aria-label="Aparência">
      <h2>Tema da área de trabalho</h2>
      <div role="group" aria-label="Tema">
        <button class="setting" type="button" bind:this={firstTheme} aria-pressed={theme === 'light'} onclick={() => selectTheme('light')}><Sun size={17} /> Claro {#if theme === 'light'}<Check size={17} />{/if}</button>
        {#each themes.slice(1) as item (item.id)}
          {@const Icon = themeIcons[item.id]}
          <button class="setting" type="button" aria-pressed={theme === item.id} onclick={() => selectTheme(item.id)}><Icon size={17} /> {item.label} {#if theme === item.id}<Check size={17} />{/if}</button>
        {/each}
      </div>
      {#if !themeSaved}<p role="status">Não foi possível salvar o tema neste dispositivo.</p>{/if}
      <div class="appearance-section">
        <label class="shortcut-setting">
          <input type="checkbox" checked={desktopShortcuts} onchange={toggleDesktopShortcuts} />
          Mostrar atalhos na área de trabalho
        </label>
        {#if !shortcutsSaved}<p class="wallpaper-note" role="status">Não foi possível salvar a preferência neste dispositivo.</p>{/if}
      </div>
      <div class="wallpaper-settings">
        <h2>Papel de parede</h2>
        <div class="wallpaper-options" role="group" aria-label="Papéis de parede">
          {#each wallpapers as item (item.id)}
            <button class="wallpaper-option" type="button" disabled={wallpaperLoading}
              aria-pressed={wallpaper === item.id} onclick={() => selectWallpaper(item.id)}>
              <span class="wallpaper-preview" data-preview={item.id}
                style:background-image={item.image ? `url("${item.image}")` : undefined}>
                {#if wallpaper === item.id}<Check size={16} />{/if}
              </span>
              {item.label}
            </button>
          {/each}
        </div>
        <label class="setting import-wallpaper">
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={wallpaperLoading}
            aria-label="Escolher imagem local" onchange={importWallpaper} />
          <ImageUp size={17} /> {wallpaperLoading ? 'Carregando imagem…' : 'Escolher imagem local'}
          {#if customWallpaper}<Check size={17} />{/if}
        </label>
        <p class="wallpaper-note">{theme === 'contrast' ? 'O alto contraste usa um fundo liso.' : 'PNG, JPEG ou WebP de até 40 MB.'}</p>
        {#if wallpaperError}<p class="wallpaper-note" role="status">{wallpaperError}</p>{/if}
      </div>
    </section>
  {/if}

  {#if help}
    <section class="popover tray-popover help" id="shortcuts" aria-label="Atalhos de teclado">
      <div class="help-heading"><h2>Atalhos de teclado</h2><button type="button" class="icon-button" aria-label="Fechar atalhos" bind:this={helpClose} onclick={toggleHelp}><X size={17} /></button></div>
      <dl>
        <dt>Abrir o menu Iniciar</dt><dd><kbd>Ctrl</kbd> ou <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>Espaço</kbd></dd>
        <dt>Navegar pelos controles</dt><dd><kbd>Tab</kbd> e <kbd>Shift</kbd> + <kbd>Tab</kbd></dd>
        <dt>Mover ou redimensionar uma janela</dt><dd>Selecione o título ou o controle no canto inferior. Ative com <kbd>Enter</kbd>, ajuste com as setas e confirme com <kbd>Enter</kbd>. <kbd>Esc</kbd> cancela.</dd>
      </dl>
    </section>
  {/if}

  {#if calendar}<Calendar {now} initialFocus={focusCalendar} />{/if}

  <footer class="taskbar" aria-label="Barra de tarefas">
    <div class="tasks" role="group" aria-label="Janelas abertas">
      {#each apps as app (app.id)}
        {#if desktop.windows.some((item) => item.id === app.id)}
          <button id="task-{app.id}" class="task" type="button" aria-pressed={desktop.active === app.id} aria-controls="window-{app.id}"
            onclick={(event) => windowAction(app.id, 'task', event.currentTarget)}>
            <span class="title-icon {app.iconClass}"><app.icon size={15} /></span><span>{app.name}</span>
          </button>
        {/if}
      {/each}
    </div>
    <nav class="dock" aria-label="Dock de aplicativos">
      <button class="start-button" class:pressed={menu} type="button" aria-expanded={menu} aria-controls={menu ? 'start-menu' : undefined} bind:this={launcher} onclick={toggleMenu}><Grid2X2 size={18} /><span>Iniciar</span></button>
      <span class="task-divider" aria-hidden="true"></span>
      {#each dockApps as app (app.id)}
        <button class="dock-app" class:running={desktop.windows.some((item) => item.id === app.id)}
          type="button" aria-label={app.name} title={app.name} onclick={() => openApp(app.id)}>
          <span class="title-icon {app.id}-icon"><app.icon size={19} /></span>
        </button>
      {/each}
      <button class="dock-app" type="button" aria-label="Lojinha" title="Lojinha" data-catalog-control onclick={openCatalog}>
        <span class="title-icon catalog-icon"><Store size={19} /></span>
      </button>
    </nav>
    <div class="tray">
      <button class="icon-button" type="button" data-profile-control aria-label={profile.role === 'administrator' ? 'Gerenciar perfis' : 'Trocar perfil'}
        title={profile.name} onclick={() => { dismiss(); onprofiles(); }}><UserRound size={18} /></button>
      <button class="icon-button" type="button" aria-label="Atalhos de teclado" title="Atalhos de teclado" aria-expanded={help} aria-controls={help ? 'shortcuts' : undefined} bind:this={helpButton} onclick={toggleHelp}><Keyboard size={19} /></button>
      <button class="icon-button appearance" type="button" aria-label="Aparência" title="Aparência" aria-expanded={preferences} aria-controls={preferences ? 'appearance' : undefined} bind:this={preferencesButton} onclick={togglePreferences}><Sun size={18} /></button>
      <button class="clock" type="button" bind:this={clockButton} aria-expanded={calendar} aria-controls={calendar ? 'calendar' : undefined}
        aria-label={`Calendário. ${shortDate.format(now)} às ${timeFormat.format(now)}`} onclick={toggleCalendar}>
        <CalendarDays size={17} /><span><strong>{timeFormat.format(now)}</strong><small>{shortDate.format(now)}</small></span>
      </button>
    </div>
  </footer>
</div>
