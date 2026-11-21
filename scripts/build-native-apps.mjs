import { spawnSync } from 'node:child_process';
import console from "node:console";
import { chmod, copyFile, cp, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const linux = process.platform === 'linux' && process.arch === 'x64';
const windows = process.platform === 'win32' && process.arch === 'x64';
if (!linux && !windows) process.exit(0);

const output = fileURLToPath(new URL(
  windows ? '../apps/desktop/src-tauri/native-apps-windows/' : '../apps/desktop/src-tauri/native-apps/',
  import.meta.url,
));
await mkdir(output, { recursive: true });

async function stageBrowser() {
  const browser = fileURLToPath(new URL('../apps/mini-navegador/', import.meta.url));
  for (const args of [['ci'], ['run', 'build', '--', '--linux', 'dir', '--x64']]) {
    const result = spawnSync('npm', args, { cwd: browser, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Não foi possível compilar o Mini Navegador.');
  }
  const browserStage = await mkdtemp(join(output, '.staging-'));
  try {
    await cp(join(browser, 'dist', 'linux-unpacked'), join(browserStage, 'mini-navegador'), { recursive: true });
    const target = join(output, 'mini-navegador');
    if (await stat(target).catch(() => null)) await rename(target, join(browserStage, 'previous'));
    try {
      await rename(join(browserStage, 'mini-navegador'), target);
    } catch (error) {
      if (await stat(join(browserStage, 'previous')).catch(() => null)) {
        await rename(join(browserStage, 'previous'), target);
      }
      throw error;
    }
  } finally {
    await rm(browserStage, { recursive: true, force: true });
  }
}

const release = join(homedir(), 'Projetos/horariolivre/artifacts/release-v1.2.0');
const apps = windows ? [
  {
    name: 'VibeLab Horário',
    file: 'vibelab-horario.exe',
    source: process.env.EDUOS_VIBELAB_HORARIO_EXE,
    fallback: join(release, 'VibeLab-Horario-1.2.0-Windows-x64-portable.exe'),
  },
] : [
  {
    name: 'Gestão de Notas',
    file: 'gestao-notas.AppImage',
    source: process.env.EDUOS_GESTAO_NOTAS_APPIMAGE,
    fallback: join(homedir(), 'Downloads/Meus_Apps/sistema-de-gestão-de-notas-escolares.AppImage'),
  },
  {
    name: 'VibeLab Horário',
    file: 'vibelab-horario.AppImage',
    source: process.env.EDUOS_VIBELAB_HORARIO_APPIMAGE,
    fallback: join(release, 'VibeLab-Horario-1.2.0-Linux-x64.AppImage'),
  },
];

if (linux) await stageBrowser();
for (const app of apps) {
  const destination = join(output, app.file);
  const source = resolve(app.source || app.fallback);
  if (source !== destination) {
    const staging = await mkdtemp(join(output, '.staging-'));
    const candidate = join(staging, app.file);
    try {
      await copyFile(source, candidate);
      await chmod(candidate, 0o755);
      await rename(candidate, destination);
    } catch (error) {
      if (error.code !== 'ENOENT' || app.source) throw error;
      const staged = await stat(destination).catch(() => null);
      if (!staged?.isFile()) {
        if (process.env.EDUOS_ALLOW_MISSING_NATIVE_APPS !== '1') {
          throw new Error(`${app.name}: executável não encontrado em ${source}.`);
        }
        console.warn(`${app.name}: ausente neste instalador de teste.`);
        continue;
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  await chmod(destination, 0o755);
  console.log(`${app.name}: ${destination}`);
}
