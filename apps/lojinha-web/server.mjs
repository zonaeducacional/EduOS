import { createServer } from 'node:http';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';
import { URL, URLSearchParams } from 'node:url';
import { Buffer } from 'node:buffer';
import { card, editor, escape, page } from './view.mjs';

const origin = new URL(env.LOJINHA_ORIGIN ?? 'http://127.0.0.1:4310').origin;
const secure = origin.startsWith('https://');
if (!secure && new URL(origin).hostname !== '127.0.0.1') throw new Error('Configure um endereço HTTPS para publicar a Lojinha.');
const login = env.LOJINHA_ADMIN_LOGIN;
const password = env.LOJINHA_ADMIN_PASSWORD;
if (!login || !password || password.length < 14) {
  throw new Error('Defina LOJINHA_ADMIN_LOGIN e LOJINHA_ADMIN_PASSWORD (ao menos 14 caracteres).');
}
const salt = randomBytes(16);
const passwordHash = scryptSync(password, salt, 64);
const dataFile = env.LOJINHA_DATA ?? 'lojinha-data.json';
const sessionDuration = 8 * 60 * 60 * 1000;
const sessions = new Map();
let nextLogin = 0;
let items = [];
try {
  items = JSON.parse(readFileSync(dataFile, 'utf8'));
  if (!Array.isArray(items)) throw new Error('Arquivo de catálogo inválido.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const assets = new Map([
  ['/lojinha.css', ['text/css', 'lojinha.css']],
  ['/preview.mjs', ['text/javascript', 'preview.mjs']],
  ['/view.mjs', ['text/javascript', 'view.mjs']],
].map(([route, [type, file]]) => [route, [type, readFileSync(new URL(file, import.meta.url))]]));

function reply(response, status, text, type = 'text/html') {
  response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  response.end(text);
}

function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

function cookie(response, token, maxAge) {
  response.setHeader('Set-Cookie', `lojinha=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

async function form(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16000) {
      const error = new Error('Formulário grande demais.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function webUrl(value, optional = false) {
  if (!value && optional) return '';
  try {
    const url = new URL(value);
    if (value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Format error is reported below. */ }
  throw new Error('Informe links HTTPS válidos para o aplicativo e o ícone.');
}

function loginPage(message = '') {
  return page('Acesso à Lojinha', `${message ? `<p role="alert">${escape(message)}</p>` : ''}
    <form method="post" action="/admin/login">
      <label>Login<input name="login" required maxlength="128" autocomplete="username"></label>
      <label>Senha<input type="password" name="password" required maxlength="512" autocomplete="current-password"></label>
      <button>Entrar</button>
    </form>`, '<a href="/">Voltar à vitrine</a>');
}

async function handle(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; script-src 'self'; img-src https:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  const url = new URL(request.url, origin);
  const route = url.pathname;
  const token = request.headers.cookie?.match(/(?:^|;\s*)lojinha=([a-f0-9]{64})(?:;|$)/)?.[1];
  const now = Date.now();
  const authenticated = (sessions.get(token) ?? 0) > now;
  if (request.method === 'GET') {
    if (assets.has(route)) {
      const [type, content] = assets.get(route);
      return reply(response, 200, content, type);
    }
    if (route === '/') {
      const published = items.filter((item) => item.published);
      const content = published.length ? `<div class="grid">${published.map((item) => card(item)).join('')}</div>` : '<p>Nenhum aplicativo publicado.</p>';
      return reply(response, 200, page('Lojinha EduOS', content, '<a href="/admin">Administrar Lojinha</a>'));
    }
    if (route === '/admin') {
      return reply(response, 200, authenticated ? editor(items, items.find((item) => item.id === url.searchParams.get('id')) ?? {}) : loginPage());
    }
  }
  if (request.method === 'POST' && route.startsWith('/admin/')) {
    if (request.headers.origin !== origin || !request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
      return reply(response, 403, 'Solicitação inválida.', 'text/plain');
    }
    if (route === '/admin/login') {
      if (now < nextLogin) return reply(response, 429, loginPage('Aguarde um momento e tente novamente.'));
      nextLogin = now + 1000;
      const fields = await form(request);
      const entered = scryptSync(fields.get('password') ?? '', salt, 64);
      if (!timingSafeEqual(entered, passwordHash) || fields.get('login') !== login) {
        return reply(response, 401, loginPage('Login ou senha incorretos.'));
      }
      for (const [key, expires] of sessions) if (expires <= now) sessions.delete(key);
      if (token) sessions.delete(token);
      const newToken = randomBytes(32).toString('hex');
      sessions.set(newToken, now + sessionDuration);
      cookie(response, newToken, sessionDuration / 1000);
      return redirect(response, '/admin');
    }
    if (!authenticated) return reply(response, 401, loginPage('Entre para administrar a Lojinha.'));
    if (route === '/admin/logout') {
      sessions.delete(token);
      cookie(response, '', 0);
      return redirect(response, '/');
    }
    if (route === '/admin/app') {
      const fields = await form(request);
      const id = fields.get('id');
      const existing = items.find((item) => item.id === id);
      if (id && !existing) return reply(response, 404, 'Aplicativo não encontrado.', 'text/plain');
      const item = Object.fromEntries(['name', 'category', 'description', 'url', 'icon'].map((key) => [key, fields.get(key)?.trim() ?? '']));
      item.id = existing?.id ?? '';
      item.published = existing?.published ?? false;
      const action = fields.get('action');
      if (action !== 'publish' && action !== 'draft') return reply(response, 400, 'Ação inválida.', 'text/plain');
      try {
        for (const [key, max] of [['name', 80], ['category', 48], ['description', 400]]) {
          if (!item[key] || item[key].length > max) throw new Error('Confira o nome, a categoria e a descrição.');
        }
        item.url = webUrl(item.url);
        item.icon = webUrl(item.icon, true);
      } catch (error) {
        return reply(response, 422, editor(items, { ...item, icon: '' }, error.message));
      }
      item.id ||= randomUUID();
      item.published = action === 'publish';
      const next = existing ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item];
      writeFileSync(`${dataFile}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
      renameSync(`${dataFile}.tmp`, dataFile);
      items = next;
      return redirect(response, `/admin?id=${item.id}`);
    }
  }
  return reply(response, 404, 'Página não encontrada.', 'text/plain');
}

createServer((request, response) => {
  void handle(request, response).catch((error) => {
    const status = error.status ?? 500;
    reply(response, status, status === 500 ? 'Não foi possível concluir a operação.' : error.message, 'text/plain');
  });
}).listen(Number(env.PORT ?? 4310), env.HOST ?? '127.0.0.1');
