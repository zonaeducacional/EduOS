import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { promisify } from 'node:util';

const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const checkout = join(desktop, 'node_modules', '.eduos-everything-source');
const build = join(desktop, 'node_modules', '.eduos-everything-build');
const output = join(desktop, 'dist', 'puter');
const revision = '01fa74d865e348532779263303186436eb99cd1a';
const repository = 'https://github.com/HeyPuter/everything.git';
const apps = ['notes', 'email', 'photo-studio', 'video-studio', 'audio-studio', 'music-studio'];

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} falhou (${code}).`));
    });
  });
}

async function copyNotices(source, destination) {
  const lock = JSON.parse(await readFile(join(source, 'package-lock.json'), 'utf8'));
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || pkg.dev) continue;
    const dependency = join(source, path);
    let files;
    try {
      files = await readdir(dependency);
    } catch (error) {
      if (error.code === 'ENOENT' && pkg.optional) continue;
      throw error;
    }
    const notices = files.filter((file) => /^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(file));
    if (!notices.length) continue;
    const target = join(destination, 'licencas', path);
    await mkdir(target, { recursive: true });
    for (const notice of notices) await cp(join(dependency, notice), join(target, notice), { recursive: true });
  }
}

await mkdir(checkout, { recursive: true });
try {
  await readFile(join(checkout, '.git', 'HEAD'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await run('git', ['init', '--quiet'], checkout);
  await run('git', ['remote', 'add', 'origin', repository], checkout);
}
try {
  await run('git', ['cat-file', '-e', `${revision}^{commit}`], checkout);
} catch {
  await run('git', ['fetch', '--filter=blob:none', '--depth=1', 'origin', revision], checkout);
}
await run('git', ['sparse-checkout', 'set', 'dev', ...apps.map((app) => `src/${app}`)], checkout);
await run('git', ['checkout', '--detach', revision], checkout);
await mkdir(output, { recursive: true });
await run('git', ['diff', '--quiet', 'HEAD'], checkout);
const { stdout: sourceFiles } = await promisify(execFile)('git',
  ['ls-files', '-z', 'LICENSE', 'dev', ...apps.map((app) => `src/${app}`)], { cwd: checkout, encoding: 'buffer' });
await writeFile(join(checkout, '.git', 'eduos-source-files'), sourceFiles);
await run('tar', ['-czf', join(output, 'codigo-fonte.tar.gz'), '--null', '-T', '.git/eduos-source-files'], checkout);

await rm(build, { recursive: true, force: true });
await mkdir(join(build, 'src'), { recursive: true });
await cp(join(checkout, 'dev'), join(build, 'dev'), { recursive: true });
await cp(join(checkout, 'LICENSE'), join(build, 'LICENSE'));
for (const app of apps) {
  const source = join(build, 'src', app);
  await cp(join(checkout, 'src', app), source, { recursive: true });
  const destination = join(output, app);
  await run('npm', ['ci'], source);
  await run('npm', ['run', 'build'], source);
  await rm(destination, { recursive: true, force: true });
  await cp(join(source, 'dist'), destination, { recursive: true });
  await cp(app === 'music-studio' ? join(checkout, 'LICENSE') : join(source, 'LICENSE'), join(destination, 'LICENSE.txt'));
  await copyNotices(source, destination);
  await writeFile(join(destination, 'ORIGEM.txt'), `HeyPuter Everything\n${repository}\nRevisão: ${revision}\nCódigo-fonte: /codigo-fonte.tar.gz\n`);
}
