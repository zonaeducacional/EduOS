
const __meridian_1 = (() => {
const clone = value => structuredClone(value);
const uid = () => { if (crypto.randomUUID)
    return crypto.randomUUID(); const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = [...b].map(x => x.toString(16).padStart(2, '0')); return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join(''); };
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const debounce = (fn, wait = 300) => { let t; const f = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; f.cancel = () => clearTimeout(t); return f; };
function download(name, data, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
class Events {
    #listeners = new Map();
    on(name, callback) { if (!this.#listeners.has(name))
        this.#listeners.set(name, new Set()); this.#listeners.get(name).add(callback); return () => this.#listeners.get(name)?.delete(callback); }
    emit(name, value) { for (const fn of this.#listeners.get(name) || [])
        fn(value); }
}
class Store extends Events {
    constructor(state, limit = 80) { super(); this.state = state; this.limit = limit; this.past = []; this.future = []; this.revision = 0; }
    transact(label, mutate, mergeKey = '') {
        const before = clone(this.state);
        try {
            mutate(this.state);
        }
        catch (error) {
            this.state = before;
            this.emit('change', { label: 'Rollback', replace: true });
            throw error;
        }
        if (JSON.stringify(before) === JSON.stringify(this.state))
            return false;
        const time = performance.now(), previous = this.past.at(-1);
        if (mergeKey && previous?.mergeKey === mergeKey && time - previous.time < 750 && !this.future.length) {
            previous.after = clone(this.state);
            previous.time = time;
        }
        else {
            this.past.push({ label, before, after: clone(this.state), mergeKey, time });
            if (this.past.length > this.limit)
                this.past.shift();
        }
        this.future.length = 0;
        this.revision++;
        this.emit('change', { label, replace: false });
        return true;
    }
    undo() { const entry = this.past.pop(); if (!entry)
        return; this.future.push(entry); this.state = clone(entry.before); this.revision++; this.emit('change', { label: `Undo ${entry.label}`, replace: true }); }
    redo() { const entry = this.future.pop(); if (!entry)
        return; this.past.push(entry); this.state = clone(entry.after); this.revision++; this.emit('change', { label: `Redo ${entry.label}`, replace: true }); }
    replace(state) { this.state = clone(state); this.past.length = this.future.length = 0; this.revision++; this.emit('change', { label: 'Open project', replace: true }); }
}
class Persistence {
    constructor(key = 'meridian-office-v1') { this.key = key; this.db = null; this.queue = Promise.resolve(); }
    async open() {
        this.db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(this.key, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('projects');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return this;
    }
    async load() { if (!this.db)
        return null; return new Promise((resolve, reject) => { const r = this.db.transaction('projects').objectStore('projects').get('current'); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error); }); }
    save(state) {
        const snapshot = clone(state);
        this.queue = this.queue.catch(() => { }).then(() => new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Local storage is unavailable. Export your project to keep changes.'));
                return;
            }
            const tx = this.db.transaction('projects', 'readwrite');
            tx.objectStore('projects').put(snapshot, 'current');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
        }));
        return this.queue;
    }
}
function sanitizeHTML(html) {
    const parsed = new DOMParser().parseFromString(String(html), 'text/html');
    const allowed = new Set(['P', 'DIV', 'SPAN', 'BR', 'H1', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUB', 'SUP', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'IMG', 'A', 'FONT', 'MARK']);
    const styles = new Set(['color', 'background-color', 'font-weight', 'font-style', 'font-size', 'font-family', 'text-decoration', 'text-align', 'line-height', 'margin-left', 'padding', 'width', 'max-width', 'border', 'border-collapse']);
    for (const el of [...parsed.body.querySelectorAll('*')]) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'LINK', 'META', 'FORM', 'INPUT'].includes(el.tagName)) {
            el.remove();
            continue;
        }
        if (el.tagName === 'FONT') {
            if (el.getAttribute('color')) el.style.color = el.getAttribute('color');
            if (el.getAttribute('face')) el.style.fontFamily = el.getAttribute('face');
            if (el.getAttribute('size')) el.style.fontSize = el.getAttribute('size');
        }
        if (!allowed.has(el.tagName)) {
            el.replaceWith(...el.childNodes);
            continue;
        }
        const safeStyle = [...el.style].filter(k => styles.has(k) && !/url\s*\(|expression|javascript/i.test(el.style.getPropertyValue(k))).map(k => `${k}:${el.style.getPropertyValue(k)}`).join(';');
        const href = el.getAttribute('href'), src = el.getAttribute('src');
        for (const a of [...el.attributes])
            el.removeAttribute(a.name);
        if (safeStyle)
            el.setAttribute('style', safeStyle);
        if (el.tagName === 'A' && /^(https?:|mailto:)/i.test(href || '')) {
            el.href = href;
            el.rel = 'noopener noreferrer';
        }
        if (el.tagName === 'IMG') {
            if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src || '')) {
                el.src = src;
                el.style.maxWidth = '100%';
            }
            else
                el.remove();
        }
    }
    return parsed.body.innerHTML;
}
function validateProject(value) {
    if (!value || value.format !== 'meridian-office' || value.version !== 1)
        throw new Error('This is not a supported Meridian Office project.');
    const state = clone(value);
    const safeId = value => /^[A-Za-z0-9_-]{1,100}$/.test(String(value || '')) ? String(value) : uid();
    if (!state.workbook || !state.deck)
        throw new Error('The project must contain a workbook and presentation.');
    if (!state.writer?.pages?.length || state.writer.pages.length > 200)
        throw new Error('Invalid document pages (limit: 200).');
    state.writer.title = String(state.writer.title || 'Untitled document').slice(0, 200);
    state.workbook.title = String(state.workbook.title || 'Untitled workbook').slice(0, 200);
    state.deck.title = String(state.deck.title || 'Untitled presentation').slice(0, 200);
    state.writer.pages = state.writer.pages.map(p => ({ id: safeId(p.id), html: sanitizeHTML(p.html) }));
    state.writer.comments = (state.writer.comments || []).slice(0, 1000).map(c => ({ id: safeId(c.id), author: String(c.author || 'You'), text: String(c.text || ''), quote: String(c.quote || ''), resolved: !!c.resolved }));
    if (!Array.isArray(state.workbook?.sheets) || !state.workbook.sheets.length || state.workbook.sheets.length > 50)
        throw new Error('Invalid workbook.');
    for (const sheet of state.workbook.sheets) {
        if (!sheet.cells || typeof sheet.cells !== 'object' || Object.keys(sheet.cells).length > 200000)
            throw new Error('Invalid or oversized sheet.');
        const cells = {};
        for (const [key, value] of Object.entries(sheet.cells)) {
            if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(key) || typeof value !== 'object' || value === null)
                continue;
            const style = {};
            for (const key of ['b', 'i', 'u'])
                style[key] = !!value.s?.[key];
            for (const key of ['color', 'fill'])
                if (/^#[0-9a-f]{6}$/i.test(value.s?.[key] || ''))
                    style[key] = value.s[key];
            if (['left', 'center', 'right'].includes(value.s?.align))
                style.align = value.s.align;
            if (['general', 'number', 'currency', 'percent'].includes(value.s?.fmt))
                style.fmt = value.s.fmt;
            style.size = clamp(Number(value.s?.size) || 13, 8, 72);
            cells[key] = { v: String(value.v ?? '').slice(0, 32767), s: style };
        }
        sheet.cells = cells;
        sheet.rows = clamp(Number(sheet.rows) || 10000, 100, 100000);
        sheet.cols = clamp(Number(sheet.cols) || 64, 16, 256);
        sheet.widths = Object.fromEntries(Object.entries(sheet.widths || {}).filter(([k, v]) => /^\d+$/.test(k) && Number.isFinite(v)).map(([k, v]) => [k, clamp(v, 50, 600)]));
        sheet.name = String(sheet.name || 'Sheet').slice(0, 31);
        sheet.id = safeId(sheet.id);
    }
    if (!Array.isArray(state.deck?.slides) || !state.deck.slides.length || state.deck.slides.length > 200)
        throw new Error('Invalid presentation.');
    for (const slide of state.deck.slides) {
        if (!Array.isArray(slide.elements) || slide.elements.length > 1000)
            throw new Error('Invalid slide elements.');
        slide.background = /^#[a-f0-9]{6}$/i.test(slide.background || '') ? slide.background : '#ffffff';
        slide.elements = slide.elements.filter(e => ['text', 'rect', 'ellipse', 'image'].includes(e.type)).map(e => ({
            id: safeId(e.id), type: e.type, x: clamp(Number(e.x) || 0, -960, 1920), y: clamp(Number(e.y) || 0, -540, 1080),
            w: clamp(Number(e.w) || 100, 5, 1920), h: clamp(Number(e.h) || 50, 5, 1080), text: String(e.text || '').slice(0, 50000),
            color: /^#[a-f0-9]{6}$/i.test(e.color || '') ? e.color : '#172c2a', fill: /^#[a-f0-9]{6}$/i.test(e.fill || '') ? e.fill : '#dcece6',
            fontSize: clamp(Number(e.fontSize) || 24, 8, 160), bold: !!e.bold, align: ['left', 'center', 'right'].includes(e.align) ? e.align : 'left',
            radius: clamp(Number(e.radius) || 0, 0, 200), src: /^data:image\/(png|jpeg|webp|gif);base64,/.test(e.src || '') ? e.src : ''
        }));
        slide.id = safeId(slide.id);
        slide.notes = String(slide.notes || '').slice(0, 50000);
    }
    state.deck.activeSlide = clamp(Number(state.deck.activeSlide) || 0, 0, state.deck.slides.length - 1);
    state.workbook.activeSheet = state.workbook.sheets.some(s => s.id === state.workbook.activeSheet) ? state.workbook.activeSheet : state.workbook.sheets[0].id;
    state.title = String(state.title || 'Untitled workspace').slice(0, 200);
    return state;
}

return {clone,uid,escapeHTML,clamp,debounce,download,Events,Store,Persistence,sanitizeHTML,validateProject};
})();
const __meridian_2 = (() => {
const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>', check: '<path d="m5 12 4 4L19 6"/>',
    cloud: '<path d="M7 17H6a4 4 0 0 1-.4-8 6.5 6.5 0 0 1 12.5-1A4.5 4.5 0 0 1 19 17h-1"/><path d="m9 16 2 2 4-5"/>',
    save: '<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
    undo: '<path d="M8 5 3 10l5 5M3 10h10a6 6 0 0 1 0 12" transform="translate(0 -3)"/>',
    redo: '<path d="m16 5 5 5-5 5M21 10H11a6 6 0 0 0 0 12" transform="translate(0 -3)"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    paste: '<path d="M9 5H5v16h14V5h-4"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8 12h8M8 16h6"/>',
    cut: '<circle cx="5" cy="6" r="3"/><circle cx="5" cy="18" r="3"/><path d="m8 7 12 13M8 17 12 12M15 9l5-5"/>',
    brush: '<path d="m14 3 7 7-8 8-7-7 8-8ZM8 13l-5 5v3h3l5-5"/>',
    alignLeft: '<path d="M4 5h16M4 10h10M4 15h16M4 20h10"/>',
    alignCenter: '<path d="M4 5h16M7 10h10M4 15h16M7 20h10"/>',
    alignRight: '<path d="M4 5h16M10 10h10M4 15h16M10 20h10"/>',
    justify: '<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/>',
    list: '<path d="M8 5h12M8 12h12M8 19h12"/><circle cx="3" cy="5" r=".6"/><circle cx="3" cy="12" r=".6"/><circle cx="3" cy="19" r=".6"/>',
    numbered: '<path d="M9 5h11M9 12h11M9 19h11M3 3v4M2 3h1M2 11h3l-3 4h3M2 18h3l-2 2 2 2H2"/>',
    indent: '<path d="M4 4h16M10 9h10M10 14h10M4 19h16m-5-12 4 4-4 4"/>',
    lineHeight: '<path d="m4 3-2 3m2-3 2 3M4 3v18m0 0-2-3m2 3 2-3M10 5h10M10 12h10M10 19h10"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
    link: '<path d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
    comment: '<path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-5 8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M7 9h10M7 13h6"/>',
    export: '<path d="M4 13v8h16v-8M12 16V3m-5 5 5-5 5 5"/>',
    download: '<path d="M4 15v6h16v-6M12 3v12m-5-5 5 5 5-5"/>',
    folder: '<path d="M3 6V4h7l3 3h8v14H3V6Z"/>',
    file: '<path d="M5 3h9l5 5v13H5V3Z"/><path d="M14 3v6h5M8 13h8M8 17h6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',
    settings: '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 2 3-1 3 1 4-2v-4l2-2-2-4-3-1-1-3H9Z"/><circle cx="12" cy="11" r="3"/>',
    moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4M18 4h4"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    page: '<path d="M5 2h14v20H5V2Z"/><path d="M8 6h8M8 10h8M8 14h8M8 18h5"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    print: '<path d="M6 8V2h12v6M6 17H3V8h18v9h-3M6 13h12v9H6V13Z"/><path d="M17 10h1"/>',
    bold: '<path d="M6 3h7a5 5 0 0 1 0 9H6m0 0h8a5 5 0 0 1 0 9H6V3"/>',
    italic: '<path d="M10 3h10M4 21h10M15 3 9 21"/>',
    underline: '<path d="M6 3v8a6 6 0 0 0 12 0V3M4 21h16"/>',
    strikethrough: '<path d="M17 5c-5-5-14 1-8 5M3 12h18M7 19c5 5 14-1 8-5"/>',
    clear: '<path d="m6 17 9-14 7 5-9 14H7l-5-5 6-9M4 13l9 7M15 22h7"/>',
    chart: '<path d="M3 3v18h18M7 16v-5M12 16V6M17 16V9"/>',
    sort: '<path d="M7 3v18m-4-4 4 4 4-4M14 4h7M14 9h5M14 14h3M14 19h1"/>',
    filter: '<path d="M3 4h18l-7 8v8l-4-2v-6L3 4Z"/>',
    sigma: '<path d="M19 3H5l7 9-7 9h14"/>',
    play: '<path d="m8 4 13 8-13 8V4Z"/>',
    slide: '<rect x="2" y="4" width="20" height="15" rx="2"/><path d="M8 23l4-4 4 4M7 9h10M7 13h5"/>',
    rectangle: '<rect x="3" y="5" width="18" height="14" rx="2"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    text: '<path d="M3 4h18M12 4v17M8 21h8M3 4v3M21 4v3"/>',
    front: '<rect x="8" y="3" width="13" height="13" rx="1"/><path d="M8 8H3v13h13v-5"/>',
    back: '<rect x="3" y="8" width="13" height="13" rx="1"/><path d="M8 8V3h13v13h-5"/>',
    trash: '<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    left: '<path d="m14 5-7 7 7 7"/>', right: '<path d="m10 5 7 7-7 7"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
    replace: '<path d="M3 6h14l-3-3m3 3-3 3M21 18H7l3-3m-3 3 3 3M4 11v8M2 15h4M17 10h4v4h-4v-4Z"/>',
    break: '<path d="M5 9V2h14v7M5 15v7h14v-7M2 12h5M10 12h4M17 12h5"/>',
    whatsapp: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M9.5 9a.5.5 0 0 0-.5.5c0 1.2.6 3 2.5 4.9s3.7 2.5 4.9 2.5a.5.5 0 0 0 .5-.5v-1.5a.5.5 0 0 0-.3-.5l-1.5-.6a.5.5 0 0 0-.5.1l-.8.8a6.2 6.2 0 0 1-2.9-2.9l.8-.8a.5.5 0 0 0 .1-.5l-.6-1.5a.5.5 0 0 0-.5-.3H9.5z"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    basket: '<path d="m5 10 7-7 7 7"/><rect x="3" y="10" width="18" height="11" rx="2"/><path d="M10 14v4M14 14v4M7 10v10M17 10v10"/>',
    selectAll: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    tv: '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/>',
    header: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 6h8"/>',
    footer: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18M8 18h8"/>',
    portrait: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    landscape: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h10M7 16h6"/>',
    drive: '<path d="m8.5 3 4.5 7.5L8.5 18H4l4.5-7.5L4 3z" fill="none"/><path d="M8.5 3h7L20 10.5h-7z"/><path d="M12.5 10.5 17 18H8.5l-4.5-7.5z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
};
function icon(name, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`; }

return {icon};
})();
const __meridian_4 = (() => {
/* Vectora geometry kernel. Float64 editing, adaptive cubic curves, winding tessellation,
 * affine transforms, planar boolean operations and a bounding-volume spatial index. */
'use strict';
globalThis.V = globalThis.V || {};
(() => {
    const EPS = 1e-8, TAU = Math.PI * 2, K = .5522847498307936;
    const pt = (x = 0, y = 0) => ({ x, y }), add = (a, b) => pt(a.x + b.x, a.y + b.y), sub = (a, b) => pt(a.x - b.x, a.y - b.y), mul = (a, t) => pt(a.x * t, a.y * t), dot = (a, b) => a.x * b.x + a.y * b.y, cross = (a, b) => a.x * b.y - a.y * b.x, len = a => Math.hypot(a.x, a.y), lerp = (a, b, t) => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), dist = (a, b) => len(sub(a, b));
    const ident = () => [1, 0, 0, 1, 0, 0], matrix = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]], transform = (m, p) => pt(m[0] * p.x + m[2] * p.y + m[4], m[1] * p.x + m[3] * p.y + m[5]);
    function inverse(m) { const d = m[0] * m[3] - m[1] * m[2]; return Math.abs(d) < 1e-12 ? null : [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; }
    const translate = (x, y) => [1, 0, 0, 1, x, y], scale = (x, y = x) => [x, 0, 0, y, 0, 0], rotate = r => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0], around = (m, p) => matrix(translate(p.x, p.y), matrix(m, translate(-p.x, -p.y))), anchor = (x, y, hi = null, ho = null) => ({ x, y, in: hi, out: ho });
    function bounds(points) { let x = Infinity, y = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of points) {
        x = Math.min(x, p.x);
        y = Math.min(y, p.y);
        x2 = Math.max(x2, p.x);
        y2 = Math.max(y2, p.y);
    } if (!Number.isFinite(x))
        return { x: 0, y: 0, x2: 0, y2: 0, w: 0, h: 0 }; return { x, y, x2, y2, w: x2 - x, h: y2 - y }; }
    const unionBounds = bs => bounds(bs.flatMap(b => [pt(b.x, b.y), pt(b.x2, b.y2)])), contains = (b, p, pad = 0) => p.x >= b.x - pad && p.x <= b.x2 + pad && p.y >= b.y - pad && p.y <= b.y2 + pad, overlaps = (a, b) => a.x <= b.x2 && a.x2 >= b.x && a.y <= b.y2 && a.y2 >= b.y;
    function segmentDistance(p, a, b) { let d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), d) / (dot(d, d) || 1))); return dist(p, add(a, mul(d, t))); }
    function cubic(p0, p1, p2, p3, t) { let u = 1 - t; return pt(u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y); }
    function splitCubic(p0, p1, p2, p3, t = .5) { let a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t), d = lerp(a, b, t), e = lerp(b, c, t), f = lerp(d, e, t); return [[p0, a, d, f], [f, e, c, p3]]; }
    function flattenCubic(p0, p1, p2, p3, tol, out, depth = 0) { if (depth >= 14 || (segmentDistance(p1, p0, p3) <= tol && segmentDistance(p2, p0, p3) <= tol)) {
        out.push(pt(p3.x, p3.y));
        return;
    } let [a, b] = splitCubic(p0, p1, p2, p3); flattenCubic(...a, tol, out, depth + 1); flattenCubic(...b, tol, out, depth + 1); }
    function flatten(paths, tol = .35) { return paths.map(path => { let out = [], p = path.points; if (!p.length)
        return { points: out, closed: path.closed }; out.push(pt(p[0].x, p[0].y)); let n = path.closed ? p.length : p.length - 1; for (let i = 0; i < n; i++) {
        let a = p[i], b = p[(i + 1) % p.length];
        if (a.out || b.in)
            flattenCubic(a, a.out || a, b.in || b, b, tol, out);
        else
            out.push(pt(b.x, b.y));
    } if (path.closed && out.length > 1 && dist(out[0], out.at(-1)) < EPS)
        out.pop(); return { points: out, closed: !!path.closed }; }); }
    function shapePaths(n) {
        let w = n.w || 0, h = n.h || 0;
        if (n.type === 'path')
            return n.paths || [];
        if (n.type === 'ellipse') {
            let cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
            return [{ closed: true, points: [anchor(cx, 0, pt(cx - rx * K, 0), pt(cx + rx * K, 0)), anchor(w, cy, pt(w, cy - ry * K), pt(w, cy + ry * K)), anchor(cx, h, pt(cx + rx * K, h), pt(cx - rx * K, h)), anchor(0, cy, pt(0, cy + ry * K), pt(0, cy - ry * K))] }];
        }
        if (n.type === 'polygon' || n.type === 'star') {
            let count = Math.max(3, Math.min(128, n.sides || 5)), p = [], total = n.type === 'star' ? count * 2 : count;
            for (let i = 0; i < total; i++) {
                let a = -Math.PI / 2 + i * TAU / total, r = n.type === 'star' && i % 2 ? (n.innerRatio ?? .45) : 1;
                p.push(anchor(w / 2 + Math.cos(a) * w / 2 * r, h / 2 + Math.sin(a) * h / 2 * r));
            }
            return [{ closed: true, points: p }];
        }
        if (n.type === 'line')
            return [{ closed: false, points: [anchor(0, 0), anchor(w, h)] }];
        let r = Math.max(0, Math.min(n.radius || 0, Math.abs(w) / 2, Math.abs(h) / 2));
        if (!r)
            return [{ closed: true, points: [anchor(0, 0), anchor(w, 0), anchor(w, h), anchor(0, h)] }];
        return [{ closed: true, points: [anchor(r, 0, pt(r - r * K, 0)), anchor(w - r, 0, null, pt(w - r + r * K, 0)), anchor(w, r, pt(w, r - r * K)), anchor(w, h - r, null, pt(w, h - r + r * K)), anchor(w - r, h, pt(w - r + r * K, h)), anchor(r, h, null, pt(r - r * K, h)), anchor(0, h - r, pt(0, h - r + r * K)), anchor(0, r, null, pt(0, r - r * K))] }];
    }
    function localBounds(n) { if (n.type === 'text' || n.type === 'image')
        return { x: 0, y: 0, w: n.w || 100, h: n.h || 30, x2: n.w || 100, y2: n.h || 30 }; return bounds(flatten(shapePaths(n), .2).flatMap(p => p.points)); }
    function worldBounds(n) { let b = localBounds(n), m = n.matrix || ident(); return bounds([pt(b.x, b.y), pt(b.x2, b.y), pt(b.x2, b.y2), pt(b.x, b.y2)].map(p => transform(m, p))); }
    function windingAt(polys, p, rule = 'nonzero') { let w = 0, c = 0; for (let poly of polys) {
        let ps = poly.points || poly;
        for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
            let a = ps[j], b = ps[i];
            if ((a.y > p.y) !== (b.y > p.y)) {
                let x = a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y);
                if (x > p.x) {
                    c++;
                    w += b.y > a.y ? 1 : -1;
                }
            }
        }
    } return rule === 'evenodd' ? !!(c % 2) : w !== 0; }
    function intersection(a, b, c, d) { let r = sub(b, a), s = sub(d, c), den = cross(r, s); if (Math.abs(den) < EPS)
        return null; let q = sub(c, a), t = cross(q, s) / den, u = cross(q, r) / den; if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS)
        return { p: lerp(a, b, t), t, u }; return null; }
    /** Winding-rule scanline tessellation. Splits scan bands at vertices and edge crossings.
     * Supports concave polygons, holes and self-intersections. O(E²) worst-case, worker-isolated. */
    function tessellate(polys, rule = 'nonzero') {
        let edges = [], ys = [], out = [];
        for (let poly of polys) {
            let p = poly.points || poly;
            if (p.length < 3)
                continue;
            for (let i = 0; i < p.length; i++) {
                let a = p[i], b = p[(i + 1) % p.length];
                ys.push(a.y);
                if (Math.abs(a.y - b.y) > EPS)
                    edges.push({ a, b, minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y), minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), sign: b.y > a.y ? 1 : -1 });
            }
        }
        if (edges.length > 16000)
            throw Error('Path exceeds 16,000 tessellation edges. Simplify the path.');
        for (let i = 0; i < edges.length; i++)
            for (let j = i + 1; j < edges.length; j++) {
                let a = edges[i], b = edges[j];
                if (a.maxY <= b.minY + EPS || b.maxY <= a.minY + EPS || a.maxX < b.minX || b.maxX < a.minX)
                    continue;
                let p = intersection(a.a, a.b, b.a, b.b);
                if (p && p.t > EPS && p.t < 1 - EPS && p.u > EPS && p.u < 1 - EPS)
                    ys.push(p.p.y);
            }
        ys.sort((a, b) => a - b);
        ys = ys.filter((y, i) => !i || y - ys[i - 1] > EPS);
        const xAt = (e, y) => e.a.x + (y - e.a.y) * (e.b.x - e.a.x) / (e.b.y - e.a.y), tri = (a, b, c) => { if (Math.abs(cross(sub(b, a), sub(c, a))) > EPS)
            out.push(a.x, a.y, b.x, b.y, c.x, c.y); };
        for (let j = 0; j < ys.length - 1; j++) {
            let y0 = ys[j], y1 = ys[j + 1], ym = (y0 + y1) / 2, active = edges.filter(e => e.minY < ym && e.maxY > ym).map(e => ({ e, x: xAt(e, ym) })).sort((a, b) => a.x - b.x), w = 0, left = null;
            for (let i = 0; i < active.length; i++) {
                let e = active[i].e, old = rule === 'evenodd' ? (w % 2) !== 0 : w !== 0;
                w += rule === 'evenodd' ? 1 : e.sign;
                let inside = rule === 'evenodd' ? (w % 2) !== 0 : w !== 0;
                if (!old && inside)
                    left = e;
                else if (old && !inside && left) {
                    let a = pt(xAt(left, y0), y0), b = pt(xAt(e, y0), y0), c = pt(xAt(e, y1), y1), d = pt(xAt(left, y1), y1);
                    tri(a, b, c);
                    tri(a, c, d);
                    left = null;
                }
            }
        }
        return new Float32Array(out);
    }
    function strokeOutline(polys, width = 1, join = 'round', cap = 'round', miterLimit = 4) {
        let result = [], r = width / 2;
        if (r <= 0)
            return result;
        function circle(p) { let points = [], steps = Math.max(10, Math.min(36, Math.ceil(Math.PI * Math.sqrt(r * 2)))); for (let i = 0; i < steps; i++)
            points.push(add(p, pt(Math.cos(i * TAU / steps) * r, Math.sin(i * TAU / steps) * r))); result.push({ closed: true, points }); }
        const orient = points => { let area = 0; for (let i = 0; i < points.length; i++)
            area += cross(points[i], points[(i + 1) % points.length]); if (area < 0)
            points.reverse(); result.push({ closed: true, points }); };
        for (let poly of polys) {
            let p = poly.points.filter((v, i, a) => !i || dist(v, a[i - 1]) > EPS), n = p.length;
            if (n < 2)
                continue;
            let count = poly.closed ? n : n - 1, dirs = [], normals = [];
            for (let i = 0; i < count; i++) {
                let a = p[i], b = p[(i + 1) % n], d = mul(sub(b, a), 1 / (dist(a, b) || 1)), nn = pt(-d.y * r, d.x * r);
                dirs.push(d);
                normals.push(nn);
                let aa = a, bb = b;
                if (!poly.closed && cap === 'square') {
                    if (i === 0)
                        aa = sub(a, mul(d, r));
                    if (i === count - 1)
                        bb = add(b, mul(d, r));
                }
                orient([add(aa, nn), sub(aa, nn), sub(bb, nn), add(bb, nn)]);
            }
            for (let i = poly.closed ? 0 : 1; i < (poly.closed ? n : n - 1); i++) {
                if (join === 'round') {
                    circle(p[i]);
                    continue;
                }
                let prev = (i - 1 + count) % count, next = i % count;
                for (let side of [-1, 1]) {
                    let a = add(p[i], mul(normals[prev], side)), b = add(p[i], mul(normals[next], side));
                    if (join === 'miter') {
                        let den = cross(dirs[prev], dirs[next]);
                        if (Math.abs(den) > EPS) {
                            let t = cross(sub(b, a), dirs[next]) / den, m = add(a, mul(dirs[prev], t));
                            if (dist(m, p[i]) <= miterLimit * r) {
                                orient([p[i], a, m, b]);
                                continue;
                            }
                        }
                    }
                    orient([p[i], a, b]);
                }
            }
            if (!poly.closed && cap === 'round') {
                circle(p[0]);
                circle(p.at(-1));
            }
        }
        return result;
    }
    const strokeMesh = (polys, width = 1, join = 'round', cap = 'round', miterLimit = 4) => tessellate(strokeOutline(polys, width, join, cap, miterLimit));
    function pathsToD(paths) { const f = v => Number(v.toFixed(4)); let s = ''; for (let path of paths) {
        let p = path.points;
        if (!p.length)
            continue;
        s += `M${f(p[0].x)} ${f(p[0].y)}`;
        for (let i = 1; i < p.length + (path.closed ? 1 : 0); i++) {
            let a = p[i - 1], b = p[i % p.length];
            if (a.out || b.in) {
                let c = a.out || a, d = b.in || b;
                s += `C${f(c.x)} ${f(c.y)} ${f(d.x)} ${f(d.y)} ${f(b.x)} ${f(b.y)}`;
            }
            else
                s += `L${f(b.x)} ${f(b.y)}`;
        }
        if (path.closed)
            s += 'Z';
    } return s; }
    function arcToCubics(a, rx, ry, phi, large, sweep, b) { rx = Math.abs(rx); ry = Math.abs(ry); if (!rx || !ry || dist(a, b) < EPS)
        return []; phi *= Math.PI / 180; let co = Math.cos(phi), si = Math.sin(phi), dx = (a.x - b.x) / 2, dy = (a.y - b.y) / 2, xp = co * dx + si * dy, yp = -si * dx + co * dy, lam = xp * xp / (rx * rx) + yp * yp / (ry * ry); if (lam > 1) {
        let s = Math.sqrt(lam);
        rx *= s;
        ry *= s;
    } let num = Math.max(0, rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp), den = rx * rx * yp * yp + ry * ry * xp * xp, fac = (large === sweep ? -1 : 1) * Math.sqrt(num / (den || 1)), cxp = fac * rx * yp / ry, cyp = -fac * ry * xp / rx, cx = co * cxp - si * cyp + (a.x + b.x) / 2, cy = si * cxp + co * cyp + (a.y + b.y) / 2, theta = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx), end = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx), delta = end - theta; if (sweep && delta < 0)
        delta += TAU; if (!sweep && delta > 0)
        delta -= TAU; let steps = Math.ceil(Math.abs(delta) / (Math.PI / 2)), out = [], map = (x, y) => pt(cx + rx * x * co - ry * y * si, cy + rx * x * si + ry * y * co); for (let i = 0; i < steps; i++) {
        let t0 = theta + delta * i / steps, t1 = theta + delta * (i + 1) / steps, k = 4 / 3 * Math.tan((t1 - t0) / 4);
        out.push([map(Math.cos(t0) - k * Math.sin(t0), Math.sin(t0) + k * Math.cos(t0)), map(Math.cos(t1) + k * Math.sin(t1), Math.sin(t1) - k * Math.cos(t1)), map(Math.cos(t1), Math.sin(t1))]);
    } return out; }
    function parsePath(d) {
        const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [], paths = [];
        let i = 0, cmd = '', cur = pt(), start = pt(), p = null, prevCmd = '', lastC = null, lastQ = null;
        const count = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
        const val = () => { if (i >= tokens.length || /^[a-zA-Z]$/.test(tokens[i]))
            throw Error('Malformed SVG path data'); let v = Number(tokens[i++]); if (!Number.isFinite(v) || Math.abs(v) > 1e7)
            throw Error('SVG coordinate out of range'); return v; }, ensure = () => { if (!p) {
            p = { closed: false, points: [anchor(cur.x, cur.y)] };
            paths.push(p);
        } }, append = b => { ensure(); p.points.push(anchor(b.x, b.y)); cur = b; }, appendC = (c1, c2, b) => { ensure(); p.points.at(-1).out = c1; p.points.push(anchor(b.x, b.y, c2)); cur = b; lastC = c2; };
        while (i < tokens.length) {
            if (/^[a-zA-Z]$/.test(tokens[i]))
                cmd = tokens[i++];
            let op = cmd.toUpperCase(), rel = cmd !== op;
            if (op === 'Z') {
                if (p) {
                    p.closed = true;
                    if (p.points.length > 1 && dist(p.points[0], p.points.at(-1)) < EPS) {
                        let last = p.points.pop();
                        p.points[0].in = last.in;
                    }
                    cur = pt(start.x, start.y);
                }
                cmd = '';
                prevCmd = 'Z';
                lastC = lastQ = null;
                continue;
            }
            if (!(op in count))
                throw Error('Unsupported SVG path command: ' + cmd);
            let old = pt(cur.x, cur.y), get = () => { let x = val(), y = val(); return pt(x + (rel ? old.x : 0), y + (rel ? old.y : 0)); };
            if (op === 'M') {
                cur = get();
                start = pt(cur.x, cur.y);
                p = { closed: false, points: [anchor(cur.x, cur.y)] };
                paths.push(p);
                cmd = rel ? 'l' : 'L';
            }
            else if (op === 'L')
                append(get());
            else if (op === 'H')
                append(pt(val() + (rel ? old.x : 0), old.y));
            else if (op === 'V')
                append(pt(old.x, val() + (rel ? old.y : 0)));
            else if (op === 'C') {
                let a = get(), b = get(), c = get();
                appendC(a, b, c);
            }
            else if (op === 'S') {
                let a = /[CS]/.test(prevCmd) && lastC ? sub(mul(old, 2), lastC) : old, b = get(), c = get();
                appendC(a, b, c);
            }
            else if (op === 'Q') {
                let q = get(), b = get();
                appendC(lerp(old, q, 2 / 3), lerp(b, q, 2 / 3), b);
                lastQ = q;
            }
            else if (op === 'T') {
                let q = /[QT]/.test(prevCmd) && lastQ ? sub(mul(old, 2), lastQ) : old, b = get();
                appendC(lerp(old, q, 2 / 3), lerp(b, q, 2 / 3), b);
                lastQ = q;
            }
            else if (op === 'A') {
                let rx = val(), ry = val(), phi = val(), la = val(), sw = val(), b = get(), cs = arcToCubics(old, rx, ry, phi, !!la, !!sw, b);
                if (!cs.length)
                    append(b);
                else
                    for (let c of cs)
                        appendC(...c);
            }
            if (!/[CS]/.test(op))
                lastC = null;
            if (!/[QT]/.test(op))
                lastQ = null;
            prevCmd = op;
        }
        return paths;
    }
    const transformPaths = (paths, m) => paths.map(p => ({ closed: p.closed, points: p.points.map(a => ({ ...transform(m, a), in: a.in ? transform(m, a.in) : null, out: a.out ? transform(m, a.out) : null })) }));
    function simplify(points, tolerance = 1) { if (points.length <= 2)
        return points; let max = 0, index = 0; for (let i = 1; i < points.length - 1; i++) {
        let d = segmentDistance(points[i], points[0], points.at(-1));
        if (d > max) {
            max = d;
            index = i;
        }
    } return max > tolerance ? [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)] : [points[0], points.at(-1)]; }
    const smoothPath = (points, closed = false, tension = .18) => ({ closed, points: points.map((p, i) => { let prev = points[(i - 1 + points.length) % points.length], next = points[(i + 1) % points.length], v = mul(sub(next, prev), tension); return anchor(p.x, p.y, !closed && i === 0 ? null : sub(p, v), !closed && i === points.length - 1 ? null : add(p, v)); }) });
    function booleanPaths(a, b, op = 'union', ruleA = 'nonzero', ruleB = 'nonzero') {
        const A = flatten(a, .25), B = flatten(b, .25), all = [...A, ...B];
        let edges = [];
        for (let poly of all)
            for (let i = 0; i < poly.points.length; i++) {
                let a = poly.points[i], b = poly.points[(i + 1) % poly.points.length];
                if (dist(a, b) > EPS)
                    edges.push({ a, b, ts: [0, 1] });
            }
        if (edges.length > 5000)
            throw Error('Pathfinder limit: simplify to fewer than 5,000 segments.');
        for (let i = 0; i < edges.length; i++)
            for (let j = i + 1; j < edges.length; j++) {
                let a = edges[i], b = edges[j], k = intersection(a.a, a.b, b.a, b.b);
                if (k) {
                    a.ts.push(Math.max(0, Math.min(1, k.t)));
                    b.ts.push(Math.max(0, Math.min(1, k.u)));
                }
                else
                    for (let [e, p] of [[a, b.a], [a, b.b], [b, a.a], [b, a.b]])
                        if (segmentDistance(p, e.a, e.b) < 1e-7) {
                            let d = sub(e.b, e.a), t = dot(sub(p, e.a), d) / dot(d, d);
                            if (t > EPS && t < 1 - EPS)
                                e.ts.push(t);
                        }
            }
        const f = p => { let x = windingAt(A, p, ruleA), y = windingAt(B, p, ruleB); return op === 'union' ? x || y : op === 'intersect' ? x && y : op === 'subtract' ? x && !y : x !== y; };
        let segs = [], keys = new Set(), bb = bounds(all.flatMap(p => p.points)), epsilon = Math.max(1e-7, Math.max(bb.w, bb.h) * 1e-8), quant = epsilon, key = p => Math.round(p.x / quant) + ',' + Math.round(p.y / quant);
        for (let e of edges) {
            e.ts.sort((a, b) => a - b);
            let ts = e.ts.filter((t, i, a) => !i || t - a[i - 1] > EPS);
            for (let i = 0; i < ts.length - 1; i++) {
                let a = lerp(e.a, e.b, ts[i]), b = lerp(e.a, e.b, ts[i + 1]), d = sub(b, a), l = len(d);
                if (l < epsilon)
                    continue;
                let mid = lerp(a, b, .5), n = pt(-d.y / l * epsilon, d.x / l * epsilon), left = f(add(mid, n)), right = f(sub(mid, n));
                if (left === right)
                    continue;
                if (!left)
                    [a, b] = [b, a];
                let k = key(a) + '>' + key(b);
                if (!keys.has(k)) {
                    keys.add(k);
                    segs.push({ a, b, used: false });
                }
            }
        }
        let map = new Map();
        for (let s of segs) {
            let k = key(s.a);
            if (!map.has(k))
                map.set(k, []);
            map.get(k).push(s);
        }
        let result = [];
        for (let seed of segs) {
            if (seed.used)
                continue;
            let cur = seed, points = [], start = key(seed.a), closed = false;
            for (let guard = 0; guard <= segs.length; guard++) {
                cur.used = true;
                points.push(anchor(cur.a.x, cur.a.y));
                let end = key(cur.b);
                if (end === start) {
                    closed = true;
                    break;
                }
                let candidates = (map.get(end) || []).filter(s => !s.used);
                if (!candidates.length)
                    break;
                let v = sub(cur.b, cur.a);
                candidates.sort((a, b) => { const angle = s => { let w = sub(s.b, s.a); return (Math.atan2(cross(v, w), dot(v, w)) + TAU) % TAU; }; return angle(a) - angle(b); });
                cur = candidates[0];
            }
            if (!closed)
                throw Error('Degenerate intersection. Adjust or simplify the input paths.');
            if (points.length >= 3)
                result.push({ closed: true, points });
        }
        return result;
    }
    class SpatialIndex {
        constructor(items = []) { this.reset(items); }
        reset(items) { const build = items => { if (!items.length)
            return null; let b = unionBounds(items.map(i => i.bounds)); if (items.length <= 8)
            return { bounds: b, items }; let axis = b.w > b.h ? 'x' : 'y'; items.sort((a, b) => a.bounds[axis] - b.bounds[axis]); let mid = items.length >> 1; return { bounds: b, left: build(items.slice(0, mid)), right: build(items.slice(mid)) }; }; this.root = build([...items]); }
        query(box) { let out = []; function walk(n) { if (!n || !overlaps(n.bounds, box))
            return; if (n.items) {
            for (let i of n.items)
                if (overlaps(i.bounds, box))
                    out.push(i);
        }
        else {
            walk(n.left);
            walk(n.right);
        } } walk(this.root); return out; }
    }
    Object.assign(V, { EPS, TAU, pt, add, sub, mul, dot, cross, len, lerp, dist, ident, matrix, transform, inverse, translate, scale, rotate, around, anchor, bounds, unionBounds, contains, overlaps, segmentDistance, cubic, splitCubic, flatten, shapePaths, localBounds, worldBounds, windingAt, intersection, tessellate, strokeOutline, strokeMesh, pathsToD, parsePath, arcToCubics, transformPaths, simplify, smoothPath, booleanPaths, SpatialIndex });
})();
const VectoraGeometry = globalThis.V;


return {VectoraGeometry};
})();
const __meridian_5 = (() => {
/* Modelo de documento vetorial serializável para a suíte Escola Office.
 * Uma transação de histórico (Undo/Redo) por gesto concluído. 100% em Português do Brasil. */
'use strict';
(() => {
    const clone = x => JSON.parse(JSON.stringify(x)), uid = (prefix = 'n') => prefix + '_' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    function node(type, props = {}) { return { id: uid(), type, name: type[0].toUpperCase() + type.slice(1), matrix: V.ident(), fill: '#EB713F', stroke: 'none', strokeWidth: 2, opacity: 1, visible: true, locked: false, fillRule: 'nonzero', lineJoin: 'round', lineCap: 'round', layerId: 'artwork', artboardId: 'board1', ...props, type }; }
    let measuring;
    function measureText(n) { n.fontSize = Math.max(1, Math.min(2048, Number(n.fontSize) || 32)); n.lineHeight = Math.max(.5, Math.min(5, Number(n.lineHeight) || 1.12)); n.letterSpacing = Math.max(-20, Math.min(100, Number(n.letterSpacing) || 0)); if (typeof document === 'undefined')
        return; const ctx = measuring || (measuring = document.createElement('canvas').getContext('2d')); ctx.font = `${n.fontStyle || 'normal'} ${n.fontWeight || 400} ${n.fontSize}px ${n.fontFamily || 'Arial'}`; const lines = String(n.text || '').split('\n'); n.w = Math.max(4, ...lines.map(l => ctx.measureText(l).width + Math.max(0, l.length - 1) * n.letterSpacing)); n.h = Math.max(n.fontSize * 1.2, lines.length * n.fontSize * n.lineHeight); }
    class History {
        constructor(store) { this.store = store; this.entries = []; this.index = 0; this.before = null; this.limit = 60; this.maxBytes = 32 * 1024 * 1024; this.bytes = 0; }
        begin(label) { if (this.before !== null)
            return; this.before = JSON.stringify(this.store.doc); this.label = label; }
        commit() { if (this.before === null)
            return false; const after = JSON.stringify(this.store.doc), before = this.before; this.before = null; if (before === after)
            return false; for (const e of this.entries.splice(this.index))
            this.bytes -= e.bytes; let e = { before, after, label: this.label, bytes: (before.length + after.length) * 2 }; this.entries.push(e); this.bytes += e.bytes; this.index = this.entries.length; while (this.entries.length > 1 && (this.entries.length > this.limit || this.bytes > this.maxBytes)) {
            this.bytes -= this.entries.shift().bytes;
            this.index--;
        } this.store.emit('commit'); return true; }
        cancel() { if (this.before !== null) {
            this.store.doc = JSON.parse(this.before);
            this.before = null;
            this.store.cleanSelection();
            this.store.emit('history');
        } }
        undo() { if (this.before !== null)
            this.commit(); if (!this.index)
            return; this.store.doc = JSON.parse(this.entries[--this.index].before); this.store.cleanSelection(); this.store.emit('history'); }
        redo() { if (this.before !== null)
            this.commit(); if (this.index >= this.entries.length)
            return; this.store.doc = JSON.parse(this.entries[this.index++].after); this.store.cleanSelection(); this.store.emit('history'); }
        clear() { this.entries = []; this.index = 0; this.bytes = 0; this.before = null; }
    }
    class DocumentStore extends EventTarget {
        constructor(doc) { super(); this.doc = doc; this.selection = new Set(); this.activeLayer = doc.layers.find(l => l.id === 'artwork')?.id || doc.layers.at(-1).id; this.activeArtboard = doc.artboards[0].id; this.history = new History(this); this.revision = 0; this.index = new V.SpatialIndex(); this.reindex(); }
        emit(kind = 'change') { this.revision++; if (kind !== 'selection')
            this.reindex(); this.dispatchEvent(new CustomEvent('change', { detail: { kind, revision: this.revision } })); }
        get selected() { return this.doc.nodes.filter(n => this.selection.has(n.id)); }
        get activeBoard() { return this.doc.artboards.find(b => b.id === this.activeArtboard) || this.doc.artboards[0]; }
        get visibleNodes() { return this.doc.layers.flatMap(l => l.visible === false ? [] : this.doc.nodes.filter(n => n.layerId === l.id && n.visible !== false)); }
        isLocked(n) { return n.locked || this.doc.layers.find(l => l.id === n.layerId)?.locked; }
        select(ids, add = false) { if (!add)
            this.selection.clear(); for (let id of ids)
            this.selection.add(id); this.emit('selection'); }
        cleanSelection() { this.selection = new Set([...this.selection].filter(id => this.doc.nodes.some(n => n.id === id))); if (!this.doc.layers.some(l => l.id === this.activeLayer))
            this.activeLayer = this.doc.layers.at(-1).id; if (!this.doc.artboards.some(b => b.id === this.activeArtboard))
            this.activeArtboard = this.doc.artboards[0].id; }
        reindex() { this.index.reset(this.visibleNodes.map((n, order) => { let b = V.worldBounds(n), sw = n.stroke !== 'none' ? (n.strokeWidth || 0) * Math.max(Math.hypot(n.matrix[0], n.matrix[1]), Math.hypot(n.matrix[2], n.matrix[3])) / 2 : 0; return { id: n.id, node: n, order, bounds: { x: b.x - sw, y: b.y - sw, x2: b.x2 + sw, y2: b.y2 + sw } }; })); }
        mutate(label, fn) { this.history.begin(label); try {
            fn();
            this.cleanSelection();
            this.emit();
            this.history.commit();
        }
        catch (e) {
            this.history.cancel();
            throw e;
        } }
        add(n) { n.layerId = this.activeLayer; n.artboardId = this.activeArtboard; this.doc.nodes.push(n); return n; }
        delete() { if (!this.selection.size)
            return; this.mutate('Excluir objetos', () => { this.doc.nodes = this.doc.nodes.filter(n => !this.selection.has(n.id) || this.isLocked(n)); this.selection.clear(); }); }
        duplicate(offset = 20) { let ids = []; this.mutate('Duplicar objetos', () => { const groups = new Map(); for (let n of this.selected) {
            if (this.isLocked(n))
                continue;
            let c = clone(n);
            c.id = uid();
            c.name = n.name + ' cópia';
            c.matrix = V.matrix(V.translate(offset, offset), c.matrix);
            if (c.groupId) {
                if (!groups.has(c.groupId))
                    groups.set(c.groupId, uid('group'));
                c.groupId = groups.get(c.groupId);
            }
            this.doc.nodes.push(c);
            ids.push(c.id);
        } this.selection = new Set(ids); }); return ids; }
        group() { if (this.selection.size < 2)
            return; this.mutate('Agrupar objetos', () => { let id = uid('group'); for (let n of this.selected)
            if (!this.isLocked(n))
                n.groupId = id; }); }
        ungroup() { this.mutate('Desagrupar objetos', () => { for (let n of this.selected)
            if (!this.isLocked(n))
                delete n.groupId; }); }
        arrange(where) { this.mutate('Organizar camadas', () => { let nodes = this.doc.nodes, sel = this.selection; if (where === 'front' || where === 'back') {
            let a = nodes.filter(n => sel.has(n.id)), b = nodes.filter(n => !sel.has(n.id));
            this.doc.nodes = where === 'front' ? [...b, ...a] : [...a, ...b];
        }
        else if (where === 'forward') {
            for (let i = nodes.length - 2; i >= 0; i--)
                if (sel.has(nodes[i].id) && !sel.has(nodes[i + 1].id))
                    [nodes[i], nodes[i + 1]] = [nodes[i + 1], nodes[i]];
        }
        else
            for (let i = 1; i < nodes.length; i++)
                if (sel.has(nodes[i].id) && !sel.has(nodes[i - 1].id))
                    [nodes[i], nodes[i - 1]] = [nodes[i - 1], nodes[i]]; }); }
        transformSelected(m) { for (let n of this.selected)
            if (!this.isLocked(n))
                n.matrix = V.matrix(m, n.matrix); this.emit(); }
        selectionBounds() { return this.selected.length ? V.unionBounds(this.selected.map(V.worldBounds)) : null; }
        align(mode) { if (!this.selection.size)
            return; this.mutate('Alinhar ' + mode, () => { let nodes = this.selected.filter(n => !this.isLocked(n)), board = this.activeBoard, box = nodes.length === 1 ? { x: board.x, y: board.y, x2: board.x + board.w, y2: board.y + board.h } : this.selectionBounds(); for (let n of nodes) {
            let b = V.worldBounds(n), dx = 0, dy = 0;
            if (mode === 'left')
                dx = box.x - b.x;
            if (mode === 'center')
                dx = (box.x + box.x2 - b.x - b.x2) / 2;
            if (mode === 'right')
                dx = box.x2 - b.x2;
            if (mode === 'top')
                dy = box.y - b.y;
            if (mode === 'middle')
                dy = (box.y + box.y2 - b.y - b.y2) / 2;
            if (mode === 'bottom')
                dy = box.y2 - b.y2;
            n.matrix = V.matrix(V.translate(dx, dy), n.matrix);
        } }); }
        distribute(axis) { if (this.selected.length < 3)
            return; this.mutate('Distribuir objetos', () => { let ns = this.selected.filter(n => !this.isLocked(n)).map(n => ({ n, b: V.worldBounds(n) })).sort((a, b) => a.b[axis] - b.b[axis]), first = ns[0].b[axis], last = ns.at(-1).b[axis], step = (last - first) / (ns.length - 1); ns.forEach(({ n, b }, i) => { let d = first + i * step - b[axis]; n.matrix = V.matrix(V.translate(axis === 'x' ? d : 0, axis === 'y' ? d : 0), n.matrix); }); }); }
        convertToPath() { this.mutate('Converter em caminho', () => { for (let n of this.selected)
            if (!this.isLocked(n) && n.type !== 'text' && n.type !== 'image') {
                n.paths = clone(V.shapePaths(n));
                n.type = 'path';
            } }); }
        boolean(op) { let ns = this.selected.filter(n => !this.isLocked(n) && n.type !== 'text' && n.type !== 'image'); if (ns.length < 2)
            throw Error('Selecione ao menos duas formas vetoriais.'); this.mutate('Pathfinder: ' + op, () => { let paths = V.transformPaths(V.shapePaths(ns[0]), ns[0].matrix); for (let n of ns.slice(1))
            paths = V.booleanPaths(paths, V.transformPaths(V.shapePaths(n), n.matrix), op, ns[0].fillRule, n.fillRule); let ids = new Set(ns.map(n => n.id)), result = node('path', { ...clone(ns[0]), id: uid(), name: { union: 'Forma unida', subtract: 'Forma recortada', intersect: 'Interseção', xor: 'Exclusão' }[op], paths, matrix: V.ident(), groupId: undefined }); this.doc.nodes = this.doc.nodes.filter(n => !ids.has(n.id)); if (paths.length) {
            this.doc.nodes.push(result);
            this.selection = new Set([result.id]);
        }
        else
            this.selection.clear(); }); }
    }
    function validColor(value, allowNone = true) { return typeof value === 'string' && value.length <= 160 && (allowNone && value === 'none' || (!/[;<>]|url\s*\(|var\s*\(/i.test(value) && (globalThis.CSS?.supports ? CSS.supports('color', value) : /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([\w\s.,%+\-/]+\))$/i.test(value)))); }
    function validateDocument(raw) { if (!raw || raw.format !== 'vectora' || raw.version !== 1 || !Array.isArray(raw.nodes) || !Array.isArray(raw.artboards) || !Array.isArray(raw.layers))
        throw Error('Não é um documento vetorial compatível.'); if (raw.nodes.length > 10000 || raw.artboards.length > 100 || !raw.artboards.length || !raw.layers.length)
        throw Error('O documento excede os limites suportados.'); const doc = clone(raw), ids = new Set(), finite = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7; let anchors = 0; for (let l of doc.layers) {
        if (!validColor(l.color || '#80ADFF', false))
            throw Error('Cor de camada inválida.');
    } for (let b of doc.artboards) {
        if (!validColor(b.background || '#FFFFFF', false))
            throw Error('Cor de prancheta inválida.');
        if (![b.x, b.y, b.w, b.h].every(finite) || b.w < 1 || b.h < 1)
            throw Error('Dimensões da prancheta inválidas.');
    } for (let n of doc.nodes) {
        if (ids.has(n.id) || typeof n.id !== 'string')
            throw Error('ID de objeto inválido ou duplicado.');
        ids.add(n.id);
        if (!['rect', 'ellipse', 'polygon', 'star', 'path', 'line', 'text', 'image'].includes(n.type))
            throw Error('Tipo de objeto não suportado.');
        if (!Array.isArray(n.matrix) || n.matrix.length !== 6 || !n.matrix.every(finite))
            throw Error('Transformação inválida.');
        if (!doc.layers.some(l => l.id === n.layerId))
            n.layerId = doc.layers[0].id;
        if (!doc.artboards.some(b => b.id === n.artboardId))
            n.artboardId = doc.artboards[0].id;
        for (let k of ['w', 'h', 'radius', 'sides', 'innerRatio'])
            if (n[k] !== undefined && !finite(n[k]))
                throw Error('Geometria inválida.');
        if (n.paths && !Array.isArray(n.paths))
            throw Error('Lista de caminhos inválida.');
        for (let p of n.paths || []) {
            if (!Array.isArray(p.points))
                throw Error('Pontos de ancoragem inválidos.');
            anchors += p.points.length;
            for (let a of p.points)
                for (let q of [a, a.in, a.out].filter(Boolean))
                    if (!finite(q.x) || !finite(q.y))
                        throw Error('Coordenadas de caminho inválidas.');
        }
        if (n.type === 'image' && !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(n.src || ''))
            throw Error('Apenas imagens embutidas são aceitas.');
        if (n.type === 'text') {
            n.text = String(n.text || '').slice(0, 100000);
            measureText(n);
        }
        n.opacity = Number.isFinite(Number(n.opacity)) ? Math.max(0, Math.min(1, Number(n.opacity))) : 1;
        n.strokeWidth = Math.max(0, Math.min(2000, Number(n.strokeWidth) || 0));
        if (typeof n.fill === 'object' && n.fill) {
            if (n.fill.type !== 'linear' || typeof n.fill.color0 !== 'string' || typeof n.fill.color1 !== 'string')
                throw Error('Gradiente linear inválido.');
            if (!validColor(n.fill.color0, false) || !validColor(n.fill.color1, false))
                throw Error('Cor de gradiente inválida.');
        }
        else if (!validColor(n.fill))
            throw Error('Cor de preenchimento inválida.');
        if (!validColor(n.stroke))
            throw Error('Cor de contorno inválida.');
    } if (anchors > 50000)
        throw Error('Caminho excede o limite máximo de 50.000 nós.'); return doc; }
    function blankDocument(title = 'Ilustração sem título') { return { format: 'vectora', version: 1, title, width: 1200, height: 800, artboards: [{ id: 'board1', name: 'Prancheta 1', x: 0, y: 0, w: 1200, h: 800, background: '#FFFFFF' }], layers: [{ id: 'artwork', name: 'Desenho', color: '#8c3b1d', visible: true, locked: false }], nodes: [] }; }
    function demoDocument() {
        let d = blankDocument('Estudo de Formas e Proporções - Artes & Geometria');
        d.artboards = [
            { id: 'board1', name: 'Cartaz Pedagógico (A4 Paisagem)', x: 0, y: 0, w: 840, h: 594, background: '#FDFBF7' },
            { id: 'board2', name: 'Sólidos e Ângulos', x: 920, y: 0, w: 420, h: 594, background: '#2E2820' },
            { id: 'board3', name: 'Gráfico Conceitual', x: 1400, y: 0, w: 420, h: 594, background: '#F5EBE1' }
        ];
        let nodes = d.nodes;
        d.layers = [
            { id: 'background', name: 'Fundo e Réguas', color: '#B294E8', visible: true, locked: false },
            { id: 'artwork', name: 'Formas Vetoriais', color: '#8c3b1d', visible: true, locked: false },
            { id: 'type', name: 'Tipografia Escolar', color: '#2d6a4f', visible: true, locked: false }
        ];
        const shape = (type, x, y, w, h, fill, extra = {}) => { let n = node(type, { w, h, fill, matrix: V.translate(x, y), ...extra }); nodes.push(n); return n; };
        const text = (txt, x, y, size, fill, extra = {}) => { let n = node('text', { text: txt, fontSize: size, fontFamily: 'Inter, Arial', fontWeight: 400, lineHeight: 1.15, letterSpacing: 0, fill, matrix: V.translate(x, y), layerId: 'type', ...extra }); measureText(n); nodes.push(n); return n; };
        const path = (name, paths, fill, extra = {}) => { let n = node('path', { name, paths, fill, ...extra }); nodes.push(n); return n; };

        // Prancheta 1: Cartaz Pedagógico
        text('ESCOLA MUNICIPAL DE SALINAS DA MARGARIDA', 48, 38, 12, '#7A6E60', { letterSpacing: 1.5, fontWeight: 600, name: 'Identificação Escolar' });
        shape('line', 48, 62, 744, 0, 'none', { stroke: '#8c3b1d', strokeWidth: 2, layerId: 'background', name: 'Linha Guia' });
        text('FORMA &\nGEOMETRIA', 48, 100, 68, '#2E2820', { fontWeight: 800, letterSpacing: -2, name: 'Título Principal' });
        text('A geometria como linguagem do espaço, da arte\ne do pensamento crítico na educação básica.', 48, 255, 16, '#5C4E3D', { lineHeight: 1.4, name: 'Subtítulo' });
        
        // Ilustração matemática/artística central
        let center = V.pt(560, 340), count = 9;
        for (let k = count - 1; k >= 0; k--) {
            let r = 36 + k * 14, ps = [];
            for (let i = 0; i < 48; i++) {
                let a = i * V.TAU / 48, rr = r * (1 + .14 * Math.cos(3 * a + .3) + .08 * Math.sin(4 * a - .5)), p = V.pt(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * .92);
                p = V.transform(V.rotate(-.2), p);
                ps.push(V.add(center, p));
            }
            path('Camada Ondular ' + (k + 1), [V.smoothPath(ps, true, .18)], k % 2 ? '#8c3b1d' : '#F5EBE1', { layerId: 'artwork' });
        }
        shape('ellipse', 525, 305, 70, 70, { type: 'linear', color0: '#F4A27B', color1: '#8c3b1d', angle: 45 }, { name: 'Núcleo em Gradiente' });
        shape('ellipse', 545, 325, 30, 30, '#FFFFFF', { name: 'Ponto Focal' });

        shape('line', 48, 520, 744, 0, 'none', { stroke: '#E2D8C7', strokeWidth: 1.5, layerId: 'background', name: 'Divisor Inferior' });
        text('PROF. SÉRGIO ARAÚJO  ·  PROJETO INTERDISCIPLINAR', 48, 545, 11, '#7A6E60', { fontWeight: 600, letterSpacing: 1.2, name: 'Rodapé Autor' });
        text('ANO LETIVO 2026', 680, 545, 11, '#8c3b1d', { fontWeight: 700, name: 'Ano' });

        // Prancheta 2: Sólidos e Ângulos (Fundo Escuro)
        text('ESTUDO VETORIAL', 960, 42, 10, '#E2D8C7', { letterSpacing: 1.6, artboardId: 'board2' });
        text('Simetria e\nProporção Áurea', 960, 95, 32, '#FFFFFF', { fontWeight: 700, artboardId: 'board2', name: 'Título Prancheta 2' });
        let star = shape('star', 1060, 240, 140, 140, '#F4A27B', { sides: 8, innerRatio: .5, name: 'Estrela Geométrica', artboardId: 'board2' });
        star.matrix = V.matrix(star.matrix, V.around(V.rotate(.25), V.pt(70, 70)));
        text('Construção com compasso e régua virtual.', 960, 480, 13, '#A5A6AA', { artboardId: 'board2' });

        // Prancheta 3: Gráfico Conceitual
        text('INFOGRÁFICO', 1440, 42, 10, '#8c3b1d', { letterSpacing: 1.4, artboardId: 'board3' });
        text('Círculos de Afinidade\ne Território', 1440, 90, 26, '#2E2820', { fontWeight: 700, artboardId: 'board3' });
        for (let i = 0; i < 5; i++) {
            let e = shape('ellipse', 1460 + i * 15, 230 + i * 12, 160, 130, 'none', { stroke: '#8c3b1d', strokeWidth: 2, opacity: 0.8 - i * 0.12, name: 'Órbita ' + (i + 1), artboardId: 'board3' });
            e.matrix = V.matrix(e.matrix, V.around(V.rotate(-.35), V.pt(80, 65)));
        }
        text('Comunidade, escola e saberes locais.', 1440, 490, 13, '#5C4E3D', { artboardId: 'board3' });

        return d;
    }
    Object.assign(V, { validColor, clone, uid, node, measureText, History, DocumentStore, validateDocument, blankDocument, demoDocument });
})();
const VectoraDocument = globalThis.V;


return {VectoraDocument};
})();
const __meridian_6 = (() => {
'use strict';
/* Modelo de Dados do Escola Forms: Validações, Gabarito e Formulário Demonstrativo */

globalThis.FormsDoc = globalThis.FormsDoc || {};

(() => {
    const uid = () => Math.random().toString(36).slice(2, 9);
    const clone = obj => JSON.parse(JSON.stringify(obj));

    function blankForm(title = 'Nova Avaliação / Formulário Escolar') {
        return {
            id: 'form_' + uid(),
            format: 'escola-forms',
            version: 1,
            title,
            school: 'Escola Municipal de Salinas da Margarida',
            teacher: 'Prof. Sérgio Araújo',
            subject: 'História & Ciências Humanas',
            grade: '9º Ano A',
            description: 'Responda com atenção a todas as questões propostas. A pontuação é gerada automaticamente ao concluir.',
            showScoreImmediately: true,
            shuffleQuestions: false,
            questions: [
                {
                    id: 'q_' + uid(),
                    type: 'choice',
                    title: 'Qual foi o principal fator para a organização dos saberes locais em comunidades tradicionais?',
                    points: 2.5,
                    required: true,
                    options: [
                        { id: 'opt_1', text: 'A transmissão oral da memória e a relação com o meio ambiente marinho/manguezal.' },
                        { id: 'opt_2', text: 'O isolamento total das rotas de navegação da Baía de Todos-os-Santos.' },
                        { id: 'opt_3', text: 'A substituição completa da cultura local por compêndios impressos.' },
                        { id: 'opt_4', text: 'A recusa do diálogo entre a ciência e a ancestralidade.' }
                    ],
                    correctAnswer: 'opt_1',
                    feedback: 'Excelente! A memória oral e o conhecimento prático da comunidade mariscadora e pesqueira são os pilares da identidade local.'
                }
            ],
            responses: []
        };
    }

    function demoForm() {
        return {
            id: 'form_demo_salinas',
            format: 'escola-forms',
            version: 1,
            title: 'Avaliação Diagnóstica — Memória, Território e Identidade',
            school: 'Escola Municipal de Ensino Fundamental',
            teacher: 'Prof. Sérgio Araújo',
            subject: 'História e Estudos Regionais',
            grade: '9º Ano A — Ensino Fundamental II',
            description: 'Atividade interdisciplinar sobre o patrimônio histórico, cultural e ambiental de Salinas da Margarida e do Recôncavo Baiano.',
            showScoreImmediately: true,
            shuffleQuestions: false,
            questions: [
                {
                    id: 'q1',
                    type: 'choice',
                    title: '1. Sobre a formação histórica do município de Salinas da Margarida no Recôncavo Baiano, assinale a opção CORRETA:',
                    points: 2.5,
                    required: true,
                    options: [
                        { id: 'opt_1a', text: 'Sua história está intimamente ligada às salinas naturais, à pesca artesanal e ao extrativismo marinho sustentável.' },
                        { id: 'opt_1b', text: 'Desenvolveu-se exclusivamente pela mineração de metais preciosos no século XVIII.' },
                        { id: 'opt_1c', text: 'Não possui ligação cultural ou econômica com a Baía de Todos-os-Santos.' },
                        { id: 'opt_1d', text: 'Foi fundada como um polo industrial siderúrgico de grande porte.' }
                    ],
                    correctAnswer: 'opt_1a',
                    feedback: 'Correto! Salinas da Margarida destaca-se por sua riquíssima tradição pesqueira e extrativista vinculada às águas da baía.'
                },
                {
                    id: 'q2',
                    type: 'checkbox',
                    title: '2. Quais dos elementos a seguir constituem o Patrimônio Cultural Imaterial e Ambiental de nossa comunidade? (Selecione todos que se aplicam)',
                    points: 2.5,
                    required: true,
                    options: [
                        { id: 'opt_2a', text: 'Os saberes tradicionais das mariscadeiras e pescadores locais.' },
                        { id: 'opt_2b', text: 'A preservação dos ecossistemas de manguezal e vegetação nativa.' },
                        { id: 'opt_2c', text: 'As manifestações culturais, festejos populares e memória oral dos mais velhos.' },
                        { id: 'opt_2d', text: 'A poluição desenfreada e o descarte ilegal de resíduos nos rios.' }
                    ],
                    correctAnswer: ['opt_2a', 'opt_2b', 'opt_2c'],
                    feedback: 'Muito bem! As tradições orais, a sabedoria das mariscadeiras e o respeito aos manguezais formam nosso patrimônio vivo.'
                },
                {
                    id: 'q3',
                    type: 'scale',
                    title: '3. Em uma escala de 1 a 5, como você avalia o seu interesse em pesquisar a história de sua própria família e comunidade?',
                    points: 1.0,
                    required: false,
                    min: 1,
                    max: 5,
                    minLabel: 'Pouco interesse',
                    maxLabel: 'Extremamente motivado(a)',
                    feedback: 'Investigar nossas origens fortalece nossa cidadania e o orgulho de nossa terra!'
                },
                {
                    id: 'q4',
                    type: 'essay',
                    title: '4. Em poucas linhas, explique por que "aprender a transformar o mundo ao nosso redor" envolve valorizar os saberes da nossa escola e da nossa comunidade.',
                    points: 4.0,
                    required: true,
                    placeholder: 'Escreva sua reflexão pedagógica aqui...',
                    sampleAnswer: 'Valorizar os saberes locais permite que o conhecimento escolar ganhe sentido prático na vida dos estudantes, conectando teoria e realidade.',
                    feedback: 'Respostas dissertativas são analisadas com atenção pelo professor na revisão pedagógica.'
                }
            ],
            responses: [
                {
                    id: 'resp_1',
                    studentName: 'Ana Clara Souza',
                    studentClass: '9º Ano A',
                    timestamp: '2026-09-07T14:30:00Z',
                    score: 9.0,
                    maxScore: 10.0,
                    answers: {
                        'q1': 'opt_1a',
                        'q2': ['opt_2a', 'opt_2b', 'opt_2c'],
                        'q3': 5,
                        'q4': 'Aprender sobre nossa cidade nos ajuda a cuidar do manguezal e das pessoas da nossa terra.'
                    }
                },
                {
                    id: 'resp_2',
                    studentName: 'Carlos Eduardo Silva',
                    studentClass: '9º Ano A',
                    timestamp: '2026-09-07T14:45:00Z',
                    score: 6.5,
                    maxScore: 10.0,
                    answers: {
                        'q1': 'opt_1a',
                        'q2': ['opt_2a', 'opt_2b'],
                        'q3': 4,
                        'q4': 'Porque a escola e nossa família andam juntas para ensinar o que é certo.'
                    }
                },
                {
                    id: 'resp_3',
                    studentName: 'Beatriz Santos Lima',
                    studentClass: '9º Ano A',
                    timestamp: '2026-09-07T15:10:00Z',
                    score: 10.0,
                    maxScore: 10.0,
                    answers: {
                        'q1': 'opt_1a',
                        'q2': ['opt_2a', 'opt_2b', 'opt_2c'],
                        'q3': 5,
                        'q4': 'A transformação social começa quando respeitamos a história de Salinas e usamos a educação para construir o futuro.'
                    }
                }
            ]
        };
    }

    function calculateScore(form, answers) {
        let score = 0;
        let maxScore = 0;

        for (const q of form.questions) {
            const pts = Number(q.points) || 0;
            maxScore += pts;
            const ans = answers[q.id];

            if (q.type === 'choice') {
                if (ans === q.correctAnswer) score += pts;
            } else if (q.type === 'checkbox') {
                const userAns = Array.isArray(ans) ? ans.sort() : [];
                const correctAns = Array.isArray(q.correctAnswer) ? [...q.correctAnswer].sort() : [];
                if (JSON.stringify(userAns) === JSON.stringify(correctAns)) {
                    score += pts;
                } else if (userAns.length && userAns.every(x => correctAns.includes(x))) {
                    score += pts * (userAns.length / correctAns.length);
                }
            } else if (q.type === 'scale') {
                if (ans !== undefined && ans !== null) score += pts;
            } else if (q.type === 'text' || q.type === 'essay') {
                if (ans && String(ans).trim().length >= 3) score += pts;
            }
        }

        return {
            score: Math.round(score * 10) / 10,
            maxScore: Math.round(maxScore * 10) / 10,
            percent: maxScore ? Math.round((score / maxScore) * 100) : 0
        };
    }

    function validateForm(form) {
        if (!form || typeof form !== 'object') throw new Error('Formulário inválido.');
        if (!form.title) form.title = 'Avaliação sem título';
        if (!Array.isArray(form.questions)) form.questions = [];
        if (!Array.isArray(form.responses)) form.responses = [];
        return form;
    }

    Object.assign(globalThis.FormsDoc, {
        uid,
        clone,
        blankForm,
        demoForm,
        calculateScore,
        validateForm
    });
})();

const FormsDoc = globalThis.FormsDoc;

return {FormsDoc};
})();
const __meridian_3 = (() => {
const { uid } = __meridian_1;
const { VectoraGeometry } = __meridian_4;
const { VectoraDocument } = __meridian_5;
const { FormsDoc } = __meridian_6;
function makeSample() {
    const cell = (v, s = {}) => ({ v: String(v), s }), cells = {};
    
    // Planilha Escolar: Diário de Notas e Desempenho da Turma
    cells.A1 = cell('ESCOLA MUNICIPAL · DIÁRIO DE CLASSE E NOTAS', { b: true, color: '#8c3b1d', size: 15 });
    cells.A2 = cell('9º Ano A · História e Ciências Humanas · Ano Letivo 2026', { color: '#7a6e60' });
    
    const headers = ['Estudante', 'Unidade I', 'Unidade II', 'Unidade III', 'Unidade IV', 'Média Final', 'Situação'];
    headers.forEach((h, c) => cells[`${String.fromCharCode(65 + c)}4`] = cell(h, { b: true, fill: '#f5ebe1', color: '#592c19' }));
    
    const students = [
        ['Ana Clara Souza', 8.5, 7.5, 9.0, 8.0],
        ['Carlos Eduardo Silva', 6.0, 5.5, 7.0, 6.5],
        ['Beatriz Santos Lima', 9.5, 9.0, 10.0, 9.5],
        ['Davi Santana Barreto', 5.0, 6.0, 5.5, 6.5],
        ['Fernanda Oliveira', 7.5, 8.0, 8.5, 8.0],
        ['Gabriel Conceição', 8.0, 8.5, 7.0, 7.5],
        ['Helena Ramos', 9.0, 9.5, 9.5, 10.0],
        ['Lucas Pereira Santos', 4.5, 5.0, 6.0, 5.5]
    ];
    
    students.forEach((row, i) => {
        const r = i + 5;
        cells[`A${r}`] = cell(row[0], { fill: i % 2 === 0 ? '#faf7f2' : '#ffffff' });
        for (let c = 1; c <= 4; c++) {
            cells[`${String.fromCharCode(65 + c)}${r}`] = cell(row[c], { fill: i % 2 === 0 ? '#faf7f2' : '#ffffff', fmt: 'number', color: '#2e2820' });
        }
        cells[`F${r}`] = cell(`=ROUND(AVERAGE(B${r}:E${r}),1)`, { b: true, fmt: 'number', fill: '#f5efe6' });
        cells[`G${r}`] = cell(`=IF(F${r}>=6.0,"Aprovado","Recuperação")`, { b: true, color: '#8c3b1d', fill: '#fbf8f2' });
    });
    
    const totalRow = students.length + 5;
    cells[`A${totalRow}`] = cell('MÉDIA GERAL DA TURMA', { b: true, fill: '#eedfd0', color: '#8c3b1d' });
    for (const c of ['B', 'C', 'D', 'E', 'F']) {
        cells[`${c}${totalRow}`] = cell(`=ROUND(AVERAGE(${c}5:${c}${totalRow - 1}),1)`, { b: true, fmt: 'number', fill: '#eedfd0', color: '#8c3b1d' });
    }
    cells[`G${totalRow}`] = cell('Meta: ≥ 7.0', { color: '#7a6e60', fill: '#eedfd0' });
    
    const summaryStart = totalRow + 3;
    cells[`A${summaryStart}`] = cell('Indicadores Pedagógicos', { b: true, color: '#8c3b1d', size: 13 });
    cells[`A${summaryStart + 1}`] = cell('Total de Estudantes Avaliados');
    cells[`B${summaryStart + 1}`] = cell(`=COUNTA(A5:A${totalRow - 1})`, { b: true });
    cells[`A${summaryStart + 2}`] = cell('Maior Média da Turma');
    cells[`B${summaryStart + 2}`] = cell(`=MAX(F5:F${totalRow - 1})`, { b: true, color: '#2d6a4f' });
    cells[`A${summaryStart + 3}`] = cell('Menor Média Registrada');
    cells[`B${summaryStart + 3}`] = cell(`=MIN(F5:F${totalRow - 1})`, { b: true, color: '#8c3b1d' });

    // Segunda aba: Estatísticas e Censo Escolar
    const censoCells = {
        A1: cell('PROJETOS PEDAGÓGICOS E PARTICIPAÇÃO', { b: true, size: 15, color: '#8c3b1d' }),
        A2: cell('Distribuição dos estudantes por área de pesquisa escolar', { color: '#7a6e60' }),
        A4: cell('Projeto / Área Temática', { b: true, fill: '#f5ebe1', color: '#592c19' }),
        B4: cell('Nº de Alunos', { b: true, fill: '#f5ebe1', color: '#592c19' }),
        A5: cell('Memória e Patrimônio Cultural'), B5: cell(28),
        A6: cell('História e Meio Ambiente (Manguezal)'), B6: cell(34),
        A7: cell('Matemática e Educação Financeira'), B7: cell(22),
        A8: cell('Ciência, Tecnologia e Invenção'), B8: cell(30),
        A9: cell('Literatura, Poesia e Cordel'), B9: cell(26),
        A10: cell('TOTAL DE PARTICIPANTES', { b: true, fill: '#eedfd0', color: '#8c3b1d' }),
        B10: cell('=SUM(B5:B9)', { b: true, fill: '#eedfd0', color: '#8c3b1d' })
    };

    const text = (text, x, y, w, h, size = 24, color = '#2e2820', bold = false, align = 'left') => ({ id: uid(), type: 'text', text, x, y, w, h, fontSize: size, color, bold, align });
    const rect = (x, y, w, h, fill, radius = 0) => ({ id: uid(), type: 'rect', x, y, w, h, fill, radius });

    return {
        format: 'meridian-office',
        version: 1,
        title: 'Caderno de Estudos',
        writer: {
            title: 'Memória e Território · Salinas da Margarida',
            margins: 'normal',
            pageWidth: 'normal',
            columns: 1,
            header: {
                enabled: false,
                text: '',
                align: 'center',
                showLine: true,
                skipFirstPage: false
            },
            footer: {
                enabled: true,
                text: 'ESCOLA OFFICE / MEMÓRIA E TERRITÓRIO · SALINAS DA MARGARIDA',
                showTitle: false,
                align: 'left',
                showLine: false,
                skipFirstPage: false
            },
            pageNumbering: {
                enabled: true,
                format: 'page-of-total',
                position: 'bottom-right',
                showOnFirstPage: true
            },
            comments: [
                { id: uid(), author: 'Prof. Sérgio', text: 'Excelente articulação entre o relato oral dos pescadores e os documentos históricos do município.', quote: 'O mar e os manguezais guardam narrativas seculares', resolved: false },
                { id: uid(), author: 'Coordenação Pedagógica', text: 'Estrutura dissertativa primorosa com citações e contextualização territorial muito clara.', quote: 'Educar é impregnar de sentido tudo o que fazemos', resolved: false }
            ],
            pages: [
                {
                    id: uid(),
                    html: `<p style="font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:2px;color:#8c3b1d">ESCOLA MUNICIPAL DE ENSINO FUNDAMENTAL &nbsp; / &nbsp; PESQUISA HISTÓRICA</p>
<p style="font-style:italic;font-size:13px;color:#706253">Caderno de Estudos Regionais &nbsp; • &nbsp; Baía de Todos-os-Santos &nbsp; • &nbsp; Ano Letivo 2026</p>
<h1>Memória, Território e Identidade:<br><span style="color:#8c3b1d">Salinas da Margarida e o Recôncavo</span></h1>
<p style="font-size:1.15rem;font-style:italic;color:#594c3f;line-height:1.6">Um estudo investigativo sobre saberes tradicionais, história viva e patrimônio cultural.</p>
<hr>
<p>A história viva de uma comunidade não reside apenas nos compêndios impressos das bibliotecas; ela pulsa no cotidiano, nas narrativas orais transmitidas de geração em geração e na relação intrínseca do ser humano com a terra e com as águas que o acolhem. Em Salinas da Margarida, a beleza serena da Baía de Todos-os-Santos entrelaça-se com a memória de um povo que construiu sua identidade a partir da perseverança, do trabalho artesanal e da sensibilidade cultural.</p>
<h2>O Mar, o Manguezal e as Fontes Orais</h2>
<p>O mar e os manguezais guardam narrativas seculares que conectam as práticas tradicionais de pesca e mariscagem às origens históricas do Recôncavo Baiano. Para o jovem estudante, compreender essa teia significa reconhecer o valor imaterial de seus próprios antepassados.</p>
<table>
<thead>
<tr>
<th>Fonte Histórica</th>
<th>Objeto de Análise</th>
<th>Relevância Pedagógica</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Relatos Orais</strong></td>
<td>Entrevistas com marisqueiras e mestres de saveiro</td>
<td>Resgate da oralidade e valorização da experiência comunitária.</td>
</tr>
<tr>
<td><strong>Iconografia e Mapas</strong></td>
<td>Cartografia antiga da Baía de Todos-os-Santos</td>
<td>Compreensão das transformações geográficas e socioespaciais.</td>
</tr>
<tr>
<td><strong>Cultura Material</strong></td>
<td>Instrumentos de pesca, embarcações e cerâmicas</td>
<td>Percepção concreta dos meios de subsistência e tecnologia popular.</td>
</tr>
</tbody>
</table>
<h2>Fundamentos do Diálogo Pedagógico</h2>
<p>A prática educativa ganha relevância quando o educando se torna autor do seu próprio processo de pesquisa, desenvolvendo criticidade histórica, empatia social e apreço pelo patrimônio público coletivo.</p>
<blockquote>“Educar é impregnar de sentido tudo o que fazemos a cada instante. Não se ensina apenas com palavras, mas com a vivência partilhada da curiosidade e do respeito.”</blockquote>
<p style="font-size:11px;color:#706253;text-align:right">CADERNO PEDAGÓGICO DE HISTÓRIA &nbsp; / &nbsp; SALINAS DA MARGARIDA - BAHIA</p>`
                },
                {
                    id: uid(),
                    html: `<p style="font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:2px;color:#8c3b1d">PROPOSTA DE AÇÃO PEDAGÓGICA</p>
<h1>Da Investigação<br><span style="color:#8c3b1d">à Produção Escolar.</span></h1>
<p style="font-size:1.15rem;font-style:italic;color:#594c3f">Etapas metodológicas para o desenvolvimento dos projetos em sala de aula.</p>
<hr>
<h2>Objetivos da Aprendizagem</h2>
<ul>
<li><strong>Estimular o pensamento crítico</strong>: capacitar os alunos a analisarem criticamente fontes documentais primárias e secundárias.</li>
<li><strong>Fortalecer a autoestima e o pertencimento</strong>: conectar os conteúdos curriculares de História e Geografia com a realidade local de sua cidade e de sua escola.</li>
<li><strong>Produção autoral e colaborativa</strong>: elaborar textos dissertativos, diários de campo e apresentações orais com clareza conceitual e riqueza expressiva.</li>
</ul>
<h2>Cronograma dos Projetos Escolares</h2>
<table>
<thead>
<tr>
<th>Etapa</th>
<th>Atividade Pedagógica</th>
<th>Resultado Esperado</th>
</tr>
</thead>
<tbody>
<tr>
<td>1º Bimestre</td>
<td>Levantamento bibliográfico e oficinas de escrita</td>
<td>Estruturação dos temas e perguntas de pesquisa</td>
</tr>
<tr>
<td>2º Bimestre</td>
<td>Pesquisa de campo e registro de depoimentos</td>
<td>Diário de bordo e acervo fotográfico escolar</td>
</tr>
<tr>
<td>3º Bimestre</td>
<td>Tabulação dos dados e análise crítica</td>
<td>Redação dissertativa e construção das tabelas</td>
</tr>
<tr>
<td>4º Bimestre</td>
<td>Seminário Municipal e Mostra Cultural</td>
<td>Apresentação pública dos resultados para a comunidade</td>
</tr>
</tbody>
</table>
<h2>O Próximo Passo é a Criação.</h2>
<p>Utilize esta ferramenta para redigir seus estudos, calcular e acompanhar os dados da turma na planilha e criar apresentações visuais cativantes para os seus seminários escolares.</p>`
                }
            ]
        },
        workbook: {
            title: 'Diário de Classe · Notas e Indicadores',
            activeSheet: 'notas',
            sheets: [
                {
                    id: 'notas',
                    name: 'Diário de Notas',
                    rows: 10000,
                    cols: 64,
                    widths: { 0: 230, 1: 110, 2: 110, 3: 110, 4: 110, 5: 120, 6: 140 },
                    cells
                },
                {
                    id: 'censo',
                    name: 'Censo e Projetos',
                    rows: 10000,
                    cols: 64,
                    widths: { 0: 290, 1: 150 },
                    cells: censoCells
                }
            ]
        },
        deck: {
            title: 'Seminário de História e Patrimônio',
            activeSlide: 0,
            slides: [
                {
                    id: uid(),
                    background: '#f7f3eb',
                    notes: 'Abertura da aula/seminário. Cumprimentar a turma e apresentar a proposta investigativa sobre o patrimônio local.',
                    elements: [
                        rect(664, 0, 296, 540, '#8c3b1d'),
                        rect(704, 60, 180, 180, '#c48262', 90),
                        rect(756, 212, 150, 150, '#deb49a', 75),
                        rect(702, 340, 180, 140, '#b36142', 18),
                        text('ESCOLA MUNICIPAL', 66, 50, 500, 30, 16, '#8c3b1d', true),
                        text('Memória, Território\ne Cidadania.', 64, 150, 590, 190, 56, '#3b2818', true),
                        text('Patrimônio cultural e história viva em Salinas da Margarida.', 68, 360, 560, 60, 22, '#594c3f'),
                        text('SEMINÁRIO ESCOLAR  •  HISTÓRIA E CIÊNCIAS HUMANAS', 68, 476, 550, 30, 12, '#706253')
                    ]
                },
                {
                    id: uid(),
                    background: '#ffffff',
                    notes: 'Destacar os três eixos pedagógicos que guiam as pesquisas dos estudantes no ano letivo.',
                    elements: [
                        text('EIXOS PEDAGÓGICOS', 64, 42, 600, 30, 14, '#8c3b1d', true),
                        text('Três pilares para o\nconhecimento significativo.', 64, 90, 800, 120, 42, '#3b2818', true),
                        rect(64, 258, 258, 195, '#faf5ee', 14),
                        rect(351, 258, 258, 195, '#f4ece1', 14),
                        rect(638, 258, 258, 195, '#fdf7f0', 14),
                        text('01', 84, 280, 200, 40, 26, '#8c3b1d', true),
                        text('Investigação', 84, 325, 215, 38, 22, '#3b2818', true),
                        text('Buscar fontes orais, fotografias e saberes da comunidade.', 84, 370, 210, 65, 15, '#706253'),
                        text('02', 371, 280, 200, 40, 26, '#8c3b1d', true),
                        text('Reflexão Crítica', 371, 325, 215, 38, 22, '#3b2818', true),
                        text('Compreender o espaço geográfico e a justiça social.', 371, 370, 210, 65, 15, '#706253'),
                        text('03', 658, 280, 200, 40, 26, '#8c3b1d', true),
                        text('Autoria Coletiva', 658, 325, 215, 38, 22, '#3b2818', true),
                        text('Partilhar as descobertas com a escola e as famílias.', 658, 370, 210, 65, 15, '#706253')
                    ]
                },
                {
                    id: uid(),
                    background: '#2e241c',
                    notes: 'Apresentar os dados coletados pelos alunos durante o projeto pedagógico.',
                    elements: [
                        text('RESULTADOS DA PESQUISA DE CAMPO', 64, 46, 700, 30, 14, '#deb49a', true),
                        text('Engajamento e\nProdução Escolar.', 64, 105, 800, 140, 52, '#f7f3eb', true),
                        text('140+', 66, 310, 270, 100, 72, '#f0c29b', true),
                        text('estudantes participantes', 69, 420, 270, 38, 18, '#deb49a'),
                        text('92%', 396, 310, 270, 100, 72, '#f0c29b', true),
                        text('índice de aprovação final', 399, 420, 270, 38, 18, '#deb49a'),
                        rect(722, 320, 20, 150, '#592c19'),
                        rect(760, 280, 20, 190, '#8c3b1d'),
                        rect(798, 230, 20, 240, '#c48262'),
                        rect(836, 170, 20, 300, '#deb49a')
                    ]
                },
                {
                    id: uid(),
                    background: '#f7f3eb',
                    notes: 'Conclusão e abertura para perguntas e debates com os alunos.',
                    elements: [
                        text('CONCLUSÃO E PRÓXIMOS PASSOS', 64, 48, 650, 30, 14, '#8c3b1d', true),
                        text('Aprender é transformar\no mundo ao nosso redor.', 64, 150, 800, 200, 60, '#3b2818', true),
                        text('Parabéns aos professores e estudantes pelo empenho e dedicação.', 68, 410, 800, 50, 22, '#594c3f')
                    ]
                }
            ]
        },
        draw: globalThis.V ? globalThis.V.demoDocument() : null,
        forms: globalThis.FormsDoc ? globalThis.FormsDoc.demoForm() : null
    };
}

return {makeSample};
})();
const __meridian_7 = (() => {
const { uid, escapeHTML, sanitizeHTML, clamp } = __meridian_1;
const { icon } = __meridian_2;
class Writer {
    constructor(app) {
        this.app = app;
        this.zoom = 100;
        this.savedRange = null;
        this.lastSelectedRange = null;
        this.events = new AbortController();
    }

    get model() {
        return this.app.store.state.writer;
    }

    mount(root) {
        this.root = root;
        root.innerHTML = `
            <aside class="sidepanel">
                <div class="panel-heading">Estrutura do Texto ${icon('panel')}</div>
                <div class="panel-search">
                    ${icon('search')}
                    <input id="document-search" placeholder="Localizar no texto…" aria-label="Localizar no texto">
                </div>
                <div class="panel-tabs">
                    <button class="active" data-navigation="headings">Títulos</button>
                    <button data-navigation="pages">Páginas</button>
                </div>
                <div id="outline"></div>
                <div class="panel-bottom">
                    <div class="tip-card">
                        <div class="eyebrow">${icon('sparkle')} ESCOLA OFFICE</div>
                        <p>Redija artigos, redações, pesquisas e diários de campo com tipografia clássica e formatação editorial.</p>
                        <button class="ribbon-small" data-action="switch-grid" style="padding:8px 0 0;color:var(--brand);font-size:10px;font-weight:600">
                            Abrir planilha de notas ${icon('right')}
                        </button>
                    </div>
                </div>
            </aside>
            <section class="document-area">
                <div class="document-chrome">
                    ${icon('folder')} Caderno Pedagógico ${icon('right')} 
                    <span class="document-title-inline" title="Clique para renomear este documento" contenteditable="true" spellcheck="false" style="cursor:text;padding:1px 6px;border-radius:3px;outline:none">${escapeHTML(this.model.title)}</span>
                    <span class="end">${icon('lock')} &nbsp; Armazenamento Local Seguro</span>
                </div>
                <div class="document-pages">
                    <div class="ruler">${Array.from({ length: 15 }, (_, i) => `<span>${i}</span>`).join('')}</div>
                    ${this.model.pages.map((p, i) => this.pageHTML(p, i)).join('')}
                </div>
            </section>
            <aside class="review-panel" id="review-panel"></aside>`;

        this.area = root.querySelector('.document-area');
        root.querySelectorAll('.document-page').forEach(page => this.bindPage(page));
        
        const titleInline = root.querySelector('.document-title-inline');
        if (titleInline) {
            titleInline.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    titleInline.blur();
                }
            });
            titleInline.addEventListener('blur', e => {
                this.renameDocument(e.target.textContent);
            });
        }

        root.querySelector('#document-search').addEventListener('keydown', e => {
            if (e.key === 'Enter') this.find(e.target.value);
        }, { signal: this.events.signal });

        root.querySelectorAll('[data-navigation]').forEach(b => b.onclick = () => {
            root.querySelectorAll('[data-navigation]').forEach(x => x.classList.toggle('active', x === b));
            this.outline(b.dataset.navigation);
        });

        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection();
            if (sel?.rangeCount && this.root?.querySelector('.document-pages')?.contains(sel.anchorNode)) {
                const r = sel.getRangeAt(0).cloneRange();
                this.savedRange = r;
                this.app.selectionText = sel.toString();
                if (!r.collapsed && sel.toString().trim().length > 0) {
                    this.lastSelectedRange = r.cloneRange();
                }
            }
        }, { signal: this.events.signal });

        this.outline();
        this.review();
        this.status();
        this.applyLayoutSettings();
        this.bindDeleteButtons();
        this.app.setEngine('Garamond & Cinzel (DOM)');
    }

    headerHTML(index) {
        const h = this.model.header || { enabled: false, text: '', align: 'center', showLine: true, skipFirstPage: false };
        const pNum = this.model.pageNumbering || { enabled: false, format: 'page-of-total', position: 'bottom-right', showOnFirstPage: true };
        const isHeaderNum = pNum.enabled && (pNum.position === 'top-right' || pNum.position === 'top-center');

        const showHeader = h.enabled || isHeaderNum;
        if (!showHeader) return '';
        if (index === 0 && h.skipFirstPage && !isHeaderNum) return '';

        const text = h.enabled ? escapeHTML(h.text || '') : '';
        const numText = (isHeaderNum && (index > 0 || pNum.showOnFirstPage !== false)) ? this.pageNumberString(index) : '';
        if (!text && !numText) return '';

        const align = h.align || 'center';
        const lineStyle = (h.enabled && h.showLine) ? 'border-bottom: 1px solid #d8cfbe; padding-bottom: 4px;' : '';

        return `
            <div class="page-header header-align-${align}" style="${lineStyle}">
                <div style="display:inline-flex;align-items:center;gap:6px">
                    ${text ? `<span class="header-text" title="Cabeçalho da página">${text}</span>` : ''}
                    ${h.enabled ? `<button class="header-quick-remove" data-remove-header title="Remover cabeçalho" style="background:transparent;border:none;color:#a09280;cursor:pointer;font-size:13px;padding:0 4px;opacity:0.6;line-height:1">✕</button>` : ''}
                </div>
                ${numText ? `<span class="header-page-num">${numText}</span>` : ''}
            </div>`;
    }

    footerHTML(pageId, index) {
        const f = this.model.footer || { enabled: false, text: '', showTitle: false, align: 'left', showLine: true, skipFirstPage: false };
        const pNum = this.model.pageNumbering || { enabled: false, format: 'page-of-total', position: 'bottom-right', showOnFirstPage: true };
        const isFooterNum = pNum.enabled && (!pNum.position || pNum.position === 'bottom-right' || pNum.position === 'bottom-center');
        const showNum = isFooterNum && (index > 0 || pNum.showOnFirstPage !== false);
        const numText = showNum ? this.pageNumberString(index) : '';
        const totalPages = this.model.pages.length;
        const isCenter = pNum.position === 'bottom-center' || f.align === 'center';

        const showFooter = f.enabled || showNum || totalPages > 1;
        if (!showFooter) return '';
        if (index === 0 && f.skipFirstPage && !showNum && totalPages <= 1) return '';

        let footerText = '';
        if (f.enabled) {
            if (f.text) {
                footerText = escapeHTML(f.text);
            } else if (f.showTitle) {
                footerText = escapeHTML((this.model.title || 'Caderno de Estudos').toUpperCase());
            }
        }

        // Se não tem texto de rodapé nem número e só tem 1 página, folha fica 100% limpa (sem rodapé)
        if (!footerText && !numText && totalPages <= 1) return '';

        const lineStyle = (f.enabled && f.showLine) ? 'border-top: 1px solid #d8cfbe; padding-top: 4px;' : '';

        return `
            <div class="page-footer ${isCenter ? 'footer-centered' : ''}" style="${lineStyle}">
                <div style="display:inline-flex;align-items:center;gap:6px">
                    ${footerText ? `<span class="footer-title" title="Rodapé da página">${footerText}</span>` : ''}
                    ${f.enabled ? `<button class="footer-quick-remove" data-remove-footer title="Remover rodapé" style="background:transparent;border:none;color:#a09280;cursor:pointer;font-size:13px;padding:0 4px;opacity:0.6;line-height:1">✕</button>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:12px">
                    ${numText ? `<span class="page-num-badge" title="Numeração de página">${numText} <button class="num-quick-remove" data-remove-pagenum title="Remover numeração" style="background:transparent;border:none;color:#a09280;cursor:pointer;font-size:11px;padding:0 2px;opacity:0.6;line-height:1">✕</button></span>` : ''}
                    ${totalPages > 1 ? `<button class="page-delete-btn" data-delete-page="${escapeHTML(pageId)}" title="Excluir esta página" style="background:transparent;border:1px solid #d8cfbe;border-radius:4px;color:#8c3b1d;padding:2px 8px;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:4px">${icon('trash')} Excluir página</button>` : ''}
                </div>
            </div>`;
    }

    pageNumberString(index) {
        const pNum = this.model.pageNumbering || {};
        const format = pNum.format || 'page-of-total';
        const cur = index + 1;
        const total = this.model.pages.length;

        switch (format) {
            case 'page-of-total':
                return `PÁGINA ${String(cur).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
            case 'page-simple':
                return `PÁGINA ${String(cur).padStart(2, '0')}`;
            case 'number-total':
                return `${cur} / ${total}`;
            case 'number-only':
                return `${cur}`;
            case 'roman': {
                const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
                let r = '', num = cur;
                for (let k in lookup) {
                    while (num >= lookup[k]) { r += k; num -= lookup[k]; }
                }
                return r || 'I';
            }
            default:
                return `PÁGINA ${String(cur).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
        }
    }

    pageHTML(page, index) {
        return `
            <div class="page-wrap" data-page-wrap="${escapeHTML(page.id)}">
                ${this.headerHTML(index)}
                <article class="document-page" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Página do documento ${index + 1}" data-page="${escapeHTML(page.id)}">
                    ${page.html}
                </article>
                ${this.footerHTML(page.id, index)}
            </div>`;
    }

    bindPage(page) {
        page.addEventListener('input', () => this.sync('Editar texto', 'writer-typing'), { signal: this.events.signal });
        page.addEventListener('beforeinput', e => {
            if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
                e.preventDefault();
                e.inputType === 'historyUndo' ? this.app.store.undo() : this.app.store.redo();
            }
        }, { signal: this.events.signal });
        page.addEventListener('paste', e => {
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            this.restore();
            this.insertHTML(html ? sanitizeHTML(html) : escapeHTML(text).replace(/\r?\n/g, '<br>'));
            this.sync('Colar texto');
        }, { signal: this.events.signal });
        page.addEventListener('drop', e => {
            e.preventDefault();
            this.app.notify('Utilize o menu Inserir → Imagem para adicionar figuras ao documento.');
        }, { signal: this.events.signal });
    }

    sync(label, mergeKey = '') {
        const pages = [...this.root.querySelectorAll('.document-page')].map(p => ({ id: p.dataset.page, html: p.innerHTML }));
        this.app.store.transact(label, s => s.writer.pages = pages, mergeKey);
        this.outline();
        this.status();
    }

    restore() {
        if (!this.savedRange?.startContainer?.isConnected) {
            const page = this.root.querySelector('.document-page');
            if (page) {
                page.focus();
                const range = document.createRange();
                range.selectNodeContents(page);
                range.collapse(false);
                this.savedRange = range;
            }
        }
        if (this.savedRange?.startContainer?.isConnected) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.savedRange);
            return sel.getRangeAt(0);
        }
        return document.createRange();
    }

    saveRange() {
        const sel = window.getSelection();
        if (sel?.rangeCount) {
            const r = sel.getRangeAt(0).cloneRange();
            this.savedRange = r;
            if (!r.collapsed && sel.toString().trim().length > 0) {
                this.lastSelectedRange = r.cloneRange();
            }
        }
    }

    bookmark() {
        const r = this.restore();
        const page = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('.document-page');
        if (!page) return null;
        const before = r.cloneRange();
        before.selectNodeContents(page);
        before.setEnd(r.startContainer, r.startOffset);
        return { page, start: before.toString().length, length: r.toString().length };
    }

    restoreBookmark(mark) {
        if (!mark?.page.isConnected) return;
        const walker = document.createTreeWalker(mark.page, NodeFilter.SHOW_TEXT);
        let node, pos = 0, start = null, end = null;
        while ((node = walker.nextNode())) {
            const n = node.textContent.length;
            if (!start && pos + n >= mark.start) start = [node, Math.max(0, mark.start - pos)];
            if (pos + n >= mark.start + mark.length) {
                end = [node, Math.max(0, mark.start + mark.length - pos)];
                break;
            }
            pos += n;
        }
        if (start && end) {
            const r = document.createRange();
            r.setStart(...start);
            r.setEnd(...end);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
            this.savedRange = r.cloneRange();
        }
    }

    inline(property, value) {
        let range = this.restore();
        // Se a seleção colapsou após foco no botão/picker, restaura a última seleção de texto ativa
        if (range.collapsed && this.lastSelectedRange?.startContainer?.isConnected && !this.lastSelectedRange.collapsed) {
            range = this.lastSelectedRange.cloneRange();
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            this.savedRange = range.cloneRange();
        }

        if (range.collapsed) {
            const span = document.createElement('span');
            span.style[property] = value;
            span.textContent = '\u200b';
            range.insertNode(span);
            range.setStart(span.firstChild, 1);
            range.collapse(true);
            this.savedRange = range.cloneRange();
            this.restore();
            this.sync('Formatar texto');
            return;
        }

        document.execCommand('styleWithCSS', false, true);
        if (property === 'fontWeight') document.execCommand('bold');
        else if (property === 'fontStyle') document.execCommand('italic');
        else if (property === 'textDecoration') document.execCommand(value.includes('underline') ? 'underline' : 'strikeThrough');
        else if (property === 'color') {
            let ok = false;
            try {
                ok = document.execCommand('foreColor', false, value);
            } catch { }
            const page = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest('.document-page');
            if (page) {
                page.querySelectorAll('font[color]').forEach(f => {
                    const span = document.createElement('span');
                    span.style.color = f.getAttribute('color');
                    span.innerHTML = f.innerHTML;
                    f.replaceWith(span);
                });
            }
            if (!ok && !range.collapsed) {
                const span = document.createElement('span');
                span.style.color = value;
                try {
                    span.append(range.extractContents());
                    range.insertNode(span);
                } catch { }
            }
        }
        else if (property === 'backgroundColor') {
            let ok = false;
            try {
                ok = document.execCommand('hiliteColor', false, value);
            } catch { }
            if (!ok) {
                try {
                    ok = document.execCommand('backColor', false, value);
                } catch { }
            }
            if (!ok && !range.collapsed) {
                const span = document.createElement('span');
                span.style.backgroundColor = value;
                try {
                    span.append(range.extractContents());
                    range.insertNode(span);
                } catch { }
            }
        }
        else if (property === 'fontSize') {
            const span = document.createElement('span');
            span.style.fontSize = `${value}px`;
            span.append(range.extractContents());
            range.insertNode(span);
        } else if (property === 'fontFamily') {
            const span = document.createElement('span');
            span.style.fontFamily = value;
            span.append(range.extractContents());
            range.insertNode(span);
        }
        this.saveRange();
        this.sync('Formatar texto');
    }

    selectedBlocks() {
        const range = this.restore();
        const page = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest('.document-page');
        if (!page) return [];
        return [...page.children].filter(el => {
            try {
                return range.intersectsNode(el);
            } catch {
                return false;
            }
        });
    }

    blockStyle(property, value) {
        this.selectedBlocks().forEach(b => b.style[property] = value);
        this.sync('Estilo de bloco');
    }

    heading(tag) {
        const range = this.restore();
        const blocks = this.selectedBlocks();
        if (!blocks.length) {
            document.execCommand('formatBlock', false, `<${tag}>`);
            this.sync('Aplicar título');
            return;
        }
        blocks.forEach(b => {
            if (['TABLE', 'UL', 'OL'].includes(b.tagName)) return;
            const replacement = document.createElement(tag);
            replacement.innerHTML = b.innerHTML;
            b.replaceWith(replacement);
        });
        this.sync('Alterar estilo');
    }

    list(ordered = false) {
        document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
        this.sync('Lista');
    }

    insertHTML(html) {
        const range = this.restore();
        range.deleteContents();
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        const frag = tpl.content;
        const last = frag.lastChild;
        range.insertNode(frag);
        if (last) {
            range.setStartAfter(last);
            range.collapse(true);
            this.savedRange = range;
        }
    }

    command(name, value) {
        switch (name) {
            case 'bold':
                this.inline('fontWeight', '700');
                break;
            case 'italic':
                this.inline('fontStyle', 'italic');
                break;
            case 'underline':
                this.inline('textDecoration', 'underline');
                break;
            case 'strike':
                this.inline('textDecoration', 'line-through');
                break;
            case 'color':
                this.inline('color', value);
                break;
            case 'fill':
                this.inline('backgroundColor', value);
                break;
            case 'font':
                this.inline('fontFamily', value);
                break;
            case 'size':
                this.inline('fontSize', value);
                break;
            case 'alignLeft':
                this.blockStyle('textAlign', 'left');
                break;
            case 'alignCenter':
                this.blockStyle('textAlign', 'center');
                break;
            case 'alignRight':
                this.blockStyle('textAlign', 'right');
                break;
            case 'justify':
                this.blockStyle('textAlign', 'justify');
                break;
            case 'lineHeight':
                this.blockStyle('lineHeight', value || '1.85');
                break;
            case 'indent':
                this.selectedBlocks().forEach(b => b.style.marginLeft = `${(parseInt(b.style.marginLeft) || 0) + 24}px`);
                this.sync('Aumentar recuo');
                break;
            case 'heading':
                this.heading(value);
                break;
            case 'bullets':
                this.list(false);
                break;
            case 'numbered':
                this.list(true);
                break;
            case 'table':
                this.insertTable();
                break;
            case 'image':
                this.app.chooseImage(src => {
                    this.insertHTML(`<p><img src="${src}" alt="Imagem inserida"></p>`);
                    this.sync('Inserir imagem');
                });
                break;
            case 'link':
                this.insertLink();
                break;
            case 'pageBreak':
                this.addPage();
                break;
            case 'comment':
                this.addComment();
                break;
            case 'find':
                this.findDialog();
                break;
            case 'replace':
                this.findDialog(true);
                break;
            case 'clear': {
                const mark = this.bookmark(), r = this.restore(), text = r.toString();
                if (text) {
                    r.deleteContents();
                    const n = document.createTextNode(text);
                    r.insertNode(n);
                    this.restoreBookmark(mark);
                    this.sync('Limpar formatação');
                }
                break;
            }
            case 'copy':
                this.copy();
                break;
            case 'cut':
                this.copy(true);
                break;
            case 'margins':
                this.setMargins(value);
                break;
            case 'pageWidth':
                this.setPageWidth(value);
                break;
            case 'columns':
                this.setColumns(value);
                break;
            case 'paperSaver':
                this.togglePaperSaver();
                break;
            case 'paste':
                this.paste();
                break;
            case 'selectAll':
                this.selectAll();
                break;
            case 'deletePage':
                this.deletePage();
                break;
            case 'clearAll':
            case 'clearAllWriter':
                this.clearAll();
                break;
            case 'insertHeader':
                this.insertHeaderDialog();
                break;
            case 'insertFooter':
                this.insertFooterDialog();
                break;
            case 'insertPageNumber':
                this.insertPageNumberDialog();
                break;
            case 'orientation':
                this.setOrientation(value);
                break;
        }
    }

    applyLayoutSettings() {
        const pagesContainer = this.root?.querySelector('.document-pages');
        if (!pagesContainer) return;

        pagesContainer.classList.remove('margin-narrow', 'margin-moderate', 'margin-normal', 'margin-wide');
        pagesContainer.classList.remove('width-compact', 'width-normal', 'width-wide', 'width-full');
        pagesContainer.classList.remove('columns-1', 'columns-2');
        pagesContainer.classList.remove('orientation-portrait', 'orientation-landscape');

        const margin = this.model.margins || 'normal';
        const width = this.model.pageWidth || 'normal';
        const columns = this.model.columns || 1;
        const orientation = this.model.orientation || 'portrait';

        pagesContainer.classList.add(`margin-${margin}`);
        pagesContainer.classList.add(`width-${width}`);
        pagesContainer.classList.add(`columns-${columns}`);
        pagesContainer.classList.add(`orientation-${orientation}`);

        const ruler = this.root.querySelector('.ruler');
        if (ruler) {
            if (orientation === 'landscape') {
                if (width === 'wide') ruler.style.width = '1160px';
                else if (width === 'compact') ruler.style.width = '920px';
                else if (width === 'full') {
                    ruler.style.width = '96%';
                    ruler.style.maxWidth = '1280px';
                } else ruler.style.width = '1040px';
            } else {
                if (width === 'wide') ruler.style.width = '840px';
                else if (width === 'compact') ruler.style.width = '660px';
                else if (width === 'full') {
                    ruler.style.width = '95%';
                    ruler.style.maxWidth = '1040px';
                } else ruler.style.width = '744px';
            }
        }
    }

    setOrientation(orientation) {
        const val = orientation === 'landscape' ? 'landscape' : 'portrait';
        this.app.store.transact('Alterar orientação da página', s => {
            s.writer.orientation = val;
        });
        this.applyLayoutSettings();
        this.app.notify(val === 'landscape' ? 'Orientação alterada para Paisagem (A4 Horizontal).' : 'Orientação alterada para Retrato (A4 Vertical).');
    }

    setMargins(margin) {
        this.app.store.transact('Alterar margens', s => {
            s.writer.margins = margin;
        });
        this.applyLayoutSettings();
        const labels = { narrow: 'Estreitas (10mm - Econômica)', moderate: 'Moderadas (15mm)', normal: 'Normais (20mm)', wide: 'Largas (25mm)' };
        this.app.notify(`Margens ajustadas para: ${labels[margin] || margin}.`);
    }

    setPageWidth(width) {
        this.app.store.transact('Alterar largura da página', s => {
            s.writer.pageWidth = width;
        });
        this.applyLayoutSettings();
        const labels = { compact: 'Compacta (660px)', normal: 'A4 Padrão (744px)', wide: 'Ampla / Econômica (840px)', full: 'Livre / Tela Toda' };
        this.app.notify(`Largura da folha ajustada para: ${labels[width] || width}.`);
    }

    setColumns(cols) {
        const count = Number(cols) || 1;
        this.app.store.transact('Alterar colunas', s => {
            s.writer.columns = count;
        });
        this.applyLayoutSettings();
        this.app.notify(count === 2 ? 'Layout em 2 colunas ativado (estilo prova de vestibular e economia de folhas).' : 'Layout em 1 coluna restaurado.');
    }

    togglePaperSaver() {
        const isSaving = this.model.margins === 'narrow' && this.model.pageWidth === 'wide';
        if (isSaving) {
            this.app.store.transact('Layout padrão', s => {
                s.writer.margins = 'normal';
                s.writer.pageWidth = 'normal';
                s.writer.columns = 1;
            });
            this.applyLayoutSettings();
            this.app.renderRibbon();
            this.app.notify('Layout padrão editorial restaurado.');
        } else {
            this.app.store.transact('Economia de papel', s => {
                s.writer.margins = 'narrow';
                s.writer.pageWidth = 'wide';
            });
            this.applyLayoutSettings();
            this.app.renderRibbon();
            this.app.notify('🌱 Modo Economia de Papel ativado! Margens estreitas e largura máxima aplicadas para reduzir impressões.');
        }
    }

    async copy(cut = false) {
        try {
            const range = this.restore(), text = range.toString();
            await navigator.clipboard.writeText(text);
            if (cut) {
                range.deleteContents();
                this.sync('Recortar');
            }
            this.app.notify(cut ? 'Texto recortado.' : 'Texto copiado para a área de transferência.');
        } catch {
            this.app.notify('Utilize o atalho Ctrl+C no teclado para copiar.');
        }
    }

    async paste() {
        try {
            const text = await navigator.clipboard.readText();
            this.insertHTML(escapeHTML(text).replace(/\n/g, '<br>'));
            this.sync('Colar');
        } catch {
            this.app.notify('Pressione Ctrl+V dentro do texto para colar.');
        }
    }

    selectAll() {
        const pages = [...this.root.querySelectorAll('.document-page')];
        if (!pages.length) return;
        let activePage = (this.savedRange?.startContainer?.nodeType === 1 
            ? this.savedRange.startContainer 
            : this.savedRange?.startContainer?.parentElement)?.closest('.document-page') || pages[0];
        activePage.focus();
        const range = document.createRange();
        range.selectNodeContents(activePage);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        this.savedRange = range.cloneRange();
        this.app.selectionText = sel.toString();
        this.app.notify('Todo o conteúdo da página selecionado.');
    }

    insertTable() {
        let currentRows = 3;
        let currentCols = 4;
        let currentPreset = 'classic';

        this.app.modal('Criador Interativo de Tabelas', `
            <div class="table-picker-container">
                <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">
                    <div class="table-matrix-wrapper">
                        <div class="table-matrix-label" id="matrix-size-label">4 Colunas × 3 Linhas</div>
                        <div class="table-matrix-grid" id="matrix-grid">
                            ${Array.from({ length: 64 }, (_, i) => {
                                const r = Math.floor(i / 8) + 1;
                                const c = (i % 8) + 1;
                                return `<div class="table-matrix-cell" data-r="${r}" data-c="${c}"></div>`;
                            }).join('')}
                        </div>
                        <small style="color:var(--muted);font-size:11px">Passe o mouse ou clique para definir</small>
                    </div>

                    <div style="flex:1;min-width:230px;display:flex;flex-direction:column;gap:10px">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                            <label style="font-size:11px;font-weight:600;color:var(--ink)">Linhas:
                                <input id="table-rows" type="number" min="1" max="50" value="3" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:var(--panel);color:var(--ink)">
                            </label>
                            <label style="font-size:11px;font-weight:600;color:var(--ink)">Colunas:
                                <input id="table-cols" type="number" min="1" max="15" value="4" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:var(--panel);color:var(--ink)">
                            </label>
                        </div>

                        <div style="font-size:11px;font-weight:700;color:var(--brand);margin-top:2px">Modelos Pedagógicos:</div>
                        <div class="table-preset-grid">
                            <div class="table-preset-option active" data-preset="classic">
                                <strong style="font-size:11px;display:block">Clássica Editorial</strong>
                                <span style="font-size:10px;color:var(--muted)">Cabeçalho terracota e bordas finas</span>
                            </div>
                            <div class="table-preset-option" data-preset="grades">
                                <strong style="font-size:11px;display:block">Grade de Notas / Chamada</strong>
                                <span style="font-size:10px;color:var(--muted)">Nomes amplos e notas compactas</span>
                            </div>
                            <div class="table-preset-option" data-preset="compare">
                                <strong style="font-size:11px;display:block">Quadro Comparativo</strong>
                                <span style="font-size:10px;color:var(--muted)">Colunas iguais de análise</span>
                            </div>
                            <div class="table-preset-option" data-preset="clean">
                                <strong style="font-size:11px;display:block">Simples / Limpa</strong>
                                <span style="font-size:10px;color:var(--muted)">Alinhamento discreto</span>
                            </div>
                        </div>

                        <div style="display:flex;flex-direction:column;gap:6px;margin-top:2px">
                            <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                                <input type="checkbox" id="table-header-row" checked> Linha de Cabeçalho Destacada
                            </label>
                            <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                                <input type="checkbox" id="table-zebra" checked> Linhas Zebradas (Leitura fácil)
                            </label>
                        </div>
                    </div>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">
                    <button class="btn outlined" data-close>Cancelar</button>
                    <button class="btn primary" id="insert-table">${icon('table')} Inserir Tabela na Folha</button>
                </div>
            </div>
        `, modal => {
            const cells = modal.querySelectorAll('.table-matrix-cell');
            const label = modal.querySelector('#matrix-size-label');
            const inputR = modal.querySelector('#table-rows');
            const inputC = modal.querySelector('#table-cols');

            const highlight = (r, c) => {
                cells.forEach(cell => {
                    const cr = Number(cell.dataset.r);
                    const cc = Number(cell.dataset.c);
                    cell.classList.toggle('highlight', cr <= r && cc <= c);
                });
                label.textContent = `${c} Coluna${c > 1 ? 's' : ''} × ${r} Linha${r > 1 ? 's' : ''}`;
            };

            highlight(currentRows, currentCols);

            cells.forEach(cell => {
                cell.onmouseenter = () => {
                    const r = Number(cell.dataset.r);
                    const c = Number(cell.dataset.c);
                    highlight(r, c);
                };
                cell.onclick = () => {
                    currentRows = Number(cell.dataset.r);
                    currentCols = Number(cell.dataset.c);
                    inputR.value = currentRows;
                    inputC.value = currentCols;
                    highlight(currentRows, currentCols);
                };
            });

            modal.querySelector('#matrix-grid').onmouseleave = () => {
                highlight(currentRows, currentCols);
            };

            inputR.oninput = () => {
                currentRows = clamp(Number(inputR.value) || 1, 1, 50);
                highlight(Math.min(currentRows, 8), Math.min(currentCols, 8));
            };
            inputC.oninput = () => {
                currentCols = clamp(Number(inputC.value) || 1, 1, 15);
                highlight(Math.min(currentRows, 8), Math.min(currentCols, 8));
            };

            modal.querySelectorAll('.table-preset-option').forEach(opt => {
                opt.onclick = () => {
                    modal.querySelectorAll('.table-preset-option').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    currentPreset = opt.dataset.preset;
                };
            });

            const insertBtn = modal.querySelector('#insert-table') || modal.querySelector('#btn-do-insert-table');
            if (insertBtn) insertBtn.onclick = () => {
                const rows = clamp(Number(inputR.value) || 3, 1, 50);
                const cols = clamp(Number(inputC.value) || 4, 1, 15);
                const hasHeader = modal.querySelector('#table-header-row').checked;
                const isZebra = modal.querySelector('#table-zebra').checked;
                this.app.closeModal();

                let tableClass = isZebra ? 'table-zebra' : '';
                if (currentPreset === 'grades') tableClass += ' table-compact';

                let headerHTML = '';
                if (hasHeader) {
                    let colNames = [];
                    if (currentPreset === 'grades') {
                        colNames = ['Estudante / Turma', 'Ativ. 1', 'Ativ. 2', 'Avaliação', 'Média Final'];
                    } else if (currentPreset === 'compare') {
                        colNames = ['Aspecto / Conceito', 'Fonte ou Período A', 'Fonte ou Período B', 'Síntese Histórica'];
                    } else {
                        colNames = Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`);
                    }
                    headerHTML = `<thead><tr>${Array.from({ length: cols }, (_, c) => `<th>${escapeHTML(colNames[c] || `Coluna ${c + 1}`)}</th>`).join('')}</tr></thead>`;
                }

                const bodyRows = hasHeader ? rows - 1 : rows;
                const bodyHTML = `<tbody>${Array.from({ length: Math.max(1, bodyRows) }, () => `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('')}</tbody>`;

                this.insertHTML(`
                    <table class="${tableClass.trim()}">
                        ${headerHTML}
                        ${bodyHTML}
                    </table>
                    <p><br></p>`);
                this.sync('Inserir tabela');
                this.app.notify(`Tabela de ${cols} colunas × ${rows} linhas inserida.`);
            };
        });
    }

    insertLink() {
        this.app.modal('Inserir Hiperlink', `
            <label class="field">Texto visível do link
                <input id="link-text" value="${escapeHTML(this.app.selectionText || 'Saiba mais')}">
            </label>
            <label class="field">Endereço de Destino (URL)
                <input id="link-url" type="url" placeholder="https://exemplo.com.br">
            </label>
            <div class="modal-footer">
                <button class="btn" data-close>Cancelar</button>
                <button class="btn primary" id="insert-link">Inserir Link</button>
            </div>
        `, modal => modal.querySelector('#insert-link').onclick = () => {
            const url = modal.querySelector('#link-url').value.trim();
            const text = modal.querySelector('#link-text').value;
            if (!/^(https?:|mailto:)/i.test(url)) {
                this.app.notify('Insira um endereço válido iniciando com https://, http:// ou mailto:', true);
                return;
            }
            this.app.closeModal();
            this.insertHTML(`<a href="${escapeHTML(url)}" rel="noopener noreferrer">${escapeHTML(text)}</a>`);
            this.sync('Inserir link');
        });
    }

    addPage() {
        const page = { id: uid(), html: '<h2>Novo Capítulo ou Tópico</h2><p>Inicie a redação do seu texto aqui.</p>' };
        this.app.store.transact('Adicionar página', s => s.writer.pages.push(page));
        this.root.querySelector('.document-pages').insertAdjacentHTML('beforeend', this.pageHTML(page, this.model.pages.length - 1));
        const el = this.root.querySelector(`[data-page="${page.id}"]`);
        this.bindPage(el);
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.focus();
        this.savedRange = null;
        this.refreshPageFooters();
        this.outline();
        this.status();
    }

    deletePage(pageId) {
        if (this.model.pages.length <= 1) {
            this.app.notify('O documento de texto precisa ter ao menos uma página. Para esvaziar, clique em "Limpar Tudo".', true);
            return;
        }

        let targetId = pageId;
        if (!targetId) {
            const activePage = (this.savedRange?.startContainer?.nodeType === 1 
                ? this.savedRange.startContainer 
                : this.savedRange?.startContainer?.parentElement)?.closest('.document-page');
            targetId = activePage?.dataset?.page || this.model.pages[this.model.pages.length - 1].id;
        }

        const pageIndex = this.model.pages.findIndex(p => p.id === targetId);
        if (pageIndex === -1) return;

        this.app.modal('Excluir Página', `
            <p>Deseja realmente excluir a <strong>Página ${pageIndex + 1}</strong> deste documento?</p>
            <p style="color:var(--muted);font-size:12px">O conteúdo desta página será removido. Você poderá recuperar usando <strong>Desfazer (Ctrl+Z)</strong>.</p>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
                <button class="btn outlined" data-close>Cancelar</button>
                <button class="btn" id="btn-confirm-delete-page" style="background:var(--danger,#c92a2a);color:#fff">${icon('trash')} Excluir Página</button>
            </div>
        `, modal => {
            modal.querySelector('#btn-confirm-delete-page').onclick = () => {
                this.app.closeModal();
                this.app.store.transact('Excluir página', s => {
                    s.writer.pages = s.writer.pages.filter(p => p.id !== targetId);
                });
                const wrap = this.root.querySelector(`[data-page-wrap="${targetId}"]`);
                wrap?.remove();
                this.refreshPageFooters();
                this.outline();
                this.status();
                this.app.notify(`Página ${pageIndex + 1} excluída com sucesso.`);
            };
        });
    }

    renameDocument(newTitle) {
        const title = (newTitle || '').trim().slice(0, 200) || 'Caderno de Estudos';
        this.app.store.transact('Renomear documento', s => {
            s.title = title;
            s.writer.title = title;
        });
        const projTitle = document.querySelector('.project-title');
        if (projTitle) projTitle.textContent = title;
        const chromeTitle = this.root?.querySelector('.document-title-inline');
        if (chromeTitle && chromeTitle !== document.activeElement) chromeTitle.textContent = title;
        this.refreshPageFooters();
    }

    refreshPageHeadersAndFooters() {
        const wraps = [...this.root.querySelectorAll('.page-wrap')];
        wraps.forEach((wrap, i) => {
            const pageId = wrap.dataset.pageWrap;
            let header = wrap.querySelector('.page-header');
            const newHeaderHTML = this.headerHTML(i);
            if (newHeaderHTML) {
                if (header) {
                    const temp = document.createElement('div');
                    temp.innerHTML = newHeaderHTML;
                    header.replaceWith(temp.firstElementChild);
                } else {
                    wrap.insertAdjacentHTML('afterbegin', newHeaderHTML);
                }
            } else if (header) {
                header.remove();
            }

            let footer = wrap.querySelector('.page-footer');
            const newFooterHTML = this.footerHTML(pageId, i);
            if (newFooterHTML) {
                if (footer) {
                    const temp = document.createElement('div');
                    temp.innerHTML = newFooterHTML;
                    footer.replaceWith(temp.firstElementChild);
                } else {
                    wrap.insertAdjacentHTML('beforeend', newFooterHTML);
                }
            } else if (footer) {
                footer.remove();
            }
        });
        this.bindDeleteButtons();
    }

    refreshPageFooters() {
        this.refreshPageHeadersAndFooters();
    }

    bindDeleteButtons() {
        this.root?.querySelectorAll('[data-delete-page]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.deletePage(btn.dataset.deletePage);
            };
        });
        this.root?.querySelectorAll('[data-remove-header]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.removeHeader();
            };
        });
        this.root?.querySelectorAll('[data-remove-footer]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.removeFooter();
            };
        });
        this.root?.querySelectorAll('[data-remove-pagenum]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.removePageNumbering();
            };
        });
    }

    removeHeader() {
        this.app.store.transact('Remover cabeçalho', s => {
            s.writer.header = { enabled: false, text: '', align: 'center', showLine: false, skipFirstPage: false };
        });
        this.refreshPageHeadersAndFooters();
        this.app.notify('Cabeçalho removido da folha.');
    }

    removeFooter() {
        this.app.store.transact('Remover rodapé', s => {
            s.writer.footer = { enabled: false, text: '', showTitle: false, align: 'left', showLine: false, skipFirstPage: false };
        });
        this.refreshPageHeadersAndFooters();
        this.app.notify('Rodapé removido da folha.');
    }

    removePageNumbering() {
        this.app.store.transact('Remover numeração de páginas', s => {
            s.writer.pageNumbering = { enabled: false, format: 'none', position: 'bottom-right', showOnFirstPage: false };
        });
        this.refreshPageHeadersAndFooters();
        this.app.notify('Numeração de páginas desativada.');
    }

    insertHeaderDialog() {
        const h = this.model.header || {
            enabled: false,
            text: '',
            align: 'center',
            showLine: true,
            skipFirstPage: false
        };

        this.app.modal('Cabeçalho da Página e Escolar', `
            <div style="display:flex;flex-direction:column;gap:16px">
                <div style="background:var(--soft);padding:14px;border-radius:6px;border:1px solid var(--line)">
                    <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:var(--brand);display:flex;align-items:center;gap:6px">
                        ${icon('header')} Cabeçalho Superior da Página (Margem)
                    </div>
                    <p style="font-size:11px;color:var(--muted);margin:0 0 12px">Aparece na margem superior de cada folha do documento.</p>
                    
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;margin-bottom:12px;cursor:pointer">
                        <input type="checkbox" id="header-enabled" ${h.enabled ? 'checked' : ''}>
                        Ativar cabeçalho superior na folha
                    </label>

                    <div id="header-fields" style="display:${h.enabled ? 'flex' : 'none'};flex-direction:column;gap:10px">
                        <div>
                            <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:var(--ink)">Texto do cabeçalho:</label>
                            <input id="header-text" value="${escapeHTML(h.text || this.model.title || '')}" placeholder="Ex: ESCOLA MUNICIPAL • SALINAS DA MARGARIDA - BA" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;font-size:12px;box-sizing:border-box;background:var(--panel);color:var(--ink)">
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center">
                            <div>
                                <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:var(--ink)">Alinhamento:</label>
                                <select id="header-align" style="width:100%;padding:7px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:var(--panel);color:var(--ink)">
                                    <option value="center" ${h.align === 'center' ? 'selected' : ''}>Centralizado</option>
                                    <option value="left" ${h.align === 'left' ? 'selected' : ''}>À Esquerda</option>
                                    <option value="right" ${h.align === 'right' ? 'selected' : ''}>À Direita</option>
                                </select>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:6px">
                                <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                                    <input type="checkbox" id="header-line" ${h.showLine !== false ? 'checked' : ''}> Linha divisória suave
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                                    <input type="checkbox" id="header-skip-first" ${h.skipFirstPage ? 'checked' : ''}> Ocultar na 1ª página (Capa)
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="background:var(--panel);padding:14px;border-radius:6px;border:1px solid var(--line)">
                    <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--brand);display:flex;align-items:center;gap:6px">
                        ${icon('file')} Inserir Bloco de Cabeçalho Escolar de Prova/Atividade
                    </div>
                    <p style="font-size:11px;color:var(--muted);margin:0 0 10px">Insere uma caixa oficial padronizada no corpo do texto (Escola, Estudante, Professor, Turma, Data e Nota).</p>
                    <button type="button" class="btn secondary" id="btn-insert-school-header" style="font-size:12px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px">
                        ${icon('plus')} Inserir Bloco Escolar no Início do Documento
                    </button>
                </div>

                <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:6px">
                    <button type="button" class="btn outlined" id="btn-remove-header-modal" style="color:var(--danger,#c92a2a);border-color:var(--danger,#c92a2a)">
                        ${icon('clear')} Limpar / Remover Cabeçalho
                    </button>
                    <div style="display:flex;gap:10px">
                        <button class="btn outlined" data-close>Cancelar</button>
                        <button class="btn primary" id="btn-save-header">${icon('check')} Salvar Cabeçalho</button>
                    </div>
                </div>
            </div>
        `, modal => {
            const checkEnabled = modal.querySelector('#header-enabled');
            const headerFields = modal.querySelector('#header-fields');
            checkEnabled.onchange = () => {
                headerFields.style.display = checkEnabled.checked ? 'flex' : 'none';
            };

            modal.querySelector('#btn-remove-header-modal').onclick = () => {
                this.app.closeModal();
                this.removeHeader();
            };

            modal.querySelector('#btn-insert-school-header').onclick = () => {
                this.app.closeModal();
                this.insertSchoolHeaderBlock();
            };

            modal.querySelector('#btn-save-header').onclick = () => {
                const enabled = checkEnabled.checked;
                const text = modal.querySelector('#header-text').value.trim();
                const align = modal.querySelector('#header-align').value;
                const showLine = modal.querySelector('#header-line').checked;
                const skipFirstPage = modal.querySelector('#header-skip-first').checked;

                this.app.store.transact('Configurar cabeçalho', s => {
                    s.writer.header = { enabled, text, align, showLine, skipFirstPage };
                });
                this.refreshPageHeadersAndFooters();
                this.app.closeModal();
                this.app.notify(enabled ? 'Cabeçalho da página atualizado.' : 'Cabeçalho da página desativado.');
            };
        });
    }

    insertFooterDialog() {
        const f = this.model.footer || {
            enabled: false,
            text: '',
            showTitle: false,
            align: 'left',
            showLine: true,
            skipFirstPage: false
        };

        this.app.modal('Rodapé da Página', `
            <div style="display:flex;flex-direction:column;gap:16px">
                <div style="background:var(--soft);padding:14px;border-radius:6px;border:1px solid var(--line)">
                    <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:var(--brand);display:flex;align-items:center;gap:6px">
                        ${icon('footer')} Rodapé Inferior da Página (Margem)
                    </div>
                    <p style="font-size:11px;color:var(--muted);margin:0 0 12px">Aparece na margem inferior de cada folha do documento.</p>
                    
                    <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;margin-bottom:12px;cursor:pointer">
                        <input type="checkbox" id="footer-enabled" ${f.enabled ? 'checked' : ''}>
                        Ativar rodapé na folha
                    </label>

                    <div id="footer-fields" style="display:${f.enabled ? 'flex' : 'none'};flex-direction:column;gap:10px">
                        <div>
                            <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:var(--ink)">Texto do rodapé:</label>
                            <input id="footer-text" value="${escapeHTML(f.text || '')}" placeholder="Ex: Prof. Sérgio • História • 9º Ano" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:4px;font-size:12px;box-sizing:border-box;background:var(--panel);color:var(--ink)">
                        </div>
                        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                            <input type="checkbox" id="footer-show-title" ${f.showTitle ? 'checked' : ''}> Exibir nome do documento no rodapé (Ex: ${escapeHTML(this.model.title || 'Caderno de Estudos')})
                        </label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center">
                            <div>
                                <label style="display:block;font-size:11px;font-weight:600;margin-bottom:4px;color:var(--ink)">Alinhamento:</label>
                                <select id="footer-align" style="width:100%;padding:7px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:var(--panel);color:var(--ink)">
                                    <option value="left" ${f.align === 'left' ? 'selected' : ''}>À Esquerda</option>
                                    <option value="center" ${f.align === 'center' ? 'selected' : ''}>Centralizado</option>
                                    <option value="right" ${f.align === 'right' ? 'selected' : ''}>À Direita</option>
                                </select>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:6px">
                                <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                                    <input type="checkbox" id="footer-line" ${f.showLine !== false ? 'checked' : ''}> Linha divisória suave
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                                    <input type="checkbox" id="footer-skip-first" ${f.skipFirstPage ? 'checked' : ''}> Ocultar na 1ª página (Capa)
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:6px">
                    <button type="button" class="btn outlined" id="btn-remove-footer-modal" style="color:var(--danger,#c92a2a);border-color:var(--danger,#c92a2a)">
                        ${icon('clear')} Limpar / Remover Rodapé
                    </button>
                    <div style="display:flex;gap:10px">
                        <button class="btn outlined" data-close>Cancelar</button>
                        <button class="btn primary" id="btn-save-footer">${icon('check')} Salvar Rodapé</button>
                    </div>
                </div>
            </div>
        `, modal => {
            const checkEnabled = modal.querySelector('#footer-enabled');
            const footerFields = modal.querySelector('#footer-fields');
            checkEnabled.onchange = () => {
                footerFields.style.display = checkEnabled.checked ? 'flex' : 'none';
            };

            modal.querySelector('#btn-remove-footer-modal').onclick = () => {
                this.app.closeModal();
                this.removeFooter();
            };

            modal.querySelector('#btn-save-footer').onclick = () => {
                const enabled = checkEnabled.checked;
                const text = modal.querySelector('#footer-text').value.trim();
                const showTitle = modal.querySelector('#footer-show-title').checked;
                const align = modal.querySelector('#footer-align').value;
                const showLine = modal.querySelector('#footer-line').checked;
                const skipFirstPage = modal.querySelector('#footer-skip-first').checked;

                this.app.store.transact('Configurar rodapé', s => {
                    s.writer.footer = { enabled, text, showTitle, align, showLine, skipFirstPage };
                });
                this.refreshPageHeadersAndFooters();
                this.app.closeModal();
                this.app.notify(enabled ? 'Rodapé da página atualizado.' : 'Rodapé desativado.');
            };
        });
    }

    insertSchoolHeaderBlock() {
        const profile = this.app?.getProfile?.() || {
            name: 'Prof. Sérgio Araújo',
            school: 'Escola Municipal de Ensino Fundamental',
            subject: 'História',
            year: '2026',
            unit: 'I Unidade'
        };
        const bloco = `
<div class="cabecalho-escolar-box">
    <div class="escola-nome">${escapeHTML((profile.school || 'ESCOLA MUNICIPAL').toUpperCase())}</div>
    <div style="text-align:center;font-size:11px;color:#555;margin-bottom:8px">Salinas da Margarida — Bahia &nbsp;•&nbsp; Secretaria Municipal de Educação</div>
    <div class="grid-campos">
        <div class="campo-full"><strong>Estudante:</strong> ________________________________________________________________</div>
        <div><strong>Professor(a):</strong> ${escapeHTML(profile.name || 'Prof. Sérgio Araújo')}</div>
        <div><strong>Componente Curricular:</strong> ${escapeHTML(profile.subject || 'História')}</div>
        <div><strong>Ano / Turma:</strong> _________ &nbsp; <strong>Unidade:</strong> ${escapeHTML(profile.unit || 'I Unidade')}</div>
        <div><strong>Data:</strong> ____ / ____ / ${escapeHTML(profile.year || '2026')} &nbsp;&nbsp; <strong>Nota:</strong> ________</div>
    </div>
</div>
<p><br></p>`;
        const firstPage = this.root.querySelector('.document-page');
        if (firstPage) {
            firstPage.focus();
            firstPage.insertAdjacentHTML('afterbegin', bloco);
            this.sync('Inserir cabeçalho escolar');
            this.app.notify('Cabeçalho escolar inserido no início do documento.');
        }
    }

    insertPageNumberDialog() {
        const pNum = this.model.pageNumbering || {
            enabled: false,
            format: 'page-of-total',
            position: 'bottom-right',
            showOnFirstPage: true
        };

        this.app.modal('Numeração de Páginas', `
            <div style="display:flex;flex-direction:column;gap:14px">
                <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;cursor:pointer">
                    <input type="checkbox" id="pagenum-enabled" ${pNum.enabled !== false ? 'checked' : ''}>
                    Ativar numeração de páginas
                </label>

                <div id="pagenum-fields" style="display:${pNum.enabled !== false ? 'flex' : 'none'};flex-direction:column;gap:12px;background:var(--panel2);padding:14px;border-radius:6px;border:1px solid var(--line)">
                    <div>
                        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--ink)">Formato dos Números:</label>
                        <select id="pagenum-format" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:var(--panel);color:var(--ink)">
                            <option value="page-of-total" ${pNum.format === 'page-of-total' ? 'selected' : ''}>Página X de Y (Ex: PÁGINA 01 / 05) — Recomendado para Provas</option>
                            <option value="page-simple" ${pNum.format === 'page-simple' ? 'selected' : ''}>Página X (Ex: PÁGINA 01)</option>
                            <option value="number-total" ${pNum.format === 'number-total' ? 'selected' : ''}>Apenas números com total (Ex: 1 / 5)</option>
                            <option value="number-only" ${pNum.format === 'number-only' ? 'selected' : ''}>Número simples (Ex: 1, 2, 3...)</option>
                            <option value="roman" ${pNum.format === 'roman' ? 'selected' : ''}>Algarismos Romanos (Ex: I, II, III...)</option>
                        </select>
                    </div>

                    <div>
                        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--ink)">Posição da Numeração:</label>
                        <select id="pagenum-position" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:4px;font-size:12px;background:var(--panel);color:var(--ink)">
                            <option value="bottom-right" ${pNum.position === 'bottom-right' ? 'selected' : ''}>Rodapé — Canto Direito (Padrão)</option>
                            <option value="bottom-center" ${pNum.position === 'bottom-center' ? 'selected' : ''}>Rodapé — Centralizado</option>
                            <option value="top-right" ${pNum.position === 'top-right' ? 'selected' : ''}>Cabeçalho — Canto Direito</option>
                            <option value="top-center" ${pNum.position === 'top-center' ? 'selected' : ''}>Cabeçalho — Centralizado</option>
                        </select>
                    </div>

                    <div>
                        <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
                            <input type="checkbox" id="pagenum-first-page" ${pNum.showOnFirstPage !== false ? 'checked' : ''}>
                            Exibir número na primeira página (desmarque para trabalhos com Capa)
                        </label>
                    </div>
                </div>

                <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:8px">
                    <button type="button" class="btn outlined" id="btn-remove-pagenum-modal" style="color:var(--danger,#c92a2a);border-color:var(--danger,#c92a2a)">
                        ${icon('clear')} Remover Numeração
                    </button>
                    <div style="display:flex;gap:10px">
                        <button class="btn outlined" data-close>Cancelar</button>
                        <button class="btn primary" id="btn-save-pagenum">${icon('check')} Aplicar Numeração</button>
                    </div>
                </div>
            </div>
        `, modal => {
            const checkEnabled = modal.querySelector('#pagenum-enabled');
            const fields = modal.querySelector('#pagenum-fields');
            checkEnabled.onchange = () => {
                fields.style.display = checkEnabled.checked ? 'flex' : 'none';
            };

            modal.querySelector('#btn-remove-pagenum-modal').onclick = () => {
                this.app.closeModal();
                this.removePageNumbering();
            };

            modal.querySelector('#btn-save-pagenum').onclick = () => {
                const enabled = checkEnabled.checked;
                const format = modal.querySelector('#pagenum-format').value;
                const position = modal.querySelector('#pagenum-position').value;
                const showOnFirstPage = modal.querySelector('#pagenum-first-page').checked;

                this.app.store.transact('Configurar numeração de páginas', s => {
                    s.writer.pageNumbering = { enabled, format, position, showOnFirstPage };
                });
                this.refreshPageHeadersAndFooters();
                this.app.closeModal();
                this.app.notify(enabled ? 'Numeração de páginas atualizada.' : 'Numeração de páginas desativada.');
            };
        });
    }

    clearAll() {
        this.app.modal('Limpar Todo o Documento', `
            <p>Deseja realmente <strong>limpar todo o documento de texto</strong> e recomeçar com uma folha em branco?</p>
            <div style="margin:16px 0">
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;color:var(--ink)">Título do novo documento:</label>
                <input id="input-clear-writer-title" value="Caderno de Estudos" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:4px;font-family:var(--font);background:var(--panel);color:var(--ink);font-size:13px;box-sizing:border-box">
            </div>
            <div style="background:var(--soft);padding:12px;border-radius:6px;border:1px solid var(--line);margin-bottom:14px">
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;cursor:pointer;color:var(--ink)">
                    <input type="checkbox" id="check-clear-headers-footers" checked>
                    Limpar também cabeçalho e rodapé (folha 100% limpa)
                </label>
                <p style="margin:4px 0 0 24px;font-size:11px;color:var(--muted)">Remove qualquer cabeçalho, rodapé ou numeração ativa, deixando a folha totalmente pura em branco.</p>
            </div>
            <p style="color:var(--muted);font-size:12px">Você poderá usar <strong>Desfazer (Ctrl+Z)</strong> se necessário.</p>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
                <button class="btn outlined" data-close>Cancelar</button>
                <button class="btn" id="btn-confirm-clear-writer" style="background:var(--danger,#c92a2a);color:#fff">${icon('clear')} Limpar Tudo</button>
            </div>
        `, modal => {
            const inputTitle = modal.querySelector('#input-clear-writer-title');
            if (inputTitle) {
                inputTitle.focus();
                inputTitle.select();
                inputTitle.onkeydown = e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        modal.querySelector('#btn-confirm-clear-writer').click();
                    }
                };
            }
            modal.querySelector('#btn-confirm-clear-writer').onclick = () => {
                const newTitle = inputTitle?.value.trim().slice(0, 200) || 'Caderno de Estudos';
                const clearHeadFoot = modal.querySelector('#check-clear-headers-footers')?.checked !== false;
                this.app.closeModal();
                const newPage = { id: uid(), html: '<p><br></p>' };
                this.app.store.transact('Limpar todo o texto', s => {
                    s.title = newTitle;
                    s.writer.title = newTitle;
                    s.writer.pages = [newPage];
                    if (clearHeadFoot) {
                        s.writer.header = { enabled: false, text: '', align: 'center', showLine: false, skipFirstPage: false };
                        s.writer.footer = { enabled: false, text: '', showTitle: false, align: 'left', showLine: false, skipFirstPage: false };
                        s.writer.pageNumbering = { enabled: false, format: 'none', position: 'bottom-right', showOnFirstPage: false };
                    }
                    s.writer.comments = [];
                });
                const container = this.root.querySelector('.document-pages');
                if (container) {
                    container.innerHTML = this.pageHTML(newPage, 0);
                    const el = container.querySelector('.document-page');
                    this.bindPage(el);
                    el.focus();
                }
                const chromeTitle = this.root.querySelector('.document-title-inline');
                if (chromeTitle) chromeTitle.textContent = newTitle;
                const projectTitle = document.querySelector('.project-title');
                if (projectTitle) projectTitle.textContent = newTitle;
                this.applyLayoutSettings();
                this.refreshPageHeadersAndFooters();
                this.outline();
                this.status();
                this.app.notify(clearHeadFoot ? 'Folha, cabeçalho e rodapé limpos com sucesso.' : 'Texto limpo com sucesso.');
            };
        });
    }

    find(text) {
        if (!text) return false;
        const nodes = [];
        const walker = document.createTreeWalker(this.root.querySelector('.document-pages'), NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
            if (n.parentElement.closest('.document-page')) nodes.push(n);
        }
        const lower = text.toLowerCase();
        let match = null;
        for (const node of nodes) {
            const pos = node.textContent.toLowerCase().indexOf(lower);
            if (pos >= 0) {
                match = { node, pos };
                break;
            }
        }
        if (!match) {
            this.app.notify(`Nenhum resultado encontrado para "${text}".`);
            return false;
        }
        const r = document.createRange();
        r.setStart(match.node, match.pos);
        r.setEnd(match.node, match.pos + text.length);
        this.savedRange = r;
        this.restore();
        match.node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
    }

    findDialog(replace = false) {
        this.app.modal(replace ? 'Localizar e Substituir' : 'Localizar no Documento', `
            <label class="field">Texto a localizar
                <input id="find-text" value="${escapeHTML(this.app.selectionText || '')}">
            </label>
            ${replace ? `
            <label class="field">Substituir por
                <input id="replace-text">
            </label>` : ''}
            <div class="modal-footer">
                <button class="btn" data-close>Cancelar</button>
                <button class="btn primary" id="find-go">${replace ? 'Substituir Todos' : 'Localizar'}</button>
            </div>
        `, modal => {
            modal.querySelector('#find-text').focus();
            modal.querySelector('#find-go').onclick = () => {
                const text = modal.querySelector('#find-text').value;
                if (!text) return;
                const replacement = modal.querySelector('#replace-text')?.value;
                this.app.closeModal();
                if (!replace) {
                    this.find(text);
                    return;
                }
                let count = 0;
                const walker = document.createTreeWalker(this.root.querySelector('.document-pages'), NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                    if (!node.parentElement.closest('.document-page')) continue;
                    const parts = node.textContent.split(text);
                    if (parts.length > 1) {
                        count += parts.length - 1;
                        node.textContent = parts.join(replacement);
                    }
                }
                this.sync('Substituir todos');
                this.app.notify(`Substituída(s) ${count} ocorrência(s).`);
            };
        });
    }

    addComment() {
        const quote = this.app.selectionText || '';
        this.app.modal('Adicionar Comentário Pedagógico', `
            ${quote ? `<p style="font-style:italic">Sobre o trecho: “${escapeHTML(quote.slice(0, 150))}”</p>` : ''}
            <label class="field">Comentário ou orientação
                <textarea id="comment-text" placeholder="Escreva aqui uma nota pedagógica, correção ou observação…"></textarea>
            </label>
            <div class="modal-footer">
                <button class="btn" data-close>Cancelar</button>
                <button class="btn primary" id="post-comment">Publicar Comentário</button>
            </div>
        `, modal => {
            modal.querySelector('#comment-text').focus();
            modal.querySelector('#post-comment').onclick = () => {
                const text = modal.querySelector('#comment-text').value.trim();
                if (!text) return;
                this.app.store.transact('Adicionar comentário', s => s.writer.comments.push({
                    id: uid(),
                    author: 'Professor(a)',
                    text,
                    quote,
                    resolved: false
                }));
                this.app.closeModal();
                this.review();
                this.app.notify('Comentário pedagógico salvo com sucesso.');
            };
        });
    }

    review() {
        const panel = this.root.querySelector('#review-panel');
        if (!panel) return;
        const comments = this.model.comments.filter(c => !c.resolved);
        panel.innerHTML = `
            <div class="panel-heading">Comentários e Notas
                <button class="icon-btn" aria-label="Ocultar comentários" data-action="toggle-comments">${icon('close')}</button>
            </div>
            <div class="review-subtitle">Orientações pedagógicas para o texto.</div>
            <div class="review-filter">Comentários ativos 
                <span class="count">${comments.length}</span>
                <span style="margin-left:auto">${icon('chevron')}</span>
            </div>
            ${comments.map((c, i) => `
                <article class="comment-card">
                    <div class="comment-top">
                        <span class="avatar ${i % 2 ? 'purple' : 'orange'}">${escapeHTML(c.author.split(' ').map(x => x[0]).join('').slice(0, 2))}</span>
                        <div>
                            <div class="comment-name">${escapeHTML(c.author)}</div>
                            <div class="comment-time">${c.author === 'Professor(a)' ? 'Nota pedagógica' : 'Comentário salvo'}</div>
                        </div>
                    </div>
                    ${c.quote ? `<div class="quote">“${escapeHTML(c.quote.slice(0, 150))}”</div>` : ''}
                    <p>${escapeHTML(c.text)}</p>
                    <div class="comment-actions">
                        <button data-resolve="${c.id}">${icon('check')} Concluir</button>
                        <button data-delete-comment="${c.id}" aria-label="Excluir comentário" style="margin-left:auto">${icon('trash')}</button>
                    </div>
                </article>
            `).join('')}
            <button class="add-comment" data-action="comment">${icon('plus')} Nova anotação pedagógica</button>
            <p class="review-note">Armazenamento 100% no seu dispositivo.<br>Autonomia e privacidade escolar.</p>`;

        panel.querySelectorAll('[data-resolve]').forEach(b => b.onclick = () => {
            this.app.store.transact('Concluir comentário', s => s.writer.comments.find(c => c.id === b.dataset.resolve).resolved = true);
            this.review();
        });
        panel.querySelectorAll('[data-delete-comment]').forEach(b => b.onclick = () => {
            this.app.store.transact('Excluir comentário', s => s.writer.comments = s.writer.comments.filter(c => c.id !== b.dataset.deleteComment));
            this.review();
        });
    }

    outline(mode = 'headings') {
        const panel = this.root.querySelector('#outline');
        if (!panel) return;
        if (mode === 'pages') {
            panel.innerHTML = this.model.pages.map((p, i) => `
                <button class="outline-item" data-goto-page="${p.id}">
                    ${icon('page')} Página ${i + 1}
                </button>
            `).join('');
            panel.querySelectorAll('[data-goto-page]').forEach(b => b.onclick = () => {
                this.root.querySelector(`[data-page="${b.dataset.gotoPage}"]`).scrollIntoView({ behavior: 'smooth' });
            });
            return;
        }
        const headings = [...this.root.querySelectorAll('.document-page h1,.document-page h2,.document-page h3')];
        panel.innerHTML = headings.map((h, i) => `
            <button class="outline-item ${h.tagName === 'H1' ? '' : 'level2'}" data-heading="${i}">
                <span class="dot">${h.tagName === 'H1' ? '▾' : '•'}</span>
                ${escapeHTML(h.innerText.replace(/\n/g, ' '))}
            </button>
        `).join('');
        panel.querySelectorAll('[data-heading]').forEach(b => b.onclick = () => {
            headings[Number(b.dataset.heading)].scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    status() {
        const text = [...this.root.querySelectorAll('.document-page')].map(p => p.innerText).join(' ');
        const count = text.trim().split(/\s+/).filter(Boolean).length;
        this.app.setStatus(`
            <span>${this.model.pages.length} página(s)</span>
            <span>${count.toLocaleString('pt-BR')} palavra(s)</span>
            <span class="language">Português (Brasil)</span>
        `);
    }

    setZoom(zoom) {
        this.zoom = zoom;
        this.root.querySelectorAll('.page-wrap,.ruler').forEach(p => p.style.zoom = zoom / 100);
    }

    dispose() {
        this.events.abort();
        this.savedRange = null;
    }
}

return {Writer};
})();
const __meridian_9 = (() => {
/** Batched 2D WebGPU compositor. One instanced draw handles shapes, glyphs and images.
 * The glyph atlas is rasterized at 32 px, uploaded only when dirty, and sampled on GPU.
 * Native DOM is deliberately retained for caret/IME, accessibility and document layout.
 */
const SHADER = `
struct View { resolution: vec2f, pad: vec2f };
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
struct Out {
 @builtin(position) position: vec4f,
 @location(0) local: vec2f,
 @location(1) size: vec2f,
 @location(2) color: vec4f,
 @location(3) uv: vec2f,
 @location(4) info: vec2f
};
@vertex fn vs(@builtin(vertex_index) v: u32,
 @location(0) rect: vec4f, @location(1) color: vec4f,
 @location(2) uv: vec4f, @location(3) meta: vec4f) -> Out {
 let corners = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let p = corners[v]; let xy=rect.xy+p*rect.zw;
 var o: Out; o.position=vec4f(xy/view.resolution*vec2f(2,-2)+vec2f(-1,1),0,1);
 o.local=p*rect.zw; o.size=rect.zw; o.color=color; o.uv=mix(uv.xy,uv.zw,p); o.info=meta.xy; return o;
}
@fragment fn fs(o:Out) -> @location(0) vec4f {
 let tex=textureSample(atlas,smp,o.uv);
 if(o.info.y>2.5) { let d=(length((o.local-o.size*.5)/(o.size*.5))-1)*min(o.size.x,o.size.y)*.5; return vec4f(o.color.rgb,o.color.a*(1-smoothstep(-0.65,0.65,d))); }
 if(o.info.y>1.5) { return tex*o.color; }
 if(o.info.y>0.5) { return vec4f(o.color.rgb,o.color.a*tex.a); }
 let radius=min(o.info.x,min(o.size.x,o.size.y)*0.5);
 let q=abs(o.local-o.size*0.5)-(o.size*0.5-vec2f(radius));
 let distance=length(max(q,vec2f(0)))+min(max(q.x,q.y),0)-radius;
 let alpha=1-smoothstep(-0.65,0.65,distance);
 return vec4f(o.color.rgb,o.color.a*alpha);
}`;
const colorCache = new Map();
function rgba(color, alpha = 1) {
    if (Array.isArray(color))
        return color;
    const key = `${color}/${alpha}`;
    if (colorCache.has(key))
        return colorCache.get(key);
    let s = String(color || '#000000').replace('#', '');
    if (s.length === 3)
        s = s.split('').map(x => x + x).join('');
    const n = parseInt(s.slice(0, 6), 16) || 0, result = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
    colorCache.set(key, result);
    return result;
}
class Renderer {
    constructor(canvas, onState = () => { }) {
        this.canvas = canvas;
        this.onState = onState;
        this.mode = 'initializing';
        this.width = 1;
        this.height = 1;
        this.dpr = 1;
        this.items = [];
        this.count = 0;
        this.capacity = 4096;
        this.data = new Float32Array(this.capacity * 16);
        this.disposed = false;
        this.atlasCanvas = document.createElement('canvas');
        this.atlasCanvas.width = this.atlasCanvas.height = 2048;
        this.atlas2d = this.atlasCanvas.getContext('2d', { willReadFrequently: false });
        this.glyphs = new Map();
        this.images = new Map();
        this.atlasX = 2;
        this.atlasY = 2;
        this.atlasRow = 0;
        this.atlasDirty = true;
        this.lastFrameMs = 0;
        this.frames = 0;
        this.segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
        this.widthCache = new Map();
        this.measureCanvas = document.createElement('canvas');
        this.measure = this.measureCanvas.getContext('2d');
        this.ready = this.init();
    }
    async init() {
        try {
            if (!navigator.gpu)
                throw new Error('WebGPU is unavailable');
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter)
                throw new Error('No WebGPU adapter');
            const device = await adapter.requestDevice();
            if (this.disposed) {
                device.destroy();
                return;
            }
            this.device = device;
            this.context = this.canvas.getContext('webgpu');
            if (!this.context)
                throw new Error('WebGPU canvas unavailable');
            this.format = navigator.gpu.getPreferredCanvasFormat();
            this.context.configure({ device, format: this.format, alphaMode: 'opaque' });
            device.addEventListener('uncapturederror', event => { console.error('WebGPU validation:', event.error.message); this.fallback(event.error.message); });
            device.lost.then(info => { if (!this.disposed && this.mode === 'WebGPU')
                this.fallback(`Device lost: ${info.reason}`); });
            device.pushErrorScope('validation');
            this.uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            this.texture = device.createTexture({ size: [2048, 2048], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
            this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
            const module = device.createShaderModule({ code: SHADER });
            this.pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 64, stepMode: 'instance', attributes: [0, 1, 2, 3].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' })) }] }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] }, primitive: { topology: 'triangle-list' } });
            this.bindGroup = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: this.texture.createView() }, { binding: 2, resource: this.sampler }] });
            this.buffer = device.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
            const error = await device.popErrorScope();
            if (error)
                throw new Error(error.message);
            this.mode = 'WebGPU';
            this.onState(this.mode);
            this.onReady?.();
        }
        catch (error) {
            if (!this.disposed)
                this.fallback(error.message);
        }
    }
    fallback(reason) {
        if (this.mode === 'Canvas 2D' || this.disposed)
            return;
        if (this.context) {
            const old = this.canvas;
            this.canvas = old.cloneNode(false);
            old.replaceWith(this.canvas);
            this.context = null;
        }
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.mode = 'Canvas 2D';
        this.fallbackReason = reason;
        this.onState(this.mode);
        this.onReady?.();
    }
    begin(width, height, background = '#ffffff') {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this.dpr = Math.min(devicePixelRatio || 1, 2);
        const max = this.device?.limits.maxTextureDimension2D || 8192;
        const w = Math.min(max, Math.round(this.width * this.dpr)), h = Math.min(max, Math.round(this.height * this.dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.background = background;
        this.clip = null;
        this.count = 0;
        this.items.length = 0;
        this.startTime = performance.now();
    }
    reserve(count) {
        if (count <= this.capacity)
            return;
        while (this.capacity < count)
            this.capacity *= 2;
        const next = new Float32Array(this.capacity * 16);
        next.set(this.data);
        this.data = next;
        if (this.device && this.mode === 'WebGPU') {
            this.buffer?.destroy();
            this.buffer = this.device.createBuffer({ size: next.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        }
    }
    quad(x, y, w, h, color, uv = [0, 0, 0, 0], radius = 0, kind = 0) {
        if (w <= 0 || h <= 0 || x + w < 0 || y + h < 0 || x > this.width || y > this.height)
            return;
        this.reserve(this.count + 1);
        const o = this.count++ * 16;
        this.data.set([x, y, w, h, ...rgba(color), ...uv, radius, kind, 0, 0], o);
    }
    rect(x, y, w, h, color, radius = 0) {
        if (this.mode === 'Canvas 2D')
            this.items.push({ type: 'rect', x, y, w, h, color, radius });
        else
            this.quad(x, y, w, h, color, [0, 0, 0, 0], radius);
    }
    ellipse(x, y, w, h, color) { if (this.mode === 'Canvas 2D')
        this.items.push({ type: 'ellipse', x, y, w, h, color });
    else
        this.quad(x, y, w, h, color, [0, 0, 0, 0], 0, 3); }
    border(x, y, w, h, color, thickness = 1) { this.rect(x, y, w, thickness, color); this.rect(x, y + h - thickness, w, thickness, color); this.rect(x, y, thickness, h, color); this.rect(x + w - thickness, y, thickness, h, color); }
    allocate(w, h) {
        if (this.atlasX + w > 2046) {
            this.atlasX = 2;
            this.atlasY += this.atlasRow + 2;
            this.atlasRow = 0;
        }
        if (this.atlasY + h > 2046)
            return null;
        const box = { x: this.atlasX, y: this.atlasY, w, h };
        this.atlasX += w + 2;
        this.atlasRow = Math.max(this.atlasRow, h);
        return box;
    }
    glyph(char, bold = false, italic = false) {
        const key = `${bold}/${italic}/${char}`;
        if (this.glyphs.has(key))
            return this.glyphs.get(key);
        const ctx = this.atlas2d;
        ctx.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} 32px Arial, sans-serif`;
        const metrics = ctx.measureText(char), advance = metrics.width, w = Math.ceil(Math.max(advance, metrics.actualBoundingBoxRight || 0) + Math.max(0, metrics.actualBoundingBoxLeft || 0)) + 8;
        const box = this.allocate(w, 48);
        if (!box)
            return null;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(char, box.x + 4, box.y + 35);
        const glyph = { ...box, advance, uv: [box.x / 2048, box.y / 2048, (box.x + w) / 2048, (box.y + 48) / 2048] };
        this.glyphs.set(key, glyph);
        this.atlasDirty = true;
        return glyph;
    }
    textWidth(text, size = 13, bold = false, italic = false) { const key = `${size}/${bold}/${italic}/${text}`; if (this.widthCache.has(key))
        return this.widthCache.get(key); this.measure.font = `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${size}px Arial, sans-serif`; const width = this.measure.measureText(String(text)).width; if (this.widthCache.size > 16384)
        this.widthCache.clear(); this.widthCache.set(key, width); return width; }
    text(text, x, y, { size = 13, color = '#243631', bold = false, italic = false, maxWidth = Infinity, align = 'left' } = {}) {
        text = String(text ?? '');
        if (!text)
            return;
        // Clip at grapheme boundaries as far as available; never draw beyond the cell.
        const chars = this.segmenter ? [...this.segmenter.segment(text)].map(s => s.segment) : [...text];
        let visible = '', width = 0;
        for (const char of chars) {
            const cw = this.textWidth(char, size, bold, italic);
            if (width + cw > maxWidth)
                break;
            visible += char;
            width += cw;
        }
        if (align === 'right')
            x -= width;
        else if (align === 'center')
            x -= width / 2;
        if (this.mode === 'Canvas 2D') {
            this.items.push({ type: 'text', text: visible, x, y, size, color, bold, italic });
            return;
        }
        const scale = size / 32;
        for (const char of visible) {
            const g = this.glyph(char, bold, italic);
            if (!g) {
                x += size * .6;
                continue;
            }
            this.quad(x - 4 * scale, y - 9 * scale, g.w * scale, g.h * scale, color, g.uv, 0, 1);
            x += g.advance * scale;
        }
    }
    wrapText(text, maxWidth, size = 24, bold = false) {
        const lines = [];
        for (const paragraph of String(text).split('\n')) {
            let line = '';
            for (const word of paragraph.split(' ')) {
                const next = line ? `${line} ${word}` : word;
                if (line && this.textWidth(next, size, bold) > maxWidth) {
                    lines.push(line);
                    line = word;
                }
                else
                    line = next;
            }
            lines.push(line);
        }
        return lines;
    }
    image(src, x, y, w, h) {
        if (!src)
            return;
        let entry = this.images.get(src);
        if (!entry) {
            entry = { ready: false };
            this.images.set(src, entry);
            const img = new Image();
            img.onload = () => { if (this.disposed)
                return; entry.img = img; const scale = Math.min(1, 512 / img.width, 512 / img.height), iw = Math.max(1, Math.round(img.width * scale)), ih = Math.max(1, Math.round(img.height * scale)); entry.box = this.allocate(iw, ih); if (entry.box) {
                const b = entry.box;
                this.atlas2d.drawImage(img, b.x, b.y, iw, ih);
                entry.uv = [b.x / 2048, b.y / 2048, (b.x + iw) / 2048, (b.y + ih) / 2048];
                this.atlasDirty = true;
            } entry.ready = true; this.onReady?.(); };
            img.onerror = () => { entry.failed = true; };
            img.src = src;
        }
        if (!entry.ready) {
            this.rect(x, y, w, h, '#e7eeeb', 4);
            return;
        }
        if (this.mode === 'Canvas 2D')
            this.items.push({ type: 'image', img: entry.img, x, y, w, h });
        else if (entry.uv)
            this.quad(x, y, w, h, '#ffffff', entry.uv, 0, 2);
    }
    end() {
        if (this.disposed || this.mode === 'initializing')
            return;
        if (this.mode === 'Canvas 2D') {
            const ctx = this.ctx;
            ctx.setTransform(this.canvas.width / this.width, 0, 0, this.canvas.height / this.height, 0, 0);
            ctx.fillStyle = this.background;
            ctx.fillRect(0, 0, this.width, this.height);
            ctx.save();
            if (this.clip) {
                ctx.beginPath();
                ctx.rect(this.clip.x, this.clip.y, this.clip.w, this.clip.h);
                ctx.clip();
            }
            for (const item of this.items) {
                if (item.type === 'ellipse') {
                    ctx.fillStyle = item.color;
                    ctx.beginPath();
                    ctx.ellipse(item.x + item.w / 2, item.y + item.h / 2, item.w / 2, item.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
                else if (item.type === 'rect') {
                    ctx.fillStyle = typeof item.color === 'string' ? item.color : `rgba(${item.color.slice(0, 3).map(v => v * 255).join(',')},${item.color[3]})`;
                    ctx.beginPath();
                    ctx.roundRect(item.x, item.y, item.w, item.h, Math.min(item.radius, item.w / 2, item.h / 2));
                    ctx.fill();
                }
                else if (item.type === 'image')
                    ctx.drawImage(item.img, item.x, item.y, item.w, item.h);
                else {
                    ctx.fillStyle = item.color;
                    ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? '700' : '400'} ${item.size}px Arial, sans-serif`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(item.text, item.x, item.y);
                }
            }
            ctx.restore();
        }
        else {
            const device = this.device;
            if (this.atlasDirty) {
                device.queue.copyExternalImageToTexture({ source: this.atlasCanvas }, { texture: this.texture }, { width: 2048, height: 2048 });
                this.atlasDirty = false;
            }
            device.queue.writeBuffer(this.uniform, 0, new Float32Array([this.width, this.height, 0, 0]));
            if (this.count)
                device.queue.writeBuffer(this.buffer, 0, this.data.buffer, 0, this.count * 64);
            const encoder = device.createCommandEncoder();
            const c = rgba(this.background);
            const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: c[0], g: c[1], b: c[2], a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
            if (this.clip) {
                const dx = this.canvas.width / this.width, dy = this.canvas.height / this.height, c = this.clip, x = Math.max(0, Math.floor(c.x * dx)), y = Math.max(0, Math.floor(c.y * dy)), right = Math.min(this.canvas.width, Math.ceil((c.x + c.w) * dx)), bottom = Math.min(this.canvas.height, Math.ceil((c.y + c.h) * dy));
                pass.setScissorRect(x, y, Math.max(0, right - x), Math.max(0, bottom - y));
            }
            if (this.count) {
                pass.setPipeline(this.pipeline);
                pass.setBindGroup(0, this.bindGroup);
                pass.setVertexBuffer(0, this.buffer);
                pass.draw(6, this.count);
            }
            pass.end();
            device.queue.submit([encoder.finish()]);
        }
        this.lastFrameMs = performance.now() - this.startTime;
        this.frames++;
    }
    dispose() { this.disposed = true; this.buffer?.destroy(); this.uniform?.destroy(); this.texture?.destroy(); this.device?.destroy(); this.images.clear(); }
}

return {rgba,Renderer};
})();
const __meridian_10 = (() => {
/** A bounded, non-eval formula parser and dependency-tracked evaluation engine. */
function columnName(index) { let value = index + 1, name = ''; while (value > 0) {
    value--;
    name = String.fromCharCode(65 + value % 26) + name;
    value = Math.floor(value / 26);
} return name; }
function columnIndex(name) { let n = 0; for (const c of name.toUpperCase().replace(/\$/g, ''))
    n = n * 26 + c.charCodeAt(0) - 64; return n - 1; }
function address(c, r) { return `${columnName(c)}${r + 1}`; }
function parseAddress(ref) { const m = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(ref); if (!m)
    throw new FormulaError('#REF!'); const c = columnIndex(m[1]), r = Number(m[2]) - 1; if (c > 16383 || r > 1048575)
    throw new FormulaError('#REF!'); return { c, r }; }
class FormulaError extends Error {
    constructor(code) { super(code); this.code = code; }
}
function tokenize(source) {
    const tokens = [];
    let pos = 0;
    if (source.length > 32767)
        throw new FormulaError('#LIMIT!');
    while (pos < source.length) {
        if (/\s/.test(source[pos])) {
            pos++;
            continue;
        }
        const rest = source.slice(pos);
        let m;
        if ((m = /^"((?:[^"]|"")*)"/.exec(rest)))
            tokens.push({ type: 'string', value: m[1].replace(/""/g, '"'), raw: m[0] });
        else if ((m = /^'((?:[^']|'')*)'/.exec(rest)))
            tokens.push({ type: 'name', value: m[1].replace(/''/g, "'"), raw: m[0] });
        else if ((m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)))
            tokens.push({ type: 'number', value: Number(m[0]), raw: m[0] });
        else if ((m = /^\$?[A-Za-z]{1,3}\$?[1-9]\d*(?![A-Za-z_0-9(])/.exec(rest)))
            tokens.push({ type: 'ref', value: m[0].toUpperCase(), raw: m[0] });
        else if ((m = /^[A-Za-z_][A-Za-z_0-9.]*/.exec(rest)))
            tokens.push({ type: 'name', value: m[0], raw: m[0] });
        else if ((m = /^(?:<>|>=|<=|[+\-*/^&=<>%():,!;])/.exec(rest)))
            tokens.push({ type: m[0] === ';' ? ',' : m[0], value: m[0], raw: m[0] });
        else
            throw new FormulaError('#PARSE!');
        pos += m[0].length;
        if (tokens.length > 4096)
            throw new FormulaError('#LIMIT!');
    }
    tokens.push({ type: 'eof' });
    return tokens;
}
const PRECEDENCE = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
function parseFormula(source) {
    const tokens = tokenize(source.startsWith('=') ? source.slice(1) : source);
    let i = 0, depth = 0;
    const take = type => { if (tokens[i].type !== type)
        throw new FormulaError('#PARSE!'); return tokens[i++]; };
    const expression = (min = 0) => {
        if (++depth > 128)
            throw new FormulaError('#LIMIT!');
        let t = tokens[i++], left;
        if (t.type === 'number' || t.type === 'string')
            left = { type: 'literal', value: t.value };
        else if (t.type === '+' || t.type === '-')
            left = { type: 'unary', op: t.type, value: expression(5) };
        else if (t.type === '(') {
            left = expression();
            take(')');
        }
        else if (t.type === 'name' || t.type === 'ref') {
            if (tokens[i].type === '!') {
                i++;
                const ref = take('ref');
                left = { type: 'ref', ref: ref.value, sheet: t.value };
            }
            else if (tokens[i].type === '(') {
                i++;
                const args = [];
                if (tokens[i].type !== ')') {
                    do {
                        args.push(expression());
                        if (tokens[i].type !== ',')
                            break;
                        i++;
                    } while (true);
                }
                take(')');
                left = { type: 'call', name: t.value.toUpperCase(), args };
            }
            else if (t.type === 'ref')
                left = { type: 'ref', ref: t.value };
            else if (['TRUE', 'FALSE'].includes(t.value.toUpperCase()))
                left = { type: 'literal', value: t.value.toUpperCase() === 'TRUE' };
            else
                throw new FormulaError('#NAME?');
        }
        else
            throw new FormulaError('#PARSE!');
        if (tokens[i].type === ':') {
            i++;
            const end = take('ref');
            if (left.type !== 'ref')
                throw new FormulaError('#REF!');
            left = { type: 'range', start: left.ref, end: end.value, sheet: left.sheet };
        }
        while (tokens[i].type === '%') {
            i++;
            left = { type: 'binary', op: '/', left, right: { type: 'literal', value: 100 } };
        }
        while (PRECEDENCE[tokens[i].type] >= min) {
            const op = tokens[i++].type, p = PRECEDENCE[op];
            left = { type: 'binary', op, left, right: expression(op === '^' ? p : p + 1) };
        }
        depth--;
        return left;
    };
    const ast = expression();
    if (tokens[i].type !== 'eof')
        throw new FormulaError('#PARSE!');
    return ast;
}
const num = value => { if (Array.isArray(value))
    throw new FormulaError('#VALUE!'); if (value === '' || value == null)
    return 0; const n = Number(value); if (!Number.isFinite(n))
    throw new FormulaError('#VALUE!'); return n; };
const flatten = arr => arr.flat(Infinity);
class FormulaEngine {
    constructor(workbook) { this.workbook = workbook; this.cache = new Map(); this.ast = new Map(); this.dependencies = new Map(); this.dependents = new Map(); }
    reset(workbook = this.workbook) { this.workbook = workbook; this.cache.clear(); this.dependencies.clear(); this.dependents.clear(); }
    invalidate(sheetId, ref) { const stack = [`${sheetId}!${ref.replace(/\$/g, '').toUpperCase()}`], seen = new Set(); while (stack.length) {
        const key = stack.pop();
        if (seen.has(key))
            continue;
        seen.add(key);
        this.cache.delete(key);
        for (const dep of this.dependents.get(key) || [])
            stack.push(dep);
    } }
    sheet(id) { const sheet = this.workbook.sheets.find(s => s.id === id || s.name.toLowerCase() === String(id).toLowerCase()); if (!sheet)
        throw new FormulaError('#REF!'); return sheet; }
    get(sheetId, ref) { try {
        return this.evaluateCell(sheetId, ref, [], { steps: 0 });
    }
    catch (e) {
        return e instanceof FormulaError ? e.code : '#ERROR!';
    } }
    evaluateCell(sheetId, ref, stack, budget) {
        if (++budget.steps > 200000 || stack.length > 256)
            throw new FormulaError('#LIMIT!');
        const sheet = this.sheet(sheetId);
        ref = ref.replace(/\$/g, '').toUpperCase();
        parseAddress(ref);
        const key = `${sheet.id}!${ref}`;
        const parent = stack.at(-1);
        if (parent) {
            if (!this.dependencies.has(parent))
                this.dependencies.set(parent, new Set());
            this.dependencies.get(parent).add(key);
            if (!this.dependents.has(key))
                this.dependents.set(key, new Set());
            this.dependents.get(key).add(parent);
        }
        if (stack.includes(key))
            throw new FormulaError('#CYCLE!');
        if (this.cache.has(key)) {
            const val = this.cache.get(key);
            if (val instanceof FormulaError)
                throw val;
            return val;
        }
        for (const dep of this.dependencies.get(key) || [])
            this.dependents.get(dep)?.delete(key);
        this.dependencies.delete(key);
        const raw = sheet.cells[ref]?.v ?? '';
        let value;
        try {
            if (typeof raw === 'string' && raw.startsWith('=')) {
                let ast = this.ast.get(raw);
                if (!ast) {
                    ast = parseFormula(raw);
                    if (this.ast.size > 4096)
                        this.ast.clear();
                    this.ast.set(raw, ast);
                }
                value = this.evaluate(ast, sheet.id, [...stack, key], budget);
                if (Array.isArray(value))
                    throw new FormulaError('#VALUE!');
            }
            else if (typeof raw === 'string' && raw.startsWith("'"))
                value = raw.slice(1);
            else
                value = raw !== '' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(raw)) ? Number(raw) : raw;
            if (typeof value === 'number' && !Number.isFinite(value))
                throw new FormulaError('#NUM!');
            this.cache.set(key, value);
            return value;
        }
        catch (error) {
            if (error instanceof FormulaError)
                this.cache.set(key, error);
            throw error;
        }
    }
    evaluate(node, sheetId, stack, budget) {
        if (++budget.steps > 200000)
            throw new FormulaError('#LIMIT!');
        const ev = n => this.evaluate(n, sheetId, stack, budget);
        if (node.type === 'literal')
            return node.value;
        if (node.type === 'ref')
            return this.evaluateCell(node.sheet || sheetId, node.ref, stack, budget);
        if (node.type === 'range') {
            const a = parseAddress(node.start), b = parseAddress(node.end), values = [];
            const count = (Math.abs(b.c - a.c) + 1) * (Math.abs(b.r - a.r) + 1);
            if (count > 100000)
                throw new FormulaError('#LIMIT!');
            for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
                for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++)
                    values.push(this.evaluateCell(node.sheet || sheetId, address(c, r), stack, budget));
            return values;
        }
        if (node.type === 'unary')
            return (node.op === '-' ? -1 : 1) * num(ev(node.value));
        if (node.type === 'binary') {
            const a = ev(node.left), b = ev(node.right);
            if (node.op === '&')
                return String(a) + String(b);
            if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
                const x = typeof a === 'string' ? a.toLowerCase() : a, y = typeof b === 'string' ? b.toLowerCase() : b;
                return { '=': () => x === y, '<>': () => x !== y, '<': () => x < y, '>': () => x > y, '<=': () => x <= y, '>=': () => x >= y }[node.op]();
            }
            const x = num(a), y = num(b);
            switch (node.op) {
                case '+': return x + y;
                case '-': return x - y;
                case '*': return x * y;
                case '/':
                    if (y === 0)
                        throw new FormulaError('#DIV/0!');
                    return x / y;
                case '^': return x ** y;
            }
        }
        if (node.type === 'call') {
            const arity = (min, max = min) => { if (node.args.length < min || node.args.length > max)
                throw new FormulaError('#VALUE!'); };
            if (node.name === 'IF') {
                arity(2, 3);
                return ev(node.args[0]) ? ev(node.args[1]) : node.args[2] ? ev(node.args[2]) : false;
            }
            if (node.name === 'IFERROR') {
                arity(2);
                try {
                    return ev(node.args[0]);
                }
                catch (e) {
                    if (e instanceof FormulaError)
                        return ev(node.args[1]);
                    throw e;
                }
            }
            const args = node.args.map(ev), all = flatten(args), numbers = all.filter(v => typeof v === 'number');
            switch (node.name) {
                case 'SUM': return numbers.reduce((a, b) => a + b, 0);
                case 'AVERAGE':
                    if (!numbers.length)
                        throw new FormulaError('#DIV/0!');
                    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
                case 'MIN': return numbers.length ? Math.min(...numbers) : 0;
                case 'MAX': return numbers.length ? Math.max(...numbers) : 0;
                case 'COUNT': return numbers.length;
                case 'COUNTA': return all.filter(v => v !== '' && v != null).length;
                case 'AND': return all.every(Boolean);
                case 'OR': return all.some(Boolean);
                case 'NOT':
                    arity(1);
                    return !args[0];
                case 'ROUND': {
                    arity(2);
                    const p = num(args[1]);
                    if (Math.abs(p) > 100)
                        throw new FormulaError('#NUM!');
                    const factor = 10 ** p, n = num(args[0]);
                    return Math.sign(n) * Math.round(Math.abs(n) * factor + Number.EPSILON) / factor;
                }
                case 'ABS':
                    arity(1);
                    return Math.abs(num(args[0]));
                case 'SQRT':
                    arity(1);
                    return Math.sqrt(num(args[0]));
                case 'POWER':
                    arity(2);
                    return num(args[0]) ** num(args[1]);
                case 'LEN':
                    arity(1);
                    return String(args[0]).length;
                case 'UPPER':
                    arity(1);
                    return String(args[0]).toUpperCase();
                case 'LOWER':
                    arity(1);
                    return String(args[0]).toLowerCase();
                case 'CONCAT':
                case 'CONCATENATE': return all.join('');
                case 'LEFT':
                    arity(1, 2);
                    return String(args[0]).slice(0, args.length > 1 ? Math.max(0, num(args[1])) : 1);
                case 'RIGHT': {
                    arity(1, 2);
                    const n = args.length > 1 ? Math.max(0, num(args[1])) : 1;
                    return n ? String(args[0]).slice(-n) : '';
                }
                default: throw new FormulaError('#NAME?');
            }
        }
        throw new FormulaError('#ERROR!');
    }
}
function shiftFormula(raw, dc, dr) {
    if (!String(raw).startsWith('='))
        return raw;
    return raw.replace(/"(?:[^"]|"")*"|(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)\b/g, (match, ac, col, ar, row, offset, source) => {
        if (match.startsWith('"') || source[offset + match.length] === '(')
            return match;
        const c = columnIndex(col) + (ac ? 0 : dc), r = Number(row) - 1 + (ar ? 0 : dr);
        if (c < 0 || r < 0 || c > 16383 || r > 1048575)
            return '#REF!';
        return `${ac}${columnName(c)}${ar}${r + 1}`;
    });
}
function parseDelimited(text, separator = ',') {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quoted && text[i + 1] === '"') {
                field += '"';
                i++;
            }
            else if (quoted || field === '')
                quoted = !quoted;
            else
                field += c;
        }
        else if (!quoted && c === separator) {
            row.push(field);
            field = '';
        }
        else if (!quoted && (c === '\n' || c === '\r')) {
            if (c === '\r' && text[i + 1] === '\n')
                i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        }
        else
            field += c;
    }
    if (quoted)
        throw new Error('Unclosed quoted field.');
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
function serializeDelimited(rows, separator = ',') { return rows.map(row => row.map(v => { const s = String(v ?? ''); return s.includes(separator) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(separator)).join('\r\n'); }

return {columnName,columnIndex,address,parseAddress,FormulaError,parseFormula,FormulaEngine,shiftFormula,parseDelimited,serializeDelimited};
})();
const __meridian_8 = (() => {
const { uid, escapeHTML, clamp, clone, download } = __meridian_1;
const { icon } = __meridian_2;
const { Renderer } = __meridian_9;
const { FormulaEngine, address, parseAddress, columnName, shiftFormula, parseDelimited, serializeDelimited } = __meridian_10;
class Grid {
    constructor(app) {
        this.app = app;
        this.selection = { c: 1, r: 4, c2: 1, r2: 4 };
        this.zoom = 100;
        this.events = new AbortController();
        this.raf = 0;
        this.editing = false;
        this.engine = new FormulaEngine(app.store.state.workbook);
    }

    get book() {
        return this.app.store.state.workbook;
    }

    get sheet() {
        return this.book.sheets.find(s => s.id === this.book.activeSheet) || this.book.sheets[0];
    }

    mount(root) {
        this.root = root;
        root.innerHTML = `
            <section class="sheet-shell">
                <div class="sheet-context">
                    ${icon('table')}
                    <strong>${escapeHTML(this.book.title)}</strong>
                    <small>/ Diário de Classe e Indicadores</small>
                    <span class="grow"></span>
                    <span class="pill">Fórmulas em Tempo Real</span>
                    <button class="btn" data-action="chart">${icon('chart')} Gerar Gráfico</button>
                </div>
                <div class="formula-bar">
                    <input class="name-box" aria-label="Endereço da célula" value="B5">
                    <span class="formula-symbol">ƒx</span>
                    <input class="formula-input" aria-label="Barra de fórmulas" spellcheck="false">
                </div>
                <div class="sheet-viewport" tabindex="0" role="application" aria-label="Planilha de notas e cálculos. Setas movem. Enter ou F2 edita. Shift estende seleção.">
                    <div class="sheet-scroll"><div class="sheet-space"></div></div>
                    <canvas class="sheet-canvas" aria-hidden="true"></canvas>
                    <div class="sr-only" id="cell-announcement" aria-live="polite"></div>
                </div>
                <div class="sheet-bottom"></div>
            </section>`;

        this.viewport = root.querySelector('.sheet-viewport');
        this.scroll = root.querySelector('.sheet-scroll');
        this.formulaInput = root.querySelector('.formula-input');
        this.nameBox = root.querySelector('.name-box');
        this.renderer = new Renderer(root.querySelector('canvas'), mode => this.app.setEngine(mode));
        this.renderer.onReady = () => this.draw();
        this.resize = new ResizeObserver(() => this.schedule());
        this.resize.observe(this.viewport);

        this.scroll.addEventListener('scroll', () => {
            if (this.editing) this.commitEdit();
            this.schedule();
        }, { signal: this.events.signal });

        this.viewport.addEventListener('pointerdown', e => this.pointerDown(e), { signal: this.events.signal });
        this.viewport.addEventListener('dblclick', e => {
            if (e.target.closest('.cell-editor')) return;
            this.beginEdit();
        }, { signal: this.events.signal });

        this.viewport.addEventListener('keydown', e => this.keydown(e), { signal: this.events.signal });
        this.viewport.addEventListener('copy', e => this.clipboardCopy(e), { signal: this.events.signal });
        this.viewport.addEventListener('cut', e => this.clipboardCopy(e, true), { signal: this.events.signal });
        this.viewport.addEventListener('paste', e => {
            if (this.editing) return;
            e.preventDefault();
            this.pasteText(e.clipboardData.getData('text/plain'));
        }, { signal: this.events.signal });

        this.formulaInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.setCell(this.selection.c, this.selection.r, this.formulaInput.value);
                this.viewport.focus();
            }
            if (e.key === 'Escape') {
                this.updateSelection();
                this.viewport.focus();
            }
        }, { signal: this.events.signal });

        this.formulaInput.addEventListener('change', () => this.setCell(this.selection.c, this.selection.r, this.formulaInput.value), { signal: this.events.signal });

        this.nameBox.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                try {
                    const refs = this.nameBox.value.split(':').map(parseAddress);
                    if (refs.length > 2 || refs.some(p => p.c < 0 || p.c >= this.sheet.cols || p.r < 0 || p.r >= this.sheet.rows)) {
                        throw new Error('Endereço fora da planilha');
                    }
                    this.selection = { ...refs[0], c2: refs[1]?.c ?? refs[0].c, r2: refs[1]?.r ?? refs[0].r };
                    this.ensureVisible();
                    this.updateSelection();
                    this.viewport.focus();
                } catch {
                    this.app.notify('Digite uma célula ou intervalo, ex: B5 ou A5:G12.', true);
                }
            }
        }, { signal: this.events.signal });

        this.unsubscribe = this.app.store.on('change', event => {
            if (!event.replace) {
                this.engine.reset(this.book);
                this.schedule();
            }
        });

        this.updateDimensions();
        this.tabs();
        this.updateSelection();
        this.draw();
    }

    bounds() {
        const s = this.selection;
        return { c: Math.min(s.c, s.c2), r: Math.min(s.r, s.r2), c2: Math.max(s.c, s.c2), r2: Math.max(s.r, s.r2) };
    }

    width(c) {
        return (this.sheet.widths[c] || 128) * this.zoom / 100;
    }

    updateDimensions() {
        this.offsets = [0];
        for (let c = 0; c < this.sheet.cols; c++) this.offsets.push(this.offsets.at(-1) + this.width(c));
        this.rowHeight = 29 * this.zoom / 100;
        this.header = 28;
        this.gutter = 45;
        const space = this.root.querySelector('.sheet-space');
        space.style.width = `${this.offsets.at(-1) + this.gutter}px`;
        space.style.height = `${this.sheet.rows * this.rowHeight + this.header}px`;
    }

    cellBox(c, r) {
        return {
            x: this.gutter + this.offsets[c] - this.scroll.scrollLeft,
            y: this.header + r * this.rowHeight - this.scroll.scrollTop,
            w: this.width(c),
            h: this.rowHeight
        };
    }

    hit(e) {
        const rect = this.viewport.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let c = 0;
        const px = x - this.gutter + this.scroll.scrollLeft;
        while (c < this.sheet.cols - 1 && this.offsets[c + 1] <= px) c++;
        const r = Math.floor((y - this.header + this.scroll.scrollTop) / this.rowHeight);
        return {
            c: clamp(c, 0, this.sheet.cols - 1),
            r: clamp(r, 0, this.sheet.rows - 1),
            header: y < this.header,
            gutter: x < this.gutter
        };
    }

    pointerDown(event) {
        if (event.button !== 0 || event.target.closest('.cell-editor')) return;
        this.commitEdit();
        const hit = this.hit(event);
        if (hit.header || hit.gutter) return;
        event.preventDefault();
        this.viewport.focus();
        if (event.shiftKey) {
            this.selection.c2 = hit.c;
            this.selection.r2 = hit.r;
        } else {
            this.selection = { c: hit.c, r: hit.r, c2: hit.c, r2: hit.r };
        }
        this.updateSelection();
        this.schedule();

        const move = e => {
            const h = this.hit(e);
            if (h.c !== this.selection.c2 || h.r !== this.selection.r2) {
                this.selection.c2 = h.c;
                this.selection.r2 = h.r;
                this.updateSelection();
                this.schedule();
            }
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
    }

    schedule() {
        if (this.raf) return;
        this.raf = requestAnimationFrame(() => {
            this.raf = 0;
            this.draw();
        });
    }

    display(value, style = {}) {
        if (typeof value === 'number') {
            if (style.fmt === 'currency') {
                return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
            }
            if (style.fmt === 'percent') {
                return `${(value * 100).toFixed(1)}%`;
            }
            if (style.fmt === 'number') {
                return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
            }
            return Number.isInteger(value) ? String(value) : Number(value.toPrecision(10)).toString();
        }
        if (typeof value === 'boolean') return value ? 'VERDADEIRO' : 'FALSO';
        return String(value ?? '');
    }

    draw() {
        if (!this.viewport?.isConnected || this.renderer.disposed) return;
        const W = this.scroll.clientWidth, H = this.scroll.clientHeight, R = this.renderer;
        const sx = this.scroll.scrollLeft, sy = this.scroll.scrollTop, hh = this.header, gw = this.gutter, rh = this.rowHeight, z = this.zoom / 100;
        const isDark = document.documentElement.dataset.theme === 'dark';

        const theme = isDark ? {
            bg: '#1c1815',
            gridLine: '#382e25',
            headerBg: '#25201b',
            headerText: '#a69888',
            headerBorder: '#3d342b',
            headerCorner: '#201b17',
            activeHeaderBg: '#3d2b20',
            activeHeaderText: '#e27a55',
            selectBorder: '#e27a55',
            selectFill: [.88, .48, .33, .16],
            defaultText: '#f2e9dc',
            errorText: '#f28b82'
        } : {
            bg: '#fdfbf7',
            gridLine: '#e6ded2',
            headerBg: '#f6eee3',
            headerText: '#706253',
            headerBorder: '#d8cfbe',
            headerCorner: '#ede2d3',
            activeHeaderBg: '#eddccb',
            activeHeaderText: '#8c3b1d',
            selectBorder: '#8c3b1d',
            selectFill: [.55, .23, .11, .09],
            defaultText: '#2e2820',
            errorText: '#b3261e'
        };

        this.updateDimensions();
        R.begin(W, H, theme.bg);

        const firstR = Math.max(0, Math.floor(sy / rh));
        const lastR = Math.min(this.sheet.rows - 1, Math.ceil((sy + H - hh) / rh));
        let firstC = 0;
        while (firstC < this.sheet.cols - 1 && this.offsets[firstC + 1] < sx) firstC++;
        let lastC = firstC;
        while (lastC < this.sheet.cols - 1 && this.offsets[lastC] < sx + W - gw) lastC++;

        const b = this.bounds();

        for (let r = firstR; r <= lastR; r++) {
            for (let c = firstC; c <= lastC; c++) {
                const x = gw + this.offsets[c] - sx, y = hh + r * rh - sy, w = this.width(c);
                const key = address(c, r), cell = this.sheet.cells[key], style = cell?.s || {};
                if (style.fill) {
                    let fill = style.fill;
                    if (isDark) {
                        if (fill === '#f5ebe1' || fill === '#e3eee9') fill = '#3a2d24';
                        else if (fill === '#eedfd0' || fill === '#dcece5') fill = '#4a382c';
                        else if (fill === '#faf7f2' || fill === '#f7faf8') fill = '#26201b';
                        else if (fill === '#ffffff' || fill === '#fff') fill = '#1c1815';
                        else if (fill === '#f0f6f3' || fill === '#f5efe6') fill = '#30261f';
                        else if (fill === '#fbf8f2') fill = '#231d18';
                    }
                    R.rect(x, y, w, rh, fill);
                }
                const selected = c >= b.c && c <= b.c2 && r >= b.r && r <= b.r2;
                if (selected) R.rect(x, y, w, rh, theme.selectFill);
            }
        }

        // Linhas horizontais e verticais da grade
        for (let r = firstR; r <= lastR + 1; r++) {
            R.rect(gw, hh + r * rh - sy, W - gw, .65, theme.gridLine);
        }
        for (let c = firstC; c <= lastC + 1; c++) {
            R.rect(gw + this.offsets[c] - sx, hh, .65, H - hh, theme.gridLine);
        }

        // Textos das células
        for (let r = firstR; r <= lastR; r++) {
            for (let c = firstC; c <= lastC; c++) {
                const x = gw + this.offsets[c] - sx, y = hh + r * rh - sy, w = this.width(c);
                const key = address(c, r), cell = this.sheet.cells[key];
                if (!cell || cell.v === '') continue;
                const style = cell.s || {};
                const value = this.engine.get(this.sheet.id, key);
                const text = this.display(value, style);
                const isNum = typeof value === 'number';
                const align = style.align || (isNum ? 'right' : 'left');
                const size = (style.size || 13) * z;
                let maxWidth = w - 15;
                if (!isNum && align === 'left') {
                    for (let next = c + 1; next <= lastC && !this.sheet.cells[address(next, r)]?.v; next++) {
                        maxWidth += this.width(next);
                    }
                }

                let textColor = style.color;
                if (String(value).startsWith('#')) {
                    textColor = theme.errorText;
                } else if (isDark) {
                    if (!textColor || textColor === '#2e2820' || textColor === '#592c19' || textColor === '#243c34' || textColor === '#225347' || textColor === '#176858') {
                        textColor = theme.defaultText;
                    } else if (textColor === '#8c3b1d') {
                        textColor = '#f09572';
                    } else if (textColor === '#2d6a4f' || textColor === '#16805b') {
                        textColor = '#60ba8a';
                    } else if (textColor === '#7a6e60' || textColor === '#71807c') {
                        textColor = '#a69888';
                    }
                } else {
                    textColor = textColor || theme.defaultText;
                }

                R.text(text, align === 'right' ? x + w - 8 : align === 'center' ? x + w / 2 : x + 8, y + (rh - size) / 2 - 1, {
                    size,
                    color: textColor,
                    bold: style.b,
                    italic: style.i,
                    maxWidth,
                    align
                });
                if (style.u) {
                    R.rect(x + 8, y + rh - 5, Math.min(maxWidth, R.textWidth(text, size, style.b)), 1, textColor);
                }
            }
        }

        // Borda e alça da seleção (usando border())
        const box = this.cellBox(b.c, b.r), right = this.cellBox(b.c2, b.r2);
        R.border(box.x, box.y, right.x + right.w - box.x, right.y + rh - box.y, theme.selectBorder, 2);
        R.rect(right.x + right.w - 3, right.y + rh - 3, 6, 6, theme.selectBorder);

        // Cabeçalhos superiores e laterais
        R.rect(0, 0, W, hh, theme.headerBg);
        R.rect(0, 0, gw, H, theme.headerBg);

        for (let c = firstC; c <= lastC; c++) {
            const x = gw + this.offsets[c] - sx, w = this.width(c);
            const active = c >= b.c && c <= b.c2;
            if (active) R.rect(x, 0, w, hh, theme.activeHeaderBg);
            R.text(columnName(c), x + w / 2, 8, {
                size: 10,
                color: active ? theme.activeHeaderText : theme.headerText,
                bold: active,
                align: 'center'
            });
            R.rect(x + w - 1, 0, 1, hh, theme.headerBorder);
        }

        for (let r = firstR; r <= lastR; r++) {
            const y = hh + r * rh - sy;
            const active = r >= b.r && r <= b.r2;
            if (active) R.rect(0, y, gw, rh, theme.activeHeaderBg);
            R.text(String(r + 1), gw / 2, y + (rh - 10) / 2, {
                size: 10,
                color: active ? theme.activeHeaderText : theme.headerText,
                align: 'center'
            });
            R.rect(0, y + rh - .7, gw, .7, theme.headerBorder);
        }

        // Canto superior esquerdo
        R.rect(0, 0, gw, hh, theme.headerCorner);
        R.text('◢', gw - 16, 9, { size: 11, color: theme.headerText });
        R.rect(gw - 1, 0, 1, H, theme.headerBorder);
        R.rect(0, hh - 1, W, 1, theme.headerBorder);

        R.end();
    }

    ensureVisible() {
        const sx = this.scroll.scrollLeft, sy = this.scroll.scrollTop;
        const W = this.scroll.clientWidth, H = this.scroll.clientHeight;
        const left = this.offsets[this.selection.c], right = this.offsets[this.selection.c + 1];
        const top = this.selection.r * this.rowHeight, bottom = top + this.rowHeight;

        if (left < sx) this.scroll.scrollLeft = left;
        else if (right > sx + W - this.gutter) this.scroll.scrollLeft = right - W + this.gutter + 20;

        if (top < sy) this.scroll.scrollTop = top;
        else if (bottom > sy + H - this.header) this.scroll.scrollTop = bottom - H + this.header + 20;
    }

    updateSelection() {
        const key = address(this.selection.c, this.selection.r);
        const cell = this.sheet.cells[key];
        const val = cell?.v ?? '';
        this.nameBox.value = this.selection.c === this.selection.c2 && this.selection.r === this.selection.r2
            ? key
            : `${address(this.bounds().c, this.bounds().r)}:${address(this.bounds().c2, this.bounds().r2)}`;
        this.formulaInput.value = val;
        this.app.setStatus(`
            <span>Célula <strong>${key}</strong></span>
            <span>Aba: <strong>${escapeHTML(this.sheet.name)}</strong></span>
            <span>${this.selection.c === this.selection.c2 && this.selection.r === this.selection.r2 ? '1 célula selecionada' : `${this.bounds().c2 - this.bounds().c + 1} col × ${this.bounds().r2 - this.bounds().r + 1} lin`}</span>
        `);
    }

    beginEdit(initialText = null) {
        if (this.editing) return;
        this.editing = true;
        const key = address(this.selection.c, this.selection.r);
        const current = initialText !== null ? initialText : this.sheet.cells[key]?.v ?? '';
        const box = this.cellBox(this.selection.c, this.selection.r);

        const editor = document.createElement('textarea');
        editor.className = 'cell-editor';
        editor.value = current;
        Object.assign(editor.style, {
            left: `${box.x}px`,
            top: `${box.y}px`,
            width: `${Math.max(box.w, 90)}px`,
            height: `${this.rowHeight}px`
        });

        this.viewport.append(editor);
        this.editorNode = editor;
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);

        editor.addEventListener('input', () => {
            this.formulaInput.value = editor.value;
        });

        editor.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.commitEdit();
                this.moveSelection(0, 1);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.commitEdit();
                this.moveSelection(e.shiftKey ? -1 : 1, 0);
            } else if (e.key === 'Escape') {
                this.cancelEdit();
            }
        });

        editor.addEventListener('blur', () => this.commitEdit());
        this.schedule();
    }

    commitEdit() {
        if (!this.editing) return;
        const val = this.editorNode.value;
        this.editing = false;
        this.editorNode.remove();
        this.editorNode = null;
        this.setCell(this.selection.c, this.selection.r, val);
        this.viewport.focus();
        this.schedule();
    }

    cancelEdit() {
        if (!this.editing) return;
        this.editing = false;
        this.editorNode?.remove();
        this.editorNode = null;
        this.updateSelection();
        this.viewport.focus();
        this.schedule();
    }

    setCell(c, r, rawValue) {
        const key = address(c, r);
        this.app.store.transact(`Editar ${key}`, s => {
            const sheet = s.workbook.sheets.find(x => x.id === this.sheet.id);
            if (!sheet.cells[key]) sheet.cells[key] = { v: '' };
            sheet.cells[key].v = rawValue;
        }, 'grid-typing');
        this.updateSelection();
    }

    moveSelection(dc, dr, extend = false) {
        const s = this.selection;
        const c = clamp(extend ? s.c2 + dc : s.c + dc, 0, this.sheet.cols - 1);
        const r = clamp(extend ? s.r2 + dr : s.r + dr, 0, this.sheet.rows - 1);
        if (extend) {
            s.c2 = c;
            s.r2 = r;
        } else {
            this.selection = { c, r, c2: c, r2: r };
        }
        this.ensureVisible();
        this.updateSelection();
        this.schedule();
    }

    keydown(e) {
        if (this.editing) return;
        const mod = e.ctrlKey || e.metaKey;
        if (e.key === 'ArrowUp') { e.preventDefault(); this.moveSelection(0, -1, e.shiftKey); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); this.moveSelection(0, 1, e.shiftKey); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.moveSelection(-1, 0, e.shiftKey); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.moveSelection(1, 0, e.shiftKey); }
        else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); this.beginEdit(); }
        else if (e.key === 'Tab') { e.preventDefault(); this.moveSelection(e.shiftKey ? -1 : 1, 0); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.clear(); }
        else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.fillDown(); }
        else if (mod && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            const u = this.usedBounds();
            this.selection = { c: 0, r: 0, c2: u.c2, r2: u.r2 };
            this.updateSelection();
            this.schedule();
        } else if (e.key.length === 1 && !mod && !e.altKey) {
            this.beginEdit(e.key);
        }
    }

    selectionTSV() {
        const b = this.bounds(), rows = [];
        for (let r = b.r; r <= b.r2; r++) {
            const row = [];
            for (let c = b.c; c <= b.c2; c++) {
                row.push(this.display(this.engine.get(this.sheet.id, address(c, r)), this.sheet.cells[address(c, r)]?.s));
            }
            rows.push(row.join('\t'));
        }
        return rows.join('\r\n');
    }

    async clipboardCopy(e, cut = false) {
        e.preventDefault();
        const tsv = this.selectionTSV();
        await navigator.clipboard.writeText(tsv);
        if (cut) this.clear();
        this.app.notify(cut ? 'Células recortadas.' : 'Células copiadas para a área de transferência.');
    }

    pasteText(text) {
        const rows = parseDelimited(text, text.includes('\t') ? '\t' : ',');
        const s = this.selection;
        this.app.store.transact('Colar células', state => {
            const sheet = state.workbook.sheets.find(x => x.id === this.sheet.id);
            rows.forEach((row, ri) => {
                row.forEach((val, ci) => {
                    const c = s.c + ci, r = s.r + ri;
                    if (c < sheet.cols && r < sheet.rows) {
                        const key = address(c, r);
                        if (!sheet.cells[key]) sheet.cells[key] = { v: '' };
                        sheet.cells[key].v = val;
                    }
                });
            });
        });
        this.updateSelection();
        this.schedule();
    }

    clear() {
        const b = this.bounds();
        this.app.store.transact('Limpar conteúdo', state => {
            const sheet = state.workbook.sheets.find(x => x.id === this.sheet.id);
            for (let r = b.r; r <= b.r2; r++) {
                for (let c = b.c; c <= b.c2; c++) {
                    delete sheet.cells[address(c, r)];
                }
            }
        });
        this.updateSelection();
        this.schedule();
    }

    clearSheet() {
        this.app.modal('Limpar Planilha', `
            <p>Deseja realmente <strong>limpar todos os dados e fórmulas</strong> da aba <strong>${escapeHTML(this.sheet.name)}</strong>?</p>
            <p style="color:var(--muted);font-size:12px">Todas as células serão esvaziadas. Você poderá usar <strong>Desfazer (Ctrl+Z)</strong> para restaurar.</p>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
                <button class="btn outlined" data-close>Cancelar</button>
                <button class="btn" id="btn-confirm-clear-sheet" style="background:var(--danger,#c92a2a);color:#fff">${icon('clear')} Limpar Planilha</button>
            </div>
        `, modal => {
            modal.querySelector('#btn-confirm-clear-sheet').onclick = () => {
                this.app.closeModal();
                this.app.store.transact('Limpar planilha inteira', state => {
                    const sheet = state.workbook.sheets.find(x => x.id === this.sheet.id);
                    if (sheet) sheet.cells = {};
                });
                this.selection = { c: 0, r: 0, c2: 0, r2: 0 };
                this.updateSelection();
                this.schedule();
                this.app.notify(`Planilha "${this.sheet.name}" limpa com sucesso.`);
            };
        });
    }

    format(style) {
        const b = this.bounds();
        this.app.store.transact('Formatar células', state => {
            const sheet = state.workbook.sheets.find(x => x.id === this.sheet.id);
            for (let r = b.r; r <= b.r2; r++) {
                for (let c = b.c; c <= b.c2; c++) {
                    const key = address(c, r);
                    if (!sheet.cells[key]) sheet.cells[key] = { v: '' };
                    sheet.cells[key].s = { ...(sheet.cells[key].s || {}), ...style };
                }
            }
        });
        this.schedule();
    }

    fillFrom(sourceB) {
        const b = this.bounds(), original = clone(this.sheet.cells);
        this.app.store.transact('Preencher fórmula', state => {
            const sheet = state.workbook.sheets.find(x => x.id === this.sheet.id);
            for (let r = b.r; r <= b.r2; r++) {
                for (let c = b.c; c <= b.c2; c++) {
                    if (c >= sourceB.c && c <= sourceB.c2 && r >= sourceB.r && r <= sourceB.r2) continue;
                    const mod = (v, n) => (v % n + n) % n;
                    const sc = sourceB.c + mod(c - sourceB.c, sourceB.c2 - sourceB.c + 1);
                    const sr = sourceB.r + mod(r - sourceB.r, sourceB.r2 - sourceB.r + 1);
                    const ref = address(c, r);
                    const cell = clone(original[address(sc, sr)] || { v: '' });
                    cell.v = shiftFormula(cell.v, c - sc, r - sr);
                    sheet.cells[ref] = cell;
                }
            }
        });
        this.updateSelection();
    }

    fillDown() {
        const b = this.bounds();
        if (b.r === b.r2) {
            this.app.notify('Selecione um intervalo com pelo menos duas linhas para preencher para baixo.');
            return;
        }
        this.fillFrom({ c: b.c, r: b.r, c2: b.c2, r2: b.r });
    }

    usedBounds() {
        let c2 = 0, r2 = 0;
        for (const [ref, cell] of Object.entries(this.sheet.cells)) {
            if (!cell.v) continue;
            try {
                const p = parseAddress(ref);
                c2 = Math.max(c2, p.c);
                r2 = Math.max(r2, p.r);
            } catch { }
        }
        return { c: 0, r: 0, c2, r2 };
    }

    autoSum() {
        const s = this.selection;
        let start = s.r - 1;
        while (start >= 0 && this.sheet.cells[address(s.c, start)]?.v !== '' && this.sheet.cells[address(s.c, start)]?.v !== undefined) {
            start--;
        }
        if (start === s.r - 1) {
            this.app.notify('Selecione uma célula vazia abaixo de uma coluna de valores.');
            return;
        }
        this.setCell(s.c, s.r, `=SUM(${address(s.c, start + 1)}:${address(s.c, s.r - 1)})`);
    }

    sort(desc = false) {
        const b = this.bounds();
        if (b.r2 === b.r) {
            this.app.notify('Selecione um intervalo de dados com duas ou mais linhas para ordenar.');
            return;
        }
        const c = this.selection.c, id = this.sheet.id, rows = [];
        for (let r = b.r; r <= b.r2; r++) {
            const cells = [];
            for (let col = b.c; col <= b.c2; col++) cells.push(clone(this.sheet.cells[address(col, r)] || { v: '' }));
            rows.push({ r, value: this.engine.get(id, address(c, r)), cells });
        }
        rows.sort((a, b) => {
            const d = typeof a.value === 'number' && typeof b.value === 'number'
                ? a.value - b.value
                : String(a.value).localeCompare(String(b.value));
            return desc ? -d : d;
        });
        this.app.store.transact('Ordenar intervalo', state => {
            const sheet = state.workbook.sheets.find(s => s.id === id);
            rows.forEach((row, i) => row.cells.forEach((cell, j) => {
                cell.v = shiftFormula(cell.v, 0, b.r + i - row.r);
                sheet.cells[address(b.c + j, b.r + i)] = cell;
            }));
        });
        this.updateSelection();
    }

    switchSheet(id) {
        if (!id) return;
        this.commitEdit();
        if (this.book.activeSheet === id) {
            this.schedule();
            return;
        }
        this.app.store.transact('Alternar aba', s => {
            s.workbook.activeSheet = id;
        }, 'switch-sheet');
        this.selection = { c: 0, r: 0, c2: 0, r2: 0 };
        if (this.scroll) {
            this.scroll.scrollLeft = 0;
            this.scroll.scrollTop = 0;
        }
        this.tabs();
        this.updateDimensions();
        this.updateSelection();
        this.schedule();
        this.app.persist();
    }

    newSheet() {
        const id = uid(), name = `Planilha ${this.book.sheets.length + 1}`;
        this.app.store.transact('Adicionar aba', s => {
            s.workbook.sheets.push({ id, name, rows: 10000, cols: 64, widths: {}, cells: {} });
            s.workbook.activeSheet = id;
        });
        this.selection = { c: 0, r: 0, c2: 0, r2: 0 };
        if (this.scroll) {
            this.scroll.scrollTop = this.scroll.scrollLeft = 0;
        }
        this.tabs();
        this.updateDimensions();
        this.updateSelection();
        this.schedule();
        this.app.persist();
        this.app.notify(`Nova aba "${name}" criada.`);
    }

    duplicateSheet(id = this.sheet.id) {
        const source = this.book.sheets.find(s => s.id === id);
        if (!source) return;
        const newId = uid();
        let baseName = source.name.replace(/\s*\(cópia\s*\d*\)$/i, '');
        let newName = `${baseName} (cópia)`;
        let counter = 1;
        while (this.book.sheets.some(s => s.name.toLowerCase() === newName.toLowerCase())) {
            counter++;
            newName = `${baseName} (cópia ${counter})`;
        }
        const newSheet = {
            id: newId,
            name: newName,
            rows: source.rows,
            cols: source.cols,
            widths: clone(source.widths || {}),
            cells: clone(source.cells || {})
        };
        this.app.store.transact('Duplicar aba', s => {
            const idx = s.workbook.sheets.findIndex(sh => sh.id === id);
            if (idx >= 0) {
                s.workbook.sheets.splice(idx + 1, 0, newSheet);
            } else {
                s.workbook.sheets.push(newSheet);
            }
            s.workbook.activeSheet = newId;
        });
        this.selection = { c: 0, r: 0, c2: 0, r2: 0 };
        if (this.scroll) {
            this.scroll.scrollTop = this.scroll.scrollLeft = 0;
        }
        this.tabs();
        this.updateDimensions();
        this.updateSelection();
        this.schedule();
        this.app.persist();
        this.app.notify(`Aba duplicada como "${newName}".`);
    }

    deleteSheet(id = this.sheet.id) {
        if (this.book.sheets.length <= 1) {
            this.app.notify('A planilha precisa ter pelo menos uma aba ativa.', true);
            return;
        }
        const sheet = this.book.sheets.find(s => s.id === id);
        if (!sheet) return;
        const targetName = sheet.name;
        this.app.modal('Excluir Aba', `
            <p style="margin:0 0 16px;line-height:1.6">Tem certeza de que deseja excluir a aba <strong>"${escapeHTML(targetName)}"</strong>? Todos os dados contidos nela serão removidos.</p>
            <div class="modal-footer">
                <button class="btn" data-close>Cancelar</button>
                <button id="confirm-delete-sheet" class="btn" style="background:var(--danger,#d32f2f);color:#fff">Excluir Aba</button>
            </div>
        `, modal => {
            modal.querySelector('#confirm-delete-sheet').onclick = () => {
                this.app.store.transact('Excluir aba', s => {
                    const idx = s.workbook.sheets.findIndex(sh => sh.id === id);
                    s.workbook.sheets = s.workbook.sheets.filter(sh => sh.id !== id);
                    if (s.workbook.activeSheet === id) {
                        const nextIdx = Math.max(0, idx - 1);
                        s.workbook.activeSheet = s.workbook.sheets[nextIdx].id;
                    }
                });
                this.selection = { c: 0, r: 0, c2: 0, r2: 0 };
                if (this.scroll) {
                    this.scroll.scrollLeft = 0;
                    this.scroll.scrollTop = 0;
                }
                this.app.closeModal();
                this.tabs();
                this.updateDimensions();
                this.updateSelection();
                this.schedule();
                this.app.persist();
                this.app.notify(`Aba "${targetName}" excluída.`);
            };
        });
    }

    tabs() {
        const bottom = this.root.querySelector('.sheet-bottom');
        if (!bottom) return;
        bottom.innerHTML = `
            <button class="icon-btn" data-action="sheetNew" aria-label="Nova aba" title="Criar nova aba (${this.book.sheets.length} existentes)">${icon('plus')}</button>
            <div class="sheet-tabs-container" style="display:inline-flex;align-items:center;gap:3px;overflow-x:auto;max-width:calc(100% - 280px)">
                ${this.book.sheets.map(s => `
                    <button type="button" class="sheet-tab ${s.id === this.sheet.id ? 'active' : ''}" data-sheet="${s.id}" title="Clique para abrir '${escapeHTML(s.name)}'. Clique com o botão direito para opções.">
                        ${escapeHTML(s.name)}
                    </button>
                `).join('')}
            </div>
            <span class="sheet-summary">${this.sheet.rows.toLocaleString('pt-BR')} linhas · Aba ativa: <strong>${escapeHTML(this.sheet.name)}</strong></span>`;

        bottom.querySelectorAll('[data-sheet]').forEach(b => {
            b.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetSheetId = b.dataset.sheet;
                this.switchSheet(targetSheetId);
            };
            b.ondblclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.renameSheet(b.dataset.sheet);
            };
            b.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.sheetContextMenu(b.dataset.sheet);
            };
        });
    }

    sheetContextMenu(id = this.sheet.id) {
        const sheet = this.book.sheets.find(s => s.id === id);
        if (!sheet) return;
        this.app.modal(`Opções da Aba: ${escapeHTML(sheet.name)}`, `
            <div class="export-grid" style="grid-template-columns: 1fr;gap:10px">
                <button class="export-card" id="ctx-open" style="text-align:left;display:flex;align-items:center;gap:12px">
                    <span style="font-size:20px">${icon('table')}</span>
                    <div>
                        <strong style="display:block">Abrir Esta Aba</strong>
                        <small>Visualizar e editar a folha ${escapeHTML(sheet.name)}</small>
                    </div>
                </button>
                <button class="export-card" id="ctx-rename" style="text-align:left;display:flex;align-items:center;gap:12px">
                    <span style="font-size:20px">${icon('text')}</span>
                    <div>
                        <strong style="display:block">Renomear Aba</strong>
                        <small>Alterar o nome identificador desta folha</small>
                    </div>
                </button>
                <button class="export-card" id="ctx-dup" style="text-align:left;display:flex;align-items:center;gap:12px">
                    <span style="font-size:20px">${icon('copy')}</span>
                    <div>
                        <strong style="display:block">Duplicar Aba</strong>
                        <small>Criar uma cópia com todas as notas e fórmulas</small>
                    </div>
                </button>
                ${this.book.sheets.length > 1 ? `
                <button class="export-card" id="ctx-del" style="text-align:left;display:flex;align-items:center;gap:12px;border-color:rgba(220,53,69,0.3)">
                    <span style="font-size:20px;color:var(--danger,#d32f2f)">${icon('trash')}</span>
                    <div>
                        <strong style="display:block;color:var(--danger,#d32f2f)">Excluir Aba</strong>
                        <small>Remover permanentemente esta aba da planilha</small>
                    </div>
                </button>` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn" data-close>Fechar</button>
            </div>
        `, modal => {
            modal.querySelector('#ctx-open')?.addEventListener('click', () => {
                this.app.closeModal();
                this.switchSheet(id);
            });
            modal.querySelector('#ctx-rename')?.addEventListener('click', () => {
                this.app.closeModal();
                this.renameSheet(id);
            });
            modal.querySelector('#ctx-dup')?.addEventListener('click', () => {
                this.app.closeModal();
                this.duplicateSheet(id);
            });
            modal.querySelector('#ctx-del')?.addEventListener('click', () => {
                this.app.closeModal();
                this.deleteSheet(id);
            });
        });
    }

    renameSheet(id = this.sheet.id) {
        const sheet = this.book.sheets.find(s => s.id === id);
        this.app.modal('Renomear Aba da Planilha', `
            <label class="field">Nome da aba
                <input id="sheet-name" maxlength="31" value="${escapeHTML(sheet.name)}">
            </label>
            <div class="modal-footer">
                <button class="btn" data-close>Cancelar</button>
                <button id="rename-sheet" class="btn primary">Salvar Nome</button>
            </div>
        `, modal => {
            modal.querySelector('#rename-sheet').onclick = () => {
                const name = modal.querySelector('#sheet-name').value.trim();
                if (!name || /[\[\]*?/\\:!']/.test(name) || this.book.sheets.some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
                    this.app.notify('Insira um nome único sem pontuação especial.', true);
                    return;
                }
                const old = sheet.name;
                this.app.store.transact('Renomear aba', s => {
                    s.workbook.sheets.find(x => x.id === id).name = name;
                    for (const sh of s.workbook.sheets) {
                        for (const cell of Object.values(sh.cells)) {
                            if (cell.v?.startsWith('=')) {
                                cell.v = cell.v.replace(new RegExp(`(?:'${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'|\\b${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})!`, 'gi'), `'${name}'!`);
                            }
                        }
                    }
                });
                this.app.closeModal();
                this.tabs();
                this.updateSelection();
                this.schedule();
                this.app.persist();
                this.app.notify(`Aba renomeada para "${name}".`);
            };
        });
    }

    command(name, value) {
        const cell = this.sheet.cells[address(this.selection.c, this.selection.r)] || {};
        switch (name) {
            case 'bold':
                this.format({ b: !cell.s?.b });
                break;
            case 'italic':
                this.format({ i: !cell.s?.i });
                break;
            case 'underline':
                this.format({ u: !cell.s?.u });
                break;
            case 'color':
                this.format({ color: value });
                break;
            case 'fill':
                this.format({ fill: value });
                break;
            case 'size':
                this.format({ size: clamp(Number(value), 8, 72) });
                break;
            case 'alignLeft':
            case 'alignCenter':
            case 'alignRight':
                this.format({ align: name.replace('align', '').toLowerCase() });
                break;
            case 'numberFormat':
                this.format({ fmt: value });
                break;
            case 'currency':
                this.format({ fmt: 'currency' });
                break;
            case 'percent':
                this.format({ fmt: 'percent' });
                break;
            case 'clear':
            case 'clearSelection':
                this.clear();
                this.app.notify('Células selecionadas apagadas.');
                break;
            case 'clearSheet':
                this.clearSheet();
                break;
            case 'copy':
                this.copy();
                break;
            case 'cut':
                this.copy(true);
                break;
            case 'paste':
                this.paste();
                break;
            case 'selectAll':
                const u = this.usedBounds();
                this.selection = { c: 0, r: 0, c2: u.c2, r2: u.r2 };
                this.updateSelection();
                this.schedule();
                this.app.notify('Intervalo da planilha selecionado.');
                break;
            case 'sum':
                this.autoSum();
                break;
            case 'fillDown':
                this.fillDown();
                break;
            case 'sort':
                this.sort();
                break;
            case 'sortDesc':
                this.sort(true);
                break;
            case 'sheetNew':
                this.newSheet();
                break;
            case 'sheetRename':
                this.renameSheet();
                break;
            case 'sheetDuplicate':
                this.duplicateSheet();
                break;
            case 'sheetDelete':
                this.deleteSheet();
                break;
            case 'chart':
                this.chart();
                break;
            case 'find':
                this.nameBox.focus();
                this.nameBox.select();
                break;
        }
    }

    chart() {
        let b = this.bounds();
        if (b.r === b.r2 && b.c === b.c2) {
            b = { c: 0, r: 4, c2: 1, r2: 11 };
        }
        const points = [];
        for (let r = b.r; r <= Math.min(b.r2, b.r + 25); r++) {
            const label = String(this.engine.get(this.sheet.id, address(b.c, r)));
            const value = this.engine.get(this.sheet.id, address(Math.min(b.c + 1, b.c2), r));
            if (typeof value === 'number') points.push({ label, value });
        }
        if (!points.length) {
            this.app.notify('Selecione uma coluna de nomes e uma coluna de números para gerar o gráfico.', true);
            return;
        }

        let renderer, resize;
        const isDark = document.documentElement.dataset.theme === 'dark';
        this.app.modal('Gráfico de Colunas dos Dados', `
            <p>Dados da aba <strong>${escapeHTML(this.sheet.name)}!${address(b.c, b.r)}:${address(b.c2, b.r2)}</strong> · ${points.length} categorias</p>
            <div class="chart-holder"><canvas></canvas></div>
            <div class="modal-footer">
                <button class="btn" data-close>Fechar</button>
                <button class="btn primary" id="save-chart">${icon('download')} Exportar Imagem SVG</button>
            </div>
        `, modal => {
            const holder = modal.querySelector('.chart-holder');
            renderer = new Renderer(holder.querySelector('canvas'));
            const max = Math.max(...points.map(p => Math.abs(p.value)), 1);

            const draw = () => {
                if (!holder.isConnected) return;
                const w = holder.clientWidth, h = holder.clientHeight;
                renderer.begin(w, h, isDark ? '#26201b' : '#fdfbf7');
                for (let i = 0; i < 5; i++) {
                    const y = 35 + i * (h - 105) / 4;
                    renderer.rect(62, y, w - 90, .7, isDark ? '#3d342b' : '#e4dacf');
                    renderer.text(new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(max * (4 - i) / 4), 53, y - 6, {
                        size: 10,
                        color: isDark ? '#a69888' : '#706253',
                        align: 'right'
                    });
                }
                const bw = (w - 100) / points.length;
                points.forEach((p, i) => {
                    const bh = Math.abs(p.value) / max * (h - 105);
                    const x = 75 + i * bw;
                    renderer.rect(x, h - 70 - bh, bw * .65, bh, i % 2 ? (isDark ? '#e27a55' : '#8c3b1d') : (isDark ? '#56ab7f' : '#2d6a4f'), 4);
                    renderer.text(p.label, x + bw * .32, h - 50, {
                        size: 10,
                        color: isDark ? '#f2e9dc' : '#4a3421',
                        maxWidth: bw - 5,
                        align: 'center'
                    });
                });
                renderer.end();
            };

            renderer.onReady = draw;
            resize = new ResizeObserver(draw);
            resize.observe(holder);
            draw();

            modal.querySelector('#save-chart').onclick = () => {
                const w = 800, h = 450, bw = 650 / points.length;
                const bg = isDark ? '#1c1815' : '#fdfbf7';
                const textColor = isDark ? '#f2e9dc' : '#4a3421';
                const svg = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
                        <rect width="800" height="450" fill="${bg}"/>
                        ${points.map((p, i) => {
                            const bh = Math.abs(p.value) / max * 320;
                            const x = 75 + i * bw;
                            const barColor = i % 2 ? (isDark ? '#e27a55' : '#8c3b1d') : (isDark ? '#56ab7f' : '#2d6a4f');
                            return `
                                <rect x="${x}" y="${360 - bh}" width="${bw * .65}" height="${bh}" rx="4" fill="${barColor}"/>
                                <text x="${x + bw * .32}" y="390" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${textColor}">${escapeHTML(p.label)}</text>
                                <text x="${x + bw * .32}" y="${350 - bh}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="${textColor}">${p.value.toLocaleString('pt-BR')}</text>
                            `;
                        }).join('')}
                    </svg>`;
                download('grafico-escola-office.svg', svg, 'image/svg+xml');
            };
        }, 'wide', () => {
            renderer?.dispose();
            resize?.disconnect();
        });
    }

    setZoom(zoom) {
        this.zoom = zoom;
        this.updateDimensions();
        this.schedule();
    }

    dispose() {
        this.cancelEdit();
        this.events.abort();
        this.unsubscribe?.();
        this.resize?.disconnect();
        cancelAnimationFrame(this.raf);
        this.renderer?.dispose();
    }
}

return {Grid};
})();
const __meridian_11 = (() => {
const { uid, escapeHTML, clamp, clone } = __meridian_1;
const { icon } = __meridian_2;
const { Renderer } = __meridian_9;
class Deck {
    constructor(app) {
        this.app = app;
        this.selected = [];
        this.zoom = 100;
        this.events = new AbortController();
        this.raf = 0;
        this.clipboard = [];
    }

    get model() {
        return this.app.store.state.deck;
    }

    get slide() {
        return this.model.slides[clamp(this.model.activeSlide || 0, 0, this.model.slides.length - 1)];
    }

    get element() {
        return this.slide.elements.find(e => e.id === this.selected[0]);
    }

    mount(root) {
        this.root = root;
        root.innerHTML = `
            <aside class="slide-sidebar">
                <div class="panel-heading">Slides
                    <button class="icon-btn" data-action="addSlide" aria-label="Novo slide" title="Criar slide">${icon('plus')}</button>
                </div>
                <div id="slide-thumbnails"></div>
            </aside>
            <section class="slide-main">
                <div class="slide-topline">
                    ${icon('slide')} 
                    <strong>${escapeHTML(this.model.title)}</strong>
                    <span class="grow"></span>
                    <span>Widescreen · 16:9</span>
                    <button class="btn soft" data-action="present">${icon('play')} Apresentar</button>
                </div>
                <div class="slide-viewport" tabindex="0" role="application" aria-label="Editor de slides. Clique para selecionar, arraste para mover, clique duplo no texto para editar.">
                    <canvas aria-label="Slide atual da apresentação"></canvas>
                    <div id="slide-overlays"></div>
                </div>
                <div class="slide-notes">
                    <label for="speaker-notes">${icon('comment')} Notas do Apresentador / Roteiro da Aula</label>
                    <textarea id="speaker-notes" placeholder="Adicione notas, perguntas para a turma ou tópicos de fala para esta tela…"></textarea>
                </div>
            </section>
            <aside class="inspector" id="slide-inspector"></aside>`;

        this.viewport = root.querySelector('.slide-viewport');
        this.overlays = root.querySelector('#slide-overlays');
        this.renderer = new Renderer(this.viewport.querySelector('canvas'), mode => this.app.setEngine(mode));
        this.renderer.onReady = () => this.draw();
        this.resize = new ResizeObserver(() => this.schedule());
        this.resize.observe(this.viewport);

        this.viewport.addEventListener('pointerdown', e => this.pointerDown(e), { signal: this.events.signal });
        this.viewport.addEventListener('dblclick', e => {
            if (!e.target.closest('.slide-text-edit') && this.element?.type === 'text') this.editText();
        }, { signal: this.events.signal });
        this.viewport.addEventListener('keydown', e => this.keydown(e), { signal: this.events.signal });

        const notes = root.querySelector('#speaker-notes');
        notes.value = this.slide.notes || '';
        notes.addEventListener('input', () => {
            this.app.store.transact('Editar notas do apresentador', s => s.deck.slides[s.deck.activeSlide].notes = notes.value, 'speaker-notes');
        }, { signal: this.events.signal });

        this.unsubscribe = this.app.store.on('change', event => {
            if (!event.replace) {
                this.schedule();
                this.thumbnails();
                this.status();
            }
        });

        this.thumbnails();
        this.inspector();
        this.status();
        this.draw();
    }

    layout(w = this.viewport.clientWidth, h = this.viewport.clientHeight, fit = false) {
        const scale = Math.max(.08, Math.min((w - 72) / 960, (h - 64) / 540)) * (fit ? 1 : this.zoom / 100);
        return { scale, x: (w - 960 * scale) / 2, y: (h - 540 * scale) / 2 };
    }

    schedule() {
        if (this.raf) return;
        this.raf = requestAnimationFrame(() => {
            this.raf = 0;
            this.draw();
        });
    }

    renderSlide(R, slide, w, h, { fit = false, skip = [] } = {}) {
        const { scale: s, x: ox, y: oy } = this.layout(w, h, fit);
        R.begin(w, h, fit ? '#15120f' : getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#ece3d5');
        if (!fit) {
            R.rect(ox + 2, oy + 5, 960 * s, 540 * s, '#cfc4b4', 3);
        }
        R.clip = { x: ox, y: oy, w: 960 * s, h: 540 * s };
        R.rect(ox, oy, 960 * s, 540 * s, slide.background || '#ffffff');

        for (const e of slide.elements) {
            if (skip.includes(e.id)) continue;
            const x = ox + e.x * s, y = oy + e.y * s, ew = e.w * s, eh = e.h * s;
            if (e.type === 'ellipse') {
                R.ellipse(x, y, ew, eh, e.fill || '#f5ebe1');
            } else if (e.type === 'rect') {
                R.rect(x, y, ew, eh, e.fill || '#f5ebe1', (e.radius || 0) * s);
            } else if (e.type === 'image') {
                R.image(e.src, x, y, ew, eh);
            } else if (e.type === 'text') {
                const size = (e.fontSize || 24) * s, lines = R.wrapText(e.text, ew, size, e.bold);
                let ty = y;
                for (const line of lines) {
                    if (ty + size > y + eh + 2) break;
                    R.text(line, e.align === 'center' ? x + ew / 2 : e.align === 'right' ? x + ew : x, ty, {
                        size,
                        color: e.color || '#2e2820',
                        bold: e.bold,
                        maxWidth: ew,
                        align: e.align || 'left'
                    });
                    ty += size * 1.25;
                }
            }
        }
        R.end();
        return { scale: s, x: ox, y: oy };
    }

    draw() {
        if (!this.viewport?.isConnected) return;
        this.view = this.renderSlide(this.renderer, this.slide, this.viewport.clientWidth, this.viewport.clientHeight, {
            skip: this.editing ? [this.editing.id] : []
        });
        this.drawSelection();
    }

    drawSelection() {
        if (this.editing) return;
        this.overlays.innerHTML = this.selected.map(id => {
            const e = this.slide.elements.find(x => x.id === id);
            if (!e) return '';
            const v = this.view;
            return `
                <div class="slide-selection" style="left:${v.x + e.x * v.scale}px;top:${v.y + e.y * v.scale}px;width:${e.w * v.scale}px;height:${e.h * v.scale}px">
                    ${['nw', 'ne', 'sw', 'se'].map(h => `<span class="resize-handle ${h}" data-handle="${h}" data-element="${e.id}"></span>`).join('')}
                </div>`;
        }).join('');
    }

    hit(event) {
        const b = this.viewport.getBoundingClientRect();
        return {
            x: (event.clientX - b.left - this.view.x) / this.view.scale,
            y: (event.clientY - b.top - this.view.y) / this.view.scale
        };
    }

    pointerDown(event) {
        if (event.button !== 0 || event.target.closest('.slide-text-edit')) return;
        this.commitText();
        event.preventDefault();
        this.viewport.focus();
        const point = this.hit(event), handle = event.target.dataset.handle;
        let target = handle
            ? this.slide.elements.find(e => e.id === event.target.dataset.element)
            : [...this.slide.elements].reverse().find(e => point.x >= e.x && point.x <= e.x + e.w && point.y >= e.y && point.y <= e.y + e.h);

        if (!target) {
            this.selected = [];
            this.inspector();
            this.schedule();
            return;
        }

        if (event.shiftKey && !handle) {
            this.selected = this.selected.includes(target.id) ? this.selected.filter(id => id !== target.id) : [...this.selected, target.id];
        } else if (!this.selected.includes(target.id)) {
            this.selected = [target.id];
        }

        this.inspector();
        this.schedule();
        const initial = clone(this.slide.elements), start = { x: event.clientX, y: event.clientY }, scale = this.view.scale;
        let moved = false;

        const move = e => {
            const dx = (e.clientX - start.x) / scale, dy = (e.clientY - start.y) / scale;
            if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
            for (const item of this.slide.elements) {
                if (!this.selected.includes(item.id)) continue;
                const old = initial.find(x => x.id === item.id);
                if (handle) {
                    const right = old.x + old.w, bottom = old.y + old.h;
                    item.x = handle.includes('w') ? Math.min(old.x + dx, right - 20) : old.x;
                    item.y = handle.includes('n') ? Math.min(old.y + dy, bottom - 15) : old.y;
                    item.w = handle.includes('w') ? right - item.x : Math.max(20, old.w + dx);
                    item.h = handle.includes('n') ? bottom - item.y : Math.max(15, old.h + dy);
                    if (e.shiftKey) item.h = item.w * old.h / old.w;
                } else {
                    const snap = e.altKey ? 1 : 4;
                    item.x = clamp(Math.round((old.x + dx) / snap) * snap, -500, 1400);
                    item.y = clamp(Math.round((old.y + dy) / snap) * snap, -300, 900);
                }
            }
            this.schedule();
        };

        const end = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            if (moved) {
                const after = clone(this.slide.elements), id = this.slide.id;
                this.slide.elements = initial;
                this.app.store.transact(handle ? 'Redimensionar elementos' : 'Mover elementos', s => s.deck.slides.find(x => x.id === id).elements = after);
            }
            this.inspector();
            this.schedule();
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end, { once: true });
    }

    editText() {
        const e = this.element;
        if (!e || e.type !== 'text') return;
        this.editing = { id: e.id, slideId: this.slide.id };
        const v = this.view, textarea = document.createElement('textarea');
        textarea.className = 'slide-text-edit';
        textarea.setAttribute('aria-label', 'Editar texto do slide');
        textarea.value = e.text;
        Object.assign(textarea.style, {
            left: `${v.x + e.x * v.scale}px`,
            top: `${v.y + e.y * v.scale}px`,
            width: `${e.w * v.scale}px`,
            height: `${e.h * v.scale}px`,
            fontSize: `${e.fontSize * v.scale}px`,
            fontWeight: e.bold ? '700' : '400',
            color: e.color,
            textAlign: e.align || 'left'
        });
        this.overlays.replaceChildren(textarea);
        this.textarea = textarea;
        textarea.focus();
        textarea.select();

        textarea.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') {
                this.editing = null;
                textarea.remove();
                this.textarea = null;
                this.schedule();
                this.viewport.focus();
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                this.commitText();
                this.viewport.focus();
            }
        });
        textarea.addEventListener('blur', () => this.commitText());
        this.schedule();
    }

    commitText() {
        if (!this.editing) return;
        const { id, slideId } = this.editing, text = this.textarea.value;
        this.editing = null;
        this.textarea.remove();
        this.textarea = null;
        this.app.store.transact('Editar texto do slide', s => {
            const element = s.deck.slides.find(sl => sl.id === slideId)?.elements.find(e => e.id === id);
            if (element) element.text = text;
        });
        this.inspector();
        this.schedule();
    }

    update(style, label = 'Formatar elemento', merge = '') {
        const ids = [...this.selected], slideId = this.slide.id;
        this.app.store.transact(label, s => {
            const slide = s.deck.slides.find(x => x.id === slideId);
            for (const e of slide.elements) {
                if (ids.includes(e.id)) Object.assign(e, style);
            }
        }, merge);
        this.inspector();
    }

    addElement(type) {
        let element = { id: uid(), type, x: 160, y: 150, w: type === 'text' ? 550 : 230, h: type === 'text' ? 120 : 160 };
        if (type === 'text') {
            Object.assign(element, { text: 'Título ou reflexão da aula.', fontSize: 36, color: '#3b2818', bold: true, align: 'left' });
        } else {
            Object.assign(element, { fill: '#deb49a', radius: type === 'ellipse' ? 100 : 12 });
        }
        this.app.store.transact(`Adicionar ${type}`, s => s.deck.slides[s.deck.activeSlide].elements.push(element));
        this.selected = [element.id];
        this.inspector();
        this.schedule();
    }

    addImage() {
        this.app.chooseImage(src => {
            const image = new Image();
            image.onload = () => {
                const w = 400, h = Math.min(350, w * image.height / image.width);
                const element = { id: uid(), type: 'image', src, x: 280, y: 120, w, h };
                this.app.store.transact('Adicionar imagem', s => s.deck.slides[s.deck.activeSlide].elements.push(element));
                this.selected = [element.id];
                this.inspector();
                this.schedule();
            };
            image.src = src;
        });
    }

    duplicate() {
        if (!this.selected.length) {
            this.duplicateSlide();
            return;
        }
        const elements = this.slide.elements.filter(e => this.selected.includes(e.id)).map(e => ({ ...clone(e), id: uid(), x: e.x + 24, y: e.y + 24 }));
        this.app.store.transact('Duplicar elementos', s => s.deck.slides[s.deck.activeSlide].elements.push(...elements));
        this.selected = elements.map(e => e.id);
        this.inspector();
        this.schedule();
    }

    delete() {
        if (!this.selected.length) return;
        const ids = [...this.selected];
        this.app.store.transact('Excluir elementos', s => {
            const slide = s.deck.slides[s.deck.activeSlide];
            slide.elements = slide.elements.filter(e => !ids.includes(e.id));
        });
        this.selected = [];
        this.inspector();
        this.schedule();
    }

    reorder(front) {
        const ids = [...this.selected];
        this.app.store.transact('Reordenar elementos', s => {
            const slide = s.deck.slides[s.deck.activeSlide];
            const selected = slide.elements.filter(e => ids.includes(e.id));
            const rest = slide.elements.filter(e => !ids.includes(e.id));
            slide.elements = front ? [...rest, ...selected] : [...selected, ...rest];
        });
        this.inspector();
    }

    addSlide() {
        const slide = {
            id: uid(),
            background: '#f7f3eb',
            notes: '',
            elements: [
                { id: uid(), type: 'text', text: 'Novo Tópico ou Conceito', x: 64, y: 95, w: 830, h: 120, fontSize: 52, color: '#3b2818', bold: true },
                { id: uid(), type: 'text', text: 'Desenvolva aqui os argumentos e evidências da pesquisa.', x: 68, y: 240, w: 800, h: 140, fontSize: 26, color: '#594c3f', bold: false }
            ]
        };
        this.app.store.transact('Adicionar slide', s => {
            s.deck.slides.splice(s.deck.activeSlide + 1, 0, slide);
            s.deck.activeSlide++;
        });
        this.activate(this.model.activeSlide);
    }

    duplicateSlide() {
        this.app.store.transact('Duplicar slide', s => {
            const slide = clone(s.deck.slides[s.deck.activeSlide]);
            slide.id = uid();
            slide.elements.forEach(e => e.id = uid());
            s.deck.slides.splice(s.deck.activeSlide + 1, 0, slide);
            s.deck.activeSlide++;
        });
        this.activate(this.model.activeSlide);
    }

    deleteSlide(slideIndex) {
        if (this.model.slides.length <= 1) {
            this.app.notify('A apresentação precisa de ao menos um slide. Use "Limpar Slide" para esvaziar o conteúdo.', true);
            return;
        }

        const index = slideIndex !== undefined ? Number(slideIndex) : this.model.activeSlide;
        if (index < 0 || index >= this.model.slides.length) return;

        this.app.modal('Excluir Slide', `
            <p>Deseja realmente excluir o <strong>Slide ${index + 1}</strong> desta apresentação?</p>
            <p style="color:var(--muted);font-size:12px">Os elementos deste slide serão removidos. Você poderá recuperar usando <strong>Desfazer (Ctrl+Z)</strong>.</p>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
                <button class="btn outlined" data-close>Cancelar</button>
                <button class="btn" id="btn-confirm-delete-slide" style="background:var(--danger,#c92a2a);color:#fff">${icon('trash')} Excluir Slide</button>
            </div>
        `, modal => {
            modal.querySelector('#btn-confirm-delete-slide').onclick = () => {
                this.app.closeModal();
                this.app.store.transact('Excluir slide', s => {
                    s.deck.slides.splice(index, 1);
                    s.deck.activeSlide = Math.max(0, Math.min(s.deck.activeSlide, s.deck.slides.length - 1));
                });
                this.activate(this.model.activeSlide);
                this.app.notify(`Slide ${index + 1} excluído com sucesso.`);
            };
        });
    }

    clearSlide() {
        if (!this.slide?.elements?.length) {
            this.app.notify('O slide atual já está vazio.');
            return;
        }
        this.app.modal('Limpar Slide Atual', `
            <p>Deseja remover todos os elementos (textos, figuras e imagens) do <strong>Slide ${this.model.activeSlide + 1}</strong>?</p>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
                <button class="btn outlined" data-close>Cancelar</button>
                <button class="btn" id="btn-confirm-clear-slide" style="background:var(--danger,#c92a2a);color:#fff">${icon('clear')} Limpar Slide</button>
            </div>
        `, modal => {
            modal.querySelector('#btn-confirm-clear-slide').onclick = () => {
                this.app.closeModal();
                this.app.store.transact('Limpar slide atual', s => {
                    s.deck.slides[s.deck.activeSlide].elements = [];
                });
                this.selected = [];
                this.inspector();
                this.thumbnails();
                this.schedule();
                this.app.notify(`Slide ${this.model.activeSlide + 1} limpo.`);
            };
        });
    }

    clearAllDeck() {
        this.app.modal('Limpar Toda a Apresentação', `
            <p>Deseja realmente <strong>limpar todos os slides</strong> e recomeçar com uma apresentação em branco?</p>
            <p style="color:var(--muted);font-size:12px">Todos os slides atuais serão removidos (você poderá usar <strong>Desfazer (Ctrl+Z)</strong> se mudar de ideia).</p>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
                <button class="btn outlined" data-close>Cancelar</button>
                <button class="btn" id="btn-confirm-clear-deck" style="background:var(--danger,#c92a2a);color:#fff">${icon('clear')} Limpar Apresentação</button>
            </div>
        `, modal => {
            modal.querySelector('#btn-confirm-clear-deck').onclick = () => {
                this.app.closeModal();
                const newSlide = { id: uid(), background: '#f7f3eb', notes: '', elements: [] };
                this.app.store.transact('Limpar toda a apresentação', s => {
                    s.deck.slides = [newSlide];
                    s.deck.activeSlide = 0;
                });
                this.activate(0);
                this.app.notify('Apresentação limpa com 1 slide em branco.');
            };
        });
    }

    activate(index) {
        this.commitText();
        this.model.activeSlide = clamp(index, 0, this.model.slides.length - 1);
        this.selected = [];
        this.root.querySelector('#speaker-notes').value = this.slide.notes || '';
        this.thumbnails();
        this.inspector();
        this.status();
        this.schedule();
        this.app.persist();
    }

    mini(slide) {
        return `<div class="slide-mini" style="background:${slide.background}">${slide.elements.map(e => {
            const style = `left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;`;
            if (e.type === 'text') {
                return `<div class="slide-mini-item" style="${style}font-size:${e.fontSize}px;font-weight:${e.bold ? 700 : 400};color:${e.color};text-align:${e.align || 'left'}">${escapeHTML(e.text)}</div>`;
            }
            if (e.type === 'image') {
                return `<img class="slide-mini-item" src="${escapeHTML(e.src)}" style="${style}">`;
            }
            return `<div class="slide-mini-item" style="${style}background:${e.fill};border-radius:${e.type === 'ellipse' ? '50%' : `${e.radius || 0}px`}"></div>`;
        }).join('')}</div>`;
    }

    thumbnails() {
        const root = this.root?.querySelector('#slide-thumbnails');
        if (!root) return;
        root.innerHTML = this.model.slides.map((s, i) => `
            <div class="slide-thumb-row" style="position:relative">
                <span class="slide-num">${i + 1}</span>
                <button class="slide-thumb ${i === this.model.activeSlide ? 'active' : ''}" data-slide="${i}" draggable="true" aria-label="Slide ${i + 1}">
                    ${this.mini(s)}
                </button>
                ${this.model.slides.length > 1 ? `<button class="thumb-delete-btn" data-delete-slide="${i}" title="Excluir slide ${i + 1}" style="position:absolute;top:3px;right:3px;background:rgba(180,30,30,0.85);color:#fff;border:none;border-radius:3px;padding:2px 4px;cursor:pointer;font-size:10px;display:flex;align-items:center;z-index:2">${icon('trash')}</button>` : ''}
            </div>`).join('');

        root.querySelectorAll('[data-delete-slide]').forEach(btn => {
            btn.onclick = e => {
                e.stopPropagation();
                this.deleteSlide(Number(btn.dataset.deleteSlide));
            };
        });

        root.querySelectorAll('[data-slide]').forEach(button => {
            button.onclick = () => this.activate(Number(button.dataset.slide));
            button.ondragstart = e => e.dataTransfer.setData('text/x-meridian-slide', button.dataset.slide);
            button.ondragover = e => e.preventDefault();
            button.ondrop = e => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData('text/x-meridian-slide'));
                const to = Number(button.dataset.slide);
                if (!Number.isInteger(from) || from === to) return;
                this.app.store.transact('Reordenar slides', s => {
                    const [slide] = s.deck.slides.splice(from, 1);
                    s.deck.slides.splice(to, 0, slide);
                    s.deck.activeSlide = to;
                });
                this.activate(to);
            };
        });
    }

    inspector() {
        const panel = this.root?.querySelector('#slide-inspector');
        if (!panel) return;
        const e = this.element;

        panel.innerHTML = `
            <div class="panel-heading">${e ? 'Formatar ' + (e.type === 'text' ? 'Texto' : e.type === 'rect' ? 'Retângulo' : e.type === 'ellipse' ? 'Círculo' : 'Imagem') : 'Design do Slide'} ${icon('settings')}</div>
            ${e ? `
                <div class="pill" style="display:inline-block">${this.selected.length} selecionado(s)</div>
                <h4>POSIÇÃO E TAMANHO</h4>
                <div class="field-grid">
                    ${[['x', 'X'], ['y', 'Y'], ['w', 'Largura'], ['h', 'Altura']].map(([k, label]) => `
                        <label>${label}
                            <input type="number" data-property="${k}" value="${Math.round(e[k])}">
                        </label>`).join('')}
                </div>
                <h4>${e.type === 'text' ? 'TIPOGRAFIA' : 'APARÊNCIA'}</h4>
                <div class="field-grid">
                    ${e.type === 'text' ? `
                        <label>Tamanho do texto
                            <input type="number" min="8" max="160" data-property="fontSize" value="${e.fontSize}">
                        </label>
                        <label>Cor do texto
                            <input type="color" data-property="color" value="${e.color || '#3b2818'}">
                        </label>` : `
                        <label>Preenchimento
                            <input type="color" data-property="fill" value="${e.fill || '#deb49a'}">
                        </label>
                        <label>Arredondamento
                            <input type="number" min="0" max="200" data-property="radius" value="${e.radius || 0}">
                        </label>`}
                </div>
                <h4>ORGANIZAR</h4>
                <div class="ribbon-row">
                    <button class="ribbon-small" data-action="front" title="Trazer para a frente">${icon('front')} Avançar</button>
                    <button class="ribbon-small" data-action="back" title="Enviar para trás">${icon('back')} Recuar</button>
                </div>
                <div class="ribbon-row" style="margin-top:8px">
                    <button class="ribbon-small" data-action="duplicate">${icon('copy')} Duplicar</button>
                    <button class="icon-btn" data-action="delete" aria-label="Excluir elemento">${icon('trash')}</button>
                </div>
            ` : `
                <p style="font-size:11px;color:var(--muted);line-height:1.7">Área visual para apresentações dinâmicas. Selecione qualquer elemento para formatar.</p>
                <h4>COR DE FUNDO</h4>
                <div class="swatches">
                    ${['#f7f3eb', '#ffffff', '#2e241c', '#f5ebe1', '#e8dfd1', '#deb49a'].map(c => `<button class="swatch" data-background="${c}" style="background:${c}" aria-label="Definir cor ${c}"></button>`).join('')}
                </div>
                <label style="display:flex;gap:10px;align-items:center;margin-top:16px;font-size:10px;color:var(--muted)">
                    Cor personalizada: <input id="slide-bg" type="color" value="${this.slide.background}" style="width:35px;height:28px;padding:2px">
                </label>
            `}
            <h4>CAMADAS DO SLIDE <span style="float:right">${this.slide.elements.length}</span></h4>
            <div class="slide-layers">
                ${[...this.slide.elements].reverse().map(e => `
                    <button class="slide-layer ${this.selected.includes(e.id) ? 'active' : ''}" data-layer="${e.id}">
                        ${e.type === 'text' ? 'T &nbsp; ' : e.type === 'ellipse' ? '◯ &nbsp; ' : '▢ &nbsp; '}
                        ${escapeHTML(e.text?.slice(0, 30) || (e.type === 'text' ? 'Texto' : e.type === 'rect' ? 'Retângulo' : 'Círculo'))}
                    </button>`).join('')}
            </div>`;

        panel.querySelectorAll('[data-property]').forEach(input => input.onchange = () => {
            const key = input.dataset.property;
            let value = input.type === 'color' ? input.value : Number(input.value);
            if (typeof value === 'number') {
                if (!Number.isFinite(value)) return;
                value = clamp(value, ['x', 'y'].includes(key) ? -960 : 5, key === 'fontSize' ? 160 : 1920);
            }
            this.update({ [key]: value });
        });

        const background = color => {
            this.app.store.transact('Fundo do slide', s => s.deck.slides[s.deck.activeSlide].background = color);
            this.inspector();
        };

        panel.querySelectorAll('[data-background]').forEach(b => b.onclick = () => background(b.dataset.background));
        const bg = panel.querySelector('#slide-bg');
        if (bg) bg.onchange = () => background(bg.value);

        panel.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => {
            this.selected = [b.dataset.layer];
            this.inspector();
            this.schedule();
        });
    }

    keydown(e) {
        if (e.target.closest('textarea,input') || e.isComposing) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            this.selected = this.slide.elements.map(e => e.id);
            this.inspector();
            this.schedule();
            return;
        }
        if (mod && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            this.duplicate();
            return;
        }
        if (mod && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            this.clipboard = clone(this.slide.elements.filter(x => this.selected.includes(x.id)));
            this.app.notify('Elementos copiados.');
            return;
        }
        if (mod && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            const elements = this.clipboard.map(x => ({ ...clone(x), id: uid(), x: x.x + 24, y: x.y + 24 }));
            this.app.store.transact('Colar elementos', s => s.deck.slides[s.deck.activeSlide].elements.push(...elements));
            this.selected = elements.map(e => e.id);
            this.inspector();
            this.schedule();
            return;
        }
        if (mod) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            this.delete();
        }
        if (e.key === 'Escape') {
            this.selected = [];
            this.inspector();
            this.schedule();
        }
        if (e.key === 'Enter' && this.element?.type === 'text') {
            e.preventDefault();
            this.editText();
        }
        const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (deltas[e.key]) {
            e.preventDefault();
            if (!this.selected.length) {
                this.activate(this.model.activeSlide + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1));
                return;
            }
            const [dx, dy] = deltas[e.key], n = e.shiftKey ? 10 : 1, ids = [...this.selected];
            this.app.store.transact('Mover elementos', s => {
                for (const item of s.deck.slides[s.deck.activeSlide].elements) {
                    if (ids.includes(item.id)) {
                        item.x += dx * n;
                        item.y += dy * n;
                    }
                }
            }, 'deck-nudge');
            this.inspector();
        }
    }

    command(name, value) {
        switch (name) {
            case 'addSlide':
                this.addSlide();
                break;
            case 'duplicateSlide':
                this.duplicateSlide();
                break;
            case 'deleteSlide':
                this.deleteSlide();
                break;
            case 'text':
                this.addElement('text');
                break;
            case 'rectangle':
                this.addElement('rect');
                break;
            case 'circle':
                this.addElement('ellipse');
                break;
            case 'image':
                this.addImage();
                break;
            case 'duplicate':
                this.duplicate();
                break;
            case 'delete':
            case 'clear':
                this.delete();
                break;
            case 'front':
                this.reorder(true);
                break;
            case 'back':
                this.reorder(false);
                break;
            case 'bold':
                if (this.element) this.update({ bold: !this.element.bold });
                break;
            case 'size':
                this.update({ fontSize: clamp(Number(value) || 24, 8, 160) });
                break;
            case 'color':
                this.update({ color: value });
                break;
            case 'fill':
                this.update({ fill: value });
                break;
            case 'alignLeft':
            case 'alignCenter':
            case 'alignRight':
                this.update({ align: name.replace('align', '').toLowerCase() });
                break;
            case 'present':
                this.present();
                break;
            case 'copy':
                this.clipboard = clone(this.slide.elements.filter(x => this.selected.includes(x.id)));
                this.app.notify('Elementos copiados.');
                break;
            case 'cut':
                this.clipboard = clone(this.slide.elements.filter(x => this.selected.includes(x.id)));
                this.delete();
                break;
            case 'paste': {
                const elements = this.clipboard.map(x => ({ ...clone(x), id: uid(), x: x.x + 24, y: x.y + 24 }));
                this.app.store.transact('Colar elementos', s => s.deck.slides[s.deck.activeSlide].elements.push(...elements));
                this.selected = elements.map(e => e.id);
                this.inspector();
                break;
            }
            case 'selectAll':
                this.selected = this.slide.elements.map(e => e.id);
                this.inspector();
                this.schedule();
                this.app.notify('Todos os elementos do slide selecionados.');
                break;
            case 'clearSlide':
                this.clearSlide();
                break;
            case 'clearAllDeck':
                this.clearAllDeck();
                break;
            case 'deleteElement':
                this.delete();
                break;
        }
    }

    present() {
        this.commitText();
        let index = this.model.activeSlide, disposed = false;
        const layer = document.createElement('div');
        layer.className = 'slideshow';
        layer.innerHTML = `
            <canvas></canvas>
            <div class="slideshow-controls">
                <button id="show-prev" class="icon-btn" aria-label="Slide anterior">${icon('left')}</button>
                <span id="show-count"></span>
                <button id="show-next" class="icon-btn" aria-label="Próximo slide">${icon('right')}</button>
                <button id="show-close" class="btn">${icon('close')} Concluir Apresentação (Esc)</button>
            </div>`;
        document.body.append(layer);
        const renderer = new Renderer(layer.querySelector('canvas'));

        const draw = () => {
            if (disposed) return;
            this.renderSlide(renderer, this.model.slides[index], innerWidth, innerHeight, { fit: true });
            layer.querySelector('#show-count').textContent = `${index + 1} / ${this.model.slides.length}`;
        };

        renderer.onReady = draw;
        const change = d => {
            index = clamp(index + d, 0, this.model.slides.length - 1);
            draw();
        };

        const end = () => {
            if (disposed) return;
            disposed = true;
            renderer.dispose();
            layer.remove();
            window.removeEventListener('keydown', key, true);
            window.removeEventListener('resize', draw);
            if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        };

        const key = e => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.key === 'Escape') end();
            else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown'].includes(e.key)) change(1);
            else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) change(-1);
        };

        window.addEventListener('keydown', key, true);
        window.addEventListener('resize', draw);
        layer.querySelector('#show-prev').onclick = () => change(-1);
        layer.querySelector('#show-next').onclick = () => change(1);
        layer.querySelector('#show-close').onclick = end;
        layer.querySelector('canvas').onclick = () => change(1);
        layer.requestFullscreen?.().catch(() => { });
        this.closeShow = end;
        draw();
    }

    status() {
        this.app.setStatus(`
            <span>Slide <strong>${this.model.activeSlide + 1}</strong> de ${this.model.slides.length}</span>
            <span>${this.slide.elements.length} elemento(s)</span>
            <span>Widescreen (16:9)</span>
        `);
    }

    setZoom(zoom) {
        this.zoom = zoom;
        this.schedule();
    }

    dispose() {
        this.commitText();
        this.closeShow?.();
        this.events.abort();
        this.resize?.disconnect();
        this.unsubscribe?.();
        cancelAnimationFrame(this.raf);
        this.renderer?.dispose();
    }
}

return {Deck};
})();
const __meridian_13 = (() => {
const encoder = new TextEncoder(), decoder = new TextDecoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++)
    n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(bytes) { let crc = 0xffffffff; for (const b of bytes)
    crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function createZip(files) {
    const entries = Object.entries(files), local = [], central = [];
    let offset = 0, centralSize = 0;
    if (entries.length > 65535)
        throw new Error('ZIP64 is not supported.');
    for (const [path, input] of entries) {
        const name = encoder.encode(path), bytes = typeof input === 'string' ? encoder.encode(input) : input, crc = crc32(bytes);
        const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x800, true);
        view.setUint16(12, 33, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, bytes.length, true);
        view.setUint32(22, bytes.length, true);
        view.setUint16(26, name.length, true);
        header.set(name, 30);
        local.push(header, bytes);
        const record = new Uint8Array(46 + name.length), cv = new DataView(record.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x800, true);
        cv.setUint16(14, 33, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, bytes.length, true);
        cv.setUint32(24, bytes.length, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true);
        record.set(name, 46);
        central.push(record);
        centralSize += record.length;
        offset += header.length + bytes.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const result = new Uint8Array(offset + centralSize + 22);
    let pos = 0;
    for (const part of [...local, ...central, end]) {
        result.set(part, pos);
        pos += part.length;
    }
    return result;
}
class ZipReader {
    constructor(input, { maxEntry = 32 * 1024 * 1024, maxTotal = 100 * 1024 * 1024 } = {}) {
        this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
        this.entries = new Map();
        this.cache = new Map();
        this.maxEntry = maxEntry;
        this.maxTotal = maxTotal;
        this.total = 0;
        if (this.bytes.length < 22)
            throw new Error('Invalid ZIP archive.');
        let eocd = -1;
        for (let i = this.bytes.length - 22; i >= Math.max(0, this.bytes.length - 65557); i--)
            if (this.view.getUint32(i, true) === 0x06054b50 && i + 22 + this.view.getUint16(i + 20, true) === this.bytes.length) {
                eocd = i;
                break;
            }
        if (eocd < 0)
            throw new Error('ZIP directory not found.');
        if (this.view.getUint16(eocd + 4, true) || this.view.getUint16(eocd + 6, true))
            throw new Error('Split archives are unsupported.');
        const count = this.view.getUint16(eocd + 10, true);
        let pos = this.view.getUint32(eocd + 16, true), totalExpected = 0;
        if (count > 10000)
            throw new Error('Too many archive entries.');
        for (let i = 0; i < count; i++) {
            if (pos + 46 > eocd || this.view.getUint32(pos, true) !== 0x02014b50)
                throw new Error('Invalid ZIP directory record.');
            const flags = this.view.getUint16(pos + 8, true), method = this.view.getUint16(pos + 10, true), crc = this.view.getUint32(pos + 16, true), compressed = this.view.getUint32(pos + 20, true), size = this.view.getUint32(pos + 24, true), nl = this.view.getUint16(pos + 28, true), el = this.view.getUint16(pos + 30, true), cl = this.view.getUint16(pos + 32, true), offset = this.view.getUint32(pos + 42, true);
            if (pos + 46 + nl + el + cl > eocd)
                throw new Error('Truncated ZIP directory.');
            const name = decoder.decode(this.bytes.subarray(pos + 46, pos + 46 + nl));
            if (flags & 1)
                throw new Error('Password-protected documents are unsupported.');
            if (method !== 0 && method !== 8)
                throw new Error('Unsupported ZIP compression.');
            totalExpected += size;
            if (size > maxEntry || totalExpected > maxTotal)
                throw new Error('Document exceeds decompression safety limits.');
            if (name.includes('\\') || name.split('/').includes('..') || name.startsWith('/'))
                throw new Error('Unsafe archive path.');
            if (this.entries.has(name))
                throw new Error('Duplicate archive path.');
            this.entries.set(name, { flags, method, crc, compressed, size, offset });
            pos += 46 + nl + el + cl;
        }
    }
    has(name) { return this.entries.has(name); }
    async read(name) {
        if (this.cache.has(name))
            return this.cache.get(name);
        const e = this.entries.get(name);
        if (!e)
            throw new Error(`Missing document part: ${name}`);
        const v = this.view, p = e.offset;
        if (p + 30 > this.bytes.length || v.getUint32(p, true) !== 0x04034b50)
            throw new Error('Invalid ZIP local header.');
        const start = p + 30 + v.getUint16(p + 26, true) + v.getUint16(p + 28, true);
        if (start + e.compressed > this.bytes.length)
            throw new Error('Truncated ZIP entry.');
        let data = this.bytes.slice(start, start + e.compressed);
        if (e.method === 8) {
            let stream;
            try {
                stream = new DecompressionStream('deflate-raw');
            }
            catch {
                throw new Error('This browser cannot decompress Office files. Use a current browser.');
            }
            const reader = new Blob([data]).stream().pipeThrough(stream).getReader(), chunks = [];
            let size = 0;
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done)
                        break;
                    size += value.length;
                    if (size > this.maxEntry || size > e.size) {
                        await reader.cancel();
                        throw new Error('Decompression size limit exceeded.');
                    }
                    chunks.push(value);
                }
            }
            finally {
                reader.releaseLock();
            }
            data = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                data.set(chunk, offset);
                offset += chunk.length;
            }
        }
        if (data.length !== e.size || crc32(data) !== e.crc)
            throw new Error('Corrupt document part (size or checksum mismatch).');
        this.total += data.length;
        if (this.total > this.maxTotal)
            throw new Error('Document size limit exceeded.');
        this.cache.set(name, data);
        return data;
    }
    async text(name) { return decoder.decode(await this.read(name)); }
}

return {crc32,createZip,ZipReader};
})();
const __meridian_12 = (() => {
const { uid, escapeHTML, sanitizeHTML, download } = __meridian_1;
const { createZip, ZipReader } = __meridian_13;
const { FormulaEngine, parseAddress, address, parseDelimited, serializeDelimited } = __meridian_10;
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const esc = value => escapeHTML(String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
const rels = items => `${XML}<Relationships xmlns="${REL}">${items.map(([id, type, target]) => `<Relationship Id="${esc(id)}" Type="${OFFICE}${type}" Target="${esc(target)}"/>`).join('')}</Relationships>`;
function contentTypes(overrides) { return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/>${overrides.map(([part, type]) => `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`).join('')}</Types>`; }
function imageBytes(src) { const match = /^data:image\/(png|jpeg|gif|webp);base64,(.*)$/s.exec(src || ''); if (!match)
    return null; return { extension: match[1], bytes: Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)) }; }
function parseXML(xml) { if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error('DTD and entity declarations are not supported.'); const document = new DOMParser().parseFromString(xml, 'application/xml'); if (document.querySelector('parsererror'))
    throw new Error('Malformed Office XML.'); return document; }
const descendants = (node, name) => node ? [...node.getElementsByTagNameNS('*', name)] : [];
const first = (node, name) => descendants(node, name)[0];
const attr = (node, name) => node?.getAttribute(name) ?? node?.getAttributeNS(W, name) ?? node?.getAttributeNS(OFFICE.slice(0, -1), name) ?? null;
const direct = (node, name) => [...(node?.children || [])].filter(n => n.localName === name);
const colorHex = color => /^#[0-9a-f]{6}$/i.test(color || '') ? color.slice(1).toUpperCase() : '263F33';
function resolvePart(base, target) { const result = target.startsWith('/') ? [] : base.split('/').slice(0, -1); for (const segment of target.split('/')) {
    if (!segment || segment === '.')
        continue;
    if (segment === '..') {
        if (!result.length)
            throw new Error('Invalid part relationship.');
        result.pop();
    }
    else
        result.push(segment);
} return result.join('/'); }
function exportDOCX(writer) {
    const files = {}, relationships = [['rIdStyles', 'styles', 'styles.xml'], ['rIdNumbering', 'numbering', 'numbering.xml']], body = [];
    let imageId = 0;
    const runs = (node, style = {}) => {
        if (node.nodeType === 3)
            return `<w:r>${runProps(style)}<w:t xml:space="preserve">${esc(node.textContent.replace(/\u200b/g, ''))}</w:t></w:r>`;
        if (node.nodeType !== 1)
            return '';
        const tag = node.tagName, css = node.style;
        const next = { ...style };
        if (['B', 'STRONG'].includes(tag))
            next.bold = true;
        if (['I', 'EM'].includes(tag))
            next.italic = true;
        if (tag === 'U')
            next.underline = true;
        if (tag === 'S')
            next.strike = true;
        if (css.fontWeight)
            next.bold = css.fontWeight === 'bold' || Number(css.fontWeight) >= 600;
        if (css.fontStyle)
            next.italic = css.fontStyle === 'italic';
        if (css.fontSize)
            next.size = parseFloat(css.fontSize);
        if (css.fontFamily)
            next.font = css.fontFamily.split(',')[0].replace(/["']/g, '');
        if (css.color) {
            const rgb = css.color.match(/\d+/g);
            next.color = css.color.startsWith('#') ? css.color.slice(1) : rgb ? rgb.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('') : null;
        }
        if (css.textDecoration.includes('underline'))
            next.underline = true;
        if (tag === 'BR')
            return '<w:r><w:br/></w:r>';
        if (tag === 'IMG') {
            const image = imageBytes(node.src);
            if (!image)
                return '';
            const id = ++imageId, path = `media/image${id}.${image.extension}`, rid = `rIdImage${id}`;
            files[`word/${path}`] = image.bytes;
            relationships.push([rid, 'image', path]);
            const cx = 470 * 9525, cy = 280 * 9525;
            return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic xmlns:a="${A}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
        }
        return [...node.childNodes].map(n => runs(n, next)).join('');
    };
    const runProps = style => { const p = `${style.bold ? '<w:b/>' : ''}${style.italic ? '<w:i/>' : ''}${style.underline ? '<w:u w:val="single"/>' : ''}${style.strike ? '<w:strike/>' : ''}${style.color ? `<w:color w:val="${esc(style.color)}"/>` : ''}${style.size ? `<w:sz w:val="${Math.round(style.size * 1.5)}"/>` : ''}${style.font ? `<w:rFonts w:ascii="${esc(style.font)}" w:hAnsi="${esc(style.font)}"/>` : ''}`; return p ? `<w:rPr>${p}</w:rPr>` : ''; };
    const paragraph = (node, numbering = '') => { const heading = /^H[1-4]$/.test(node.tagName) ? Number(node.tagName[1]) : 0; const align = node.style?.textAlign; return `<w:p><w:pPr>${heading ? `<w:pStyle w:val="Heading${heading}"/>` : ''}${align ? `<w:jc w:val="${align === 'justify' ? 'both' : align}"/>` : ''}${numbering ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numbering}"/></w:numPr>` : ''}<w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr>${runs(node, heading === 1 ? { font: 'Georgia', size: 46 } : heading ? { bold: true, size: 20 } : { size: 13 })}</w:p>`; };
    const blocks = node => [...node.childNodes].map(child => { if (child.nodeType === 3)
        return child.textContent.trim() ? `<w:p>${runs(child)}</w:p>` : ''; if (child.nodeType !== 1)
        return ''; if (child.tagName === 'TABLE') {
        const rows = [...child.querySelectorAll('tr')];
        const cols = Math.max(...rows.map(r => r.children.length), 1);
        return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(x => `<w:${x} w:val="single" w:sz="4" w:color="DDE7D8"/>`).join('')}</w:tblBorders></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join('')}</w:tblGrid>${rows.map(row => `<w:tr>${[...row.children].map(td => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000 / cols)}" w:type="dxa"/>${td.tagName === 'TH' ? '<w:shd w:fill="EDF3E8"/>' : ''}</w:tcPr>${paragraph(td)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
    } if (child.tagName === 'UL' || child.tagName === 'OL')
        return [...child.children].map(li => paragraph(li, child.tagName === 'UL' ? '1' : '2')).join(''); if (child.tagName === 'HR')
        return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:color="DCE5D9"/></w:pBdr></w:pPr></w:p>'; return paragraph(child); }).join('');
    writer.pages.forEach((page, index) => { const dom = new DOMParser().parseFromString(page.html, 'text/html'); if (index)
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); body.push(blocks(dom.body)); });
    const marginMap = {
        narrow: { top: 567, right: 567, bottom: 567, left: 567 },
        moderate: { top: 850, right: 850, bottom: 850, left: 850 },
        normal: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        wide: { top: 1417, right: 1417, bottom: 1417, left: 1417 }
    };
    const m = marginMap[writer?.margins] || marginMap.normal;
    const colsTag = writer?.columns === 2 ? '<w:cols w:num="2" w:space="720"/>' : '';
    const isLandscape = writer?.orientation === 'landscape';
    const pgSzTag = isLandscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
    files['word/document.xml'] = `${XML}<w:document xmlns:w="${W}" xmlns:r="${OFFICE.slice(0, -1)}"><w:body>${body.join('')}<w:sectPr>${pgSzTag}<w:pgMar w:top="${m.top}" w:right="${m.right}" w:bottom="${m.bottom}" w:left="${m.left}" w:header="500" w:footer="500"/>${colsTag}</w:sectPr></w:body></w:document>`;
    files['word/styles.xml'] = `${XML}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:color w:val="3E5047"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[1, 2, 3, 4].map(i => `<w:style w:type="paragraph" w:styleId="Heading${i}"><w:name w:val="heading ${i}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="140"/><w:outlineLvl w:val="${i - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${i === 1 ? 64 : 36}"/><w:color w:val="176858"/></w:rPr></w:style>`).join('')}</w:styles>`;
    files['word/numbering.xml'] = `${XML}<w:numbering xmlns:w="${W}">${[1, 2].map(id => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${id === 1 ? 'bullet' : 'decimal'}"/><w:lvlText w:val="${id === 1 ? '•' : '%1.'}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="270"/></w:pPr></w:lvl></w:abstractNum>`).join('')}<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
    files['word/_rels/document.xml.rels'] = rels(relationships);
    files['_rels/.rels'] = rels([['rId1', 'officeDocument', 'word/document.xml']]);
    files['[Content_Types].xml'] = contentTypes([['word/document.xml', 'wordprocessingml.document.main'], ['word/styles.xml', 'wordprocessingml.styles'], ['word/numbering.xml', 'wordprocessingml.numbering']]);
    return createZip(files);
}
function exportXLSX(book) {
    const files = {}, engine = new FormulaEngine(book), styles = [{}], styleMap = new Map([['{}', 0]]);
    for (const sheet of book.sheets)
        for (const cell of Object.values(sheet.cells)) {
            const key = JSON.stringify(cell.s || {});
            if (!styleMap.has(key)) {
                styleMap.set(key, styles.length);
                styles.push(cell.s || {});
            }
        }
    const numId = s => ({ currency: 164, percent: 10, number: 4 }[s.fmt] || 0);
    files['xl/styles.xml'] = `${XML}<styleSheet xmlns="${S}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/></numFmts><fonts count="${styles.length}">${styles.map(s => `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.u ? '<u/>' : ''}<sz val="${(s.size || 13) * .75}"/><color rgb="FF${colorHex(s.color)}"/><name val="Arial"/></font>`).join('')}</fonts><fills count="${styles.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${styles.map(s => `<fill><patternFill patternType="solid"><fgColor rgb="FF${colorHex(s.fill || '#ffffff')}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.map((s, i) => `<xf numFmtId="${numId(s)}" fontId="${i}" fillId="${s.fill ? i + 2 : 0}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"${s.align ? ` horizontal="${s.align}"` : ''}/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    book.sheets.forEach((sheet, i) => {
        const rows = new Map();
        for (const [ref, cell] of Object.entries(sheet.cells)) {
            let p;
            try {
                p = parseAddress(ref);
            }
            catch {
                continue;
            }
            if (!rows.has(p.r))
                rows.set(p.r, []);
            const s = styleMap.get(JSON.stringify(cell.s || {})) || 0, raw = cell.v ?? '', value = engine.get(sheet.id, ref);
            let xml;
            if (String(raw).startsWith('=')) {
                const type = typeof value === 'boolean' ? 'b' : typeof value === 'number' ? 'n' : String(value).startsWith('#') ? 'e' : 'str';
                xml = `<c r="${ref}" s="${s}" t="${type}"><f>${esc(raw.slice(1))}</f><v>${esc(typeof value === 'boolean' ? Number(value) : value)}</v></c>`;
            }
            else if (typeof value === 'number')
                xml = `<c r="${ref}" s="${s}"><v>${value}</v></c>`;
            else
                xml = `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
            rows.get(p.r).push({ c: p.c, xml });
        }
        files[`xl/worksheets/sheet${i + 1}.xml`] = `${XML}<worksheet xmlns="${S}"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="21.75"/><cols>${Object.entries(sheet.widths).map(([c, w]) => `<col min="${Number(c) + 1}" max="${Number(c) + 1}" width="${(w / 7).toFixed(2)}" customWidth="1"/>`).join('')}</cols><sheetData>${[...rows].sort((a, b) => a[0] - b[0]).map(([r, cells]) => `<row r="${r + 1}">${cells.sort((a, b) => a.c - b.c).map(c => c.xml).join('')}</row>`).join('')}</sheetData></worksheet>`;
    });
    files['xl/workbook.xml'] = `${XML}<workbook xmlns="${S}" xmlns:r="${OFFICE.slice(0, -1)}"><bookViews><workbookView activeTab="${Math.max(0, book.sheets.findIndex(s => s.id === book.activeSheet))}"/></bookViews><sheets>${book.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    files['xl/_rels/workbook.xml.rels'] = rels([...book.sheets.map((s, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]), ['rIdStyles', 'styles', 'styles.xml']]);
    files['_rels/.rels'] = rels([['rId1', 'officeDocument', 'xl/workbook.xml']]);
    files['[Content_Types].xml'] = contentTypes([['xl/workbook.xml', 'spreadsheetml.sheet.main'], ['xl/styles.xml', 'spreadsheetml.styles'], ...book.sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, 'spreadsheetml.worksheet'])]);
    return createZip(files);
}
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const clrMap = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
function themeXML() { const colors = { dk1: '183F33', lt1: 'FFFFFF', dk2: '2A4D3B', lt2: 'F4F7EE', accent1: '176858', accent2: 'A9C79C', accent3: 'D4E9BD', accent4: 'C38754', accent5: '548CA7', accent6: '867699', hlink: '176858', folHlink: '867699' }; return `${XML}<a:theme xmlns:a="${A}" name="Meridian"><a:themeElements><a:clrScheme name="Meridian">${Object.entries(colors).map(([name, color]) => `<a:${name}><a:srgbClr val="${color}"/></a:${name}>`).join('')}</a:clrScheme><a:fontScheme name="Meridian"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Meridian"><a:fillStyleLst>${Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:fillStyleLst><a:lnStyleLst>${[6350, 12700, 19050].map(w => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>`).join('')}</a:lnStyleLst><a:effectStyleLst>${Array(3).fill('<a:effectStyle><a:effectLst/></a:effectStyle>').join('')}</a:effectStyleLst><a:bgFillStyleLst>${Array(3).fill('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`; }
function exportPPTX(deck) {
    const files = {}, overrides = [['ppt/presentation.xml', 'presentationml.presentation.main'], ['ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster'], ['ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout'], ['ppt/theme/theme1.xml', 'theme']];
    let imageCount = 0;
    deck.slides.forEach((slide, i) => {
        const relationships = [['rIdLayout', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
        let shapes = '';
        slide.elements.forEach((e, j) => {
            const id = j + 2, x = Math.round(e.x * 9525), y = Math.round(e.y * 9525), w = Math.round(e.w * 9525), h = Math.round(e.h * 9525), xfrm = `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
            if (e.type === 'image') {
                const image = imageBytes(e.src);
                if (!image)
                    return;
                const n = ++imageCount, path = `media/image${n}.${image.extension}`, rid = `rIdImage${n}`;
                files[`ppt/${path}`] = image.bytes;
                relationships.push([rid, 'image', `../${path}`]);
                shapes += `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
                return;
            }
            const text = e.type === 'text';
            shapes += `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${text ? 'Text' : 'Shape'} ${id}"/><p:cNvSpPr${text ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm}<a:prstGeom prst="${text ? 'rect' : e.type === 'ellipse' ? 'ellipse' : e.radius ? 'roundRect' : 'rect'}"><a:avLst/></a:prstGeom>${text ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${colorHex(e.fill)}"/></a:solidFill>`}<a:ln><a:noFill/></a:ln></p:spPr>${text ? `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${String(e.text).split('\n').map(line => `<a:p><a:pPr algn="${e.align === 'center' ? 'ctr' : e.align === 'right' ? 'r' : 'l'}"><a:lnSpc><a:spcPct val="120000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="${Math.round((e.fontSize || 24) * 75)}" b="${e.bold ? '1' : '0'}"><a:solidFill><a:srgbClr val="${colorHex(e.color)}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`).join('')}</p:txBody>` : ''}</p:sp>`;
        });
        files[`ppt/slides/slide${i + 1}.xml`] = `${XML}<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OFFICE.slice(0, -1)}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${colorHex(slide.background)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${grp}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
        files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = rels(relationships);
        overrides.push([`ppt/slides/slide${i + 1}.xml`, 'presentationml.slide']);
    });
    files['ppt/presentation.xml'] = `${XML}<p:presentation xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OFFICE.slice(0, -1)}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${deck.slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
    files['ppt/_rels/presentation.xml.rels'] = rels([['rIdMaster', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...deck.slides.map((s, i) => [`rId${i + 1}`, 'slide', `slides/slide${i + 1}.xml`])]);
    files['ppt/slideMasters/slideMaster1.xml'] = `${XML}<p:sldMaster xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OFFICE.slice(0, -1)}"><p:cSld><p:spTree>${grp}</p:spTree></p:cSld>${clrMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
    files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([['rIdLayout', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rIdTheme', 'theme', '../theme/theme1.xml']]);
    files['ppt/slideLayouts/slideLayout1.xml'] = `${XML}<p:sldLayout xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OFFICE.slice(0, -1)}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${grp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([['rIdMaster', 'slideMaster', '../slideMasters/slideMaster1.xml']]);
    files['ppt/theme/theme1.xml'] = themeXML();
    files['_rels/.rels'] = rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]);
    files['[Content_Types].xml'] = contentTypes(overrides);
    return createZip(files);
}
function writerHTML(writer) { return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(writer.title)}</title><style>body{background-color:#f7f3eb;color:#2e2820;max-width:840px;margin:40px auto;padding:20px;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;line-height:1.85}article{background:#fff;padding:60px;margin-bottom:35px;box-shadow:0 4px 20px rgba(0,0,0,0.06);border-radius:6px;border:1px solid #e2d9cd;break-after:page}h1{font-family:'Cinzel',serif;font-size:2.4rem;letter-spacing:1px;color:#3b2818;margin-bottom:1.5rem}h2{font-family:'Cinzel',serif;font-size:1.6rem;color:#8c3b1d;border-bottom:1px solid #d8cfbe;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{border:1px solid #d8cfbe;padding:12px;text-align:left}th{background:#ede6da;font-family:'Cinzel',serif;font-size:0.95rem;color:#3b2818}blockquote{margin:24px 0;padding:18px 24px;border-left:4px solid #8c3b1d;background:#f3ede2;font-style:italic}img{max-width:100%;border-radius:4px}hr{border:0;border-top:2px double #d8cfbe;margin:30px 0}@media print{body{background:#fff;padding:0;margin:0}article{box-shadow:none;border:none;padding:0;margin:0}}</style></head><body>${writer.pages.map(p => `<article>${sanitizeHTML(p.html)}</article>`).join('')}</body></html>`; }
function workbookCSV(book) { const sheet = book.sheets.find(s => s.id === book.activeSheet) || book.sheets[0], engine = new FormulaEngine(book); let maxC = 0, maxR = 0; for (const ref of Object.keys(sheet.cells)) {
    const p = parseAddress(ref);
    maxC = Math.max(maxC, p.c);
    maxR = Math.max(maxR, p.r);
} if ((maxC + 1) * (maxR + 1) > 2000000)
    throw new Error('CSV export is limited to 2 million cells.'); const rows = []; for (let r = 0; r <= maxR; r++) {
    const row = [];
    for (let c = 0; c <= maxC; c++) {
        let v = engine.get(sheet.id, address(c, r));
        if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v))
            v = "'" + v;
        row.push(v);
    }
    rows.push(row);
} return serializeDelimited(rows); }
function slideSVG(slide, options = {}) { const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); const wrap = e => { ctx.font = `${e.bold ? '700' : '400'} ${e.fontSize}px Arial`; const lines = []; for (const p of String(e.text).split('\n')) {
    let line = '';
    for (const word of p.split(' ')) {
        const next = line ? line + ' ' + word : word;
        if (line && ctx.measureText(next).width > e.w) {
            lines.push(line);
            line = word;
        }
        else
            line = next;
    }
    lines.push(line);
} return lines; };
let footerSvg = '';
if (options.showNumber && options.total) {
    const cur = options.current || 1;
    const tot = options.total || 1;
    const progressW = Math.round((cur / tot) * 960);
    footerSvg = `
    <g id="tv-footer" opacity="0.95">
        <rect x="0" y="534" width="960" height="6" fill="rgba(0,0,0,0.2)"/>
        <rect x="0" y="534" width="${progressW}" height="6" fill="#8c3b1d"/>
        <rect x="844" y="494" width="104" height="32" rx="6" fill="rgba(20,20,20,0.78)"/>
        <text x="896" y="515" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">${String(cur).padStart(2, '0')} / ${String(tot).padStart(2, '0')}</text>
    </g>`;
}
return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="540" viewBox="0 0 960 540"><defs><clipPath id="slide"><rect width="960" height="540"/></clipPath></defs><g clip-path="url(#slide)"><rect width="960" height="540" fill="${esc(slide.background)}"/>${slide.elements.map(e => { if (e.type === 'image')
    return `<image x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" href="${esc(e.src)}" preserveAspectRatio="none"/>`; if (e.type === 'ellipse')
    return `<ellipse cx="${e.x + e.w / 2}" cy="${e.y + e.h / 2}" rx="${e.w / 2}" ry="${e.h / 2}" fill="${esc(e.fill)}"/>`; if (e.type === 'rect')
    return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radius || 0}" fill="${esc(e.fill)}"/>`; const x = e.align === 'center' ? e.x + e.w / 2 : e.align === 'right' ? e.x + e.w : e.x; return `<text font-family="Arial,sans-serif" font-size="${e.fontSize}" font-weight="${e.bold ? 700 : 400}" fill="${esc(e.color)}" text-anchor="${e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}">${wrap(e).slice(0, Math.floor(e.h / (e.fontSize * 1.2)) + 1).map((line, i) => `<tspan x="${x}" y="${e.y + e.fontSize * .87 + i * e.fontSize * 1.2}">${esc(line)}</tspan>`).join('')}</text>`; }).join('')}${footerSvg}</g></svg>`; }

function presentationHTML(deck) { 
    const total = deck.slides.length;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>${esc(deck.title)} · Escola Office TV</title><style>*{box-sizing:border-box}body{margin:0;background:#0c0a08;overflow:hidden;font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#fff;user-select:none}section{position:absolute;inset:0;display:none;align-items:center;justify-content:center}section.active{display:flex}svg{width:100vw;height:100vh;max-height:100vh;object-fit:contain}nav{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(20,16,12,0.88);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.15);padding:8px 18px;border-radius:36px;display:flex;align-items:center;gap:18px;z-index:100;transition:opacity .3s ease}nav.hidden{opacity:0;pointer-events:none}button{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:10px 18px;border-radius:20px;cursor:pointer;font-size:16px;font-weight:bold}button:hover,button:focus{background:#8c3b1d;border-color:#d8cfbe;outline:none}#position{font-size:15px;font-weight:600;min-width:70px;text-align:center}.tv-hint{position:fixed;top:16px;right:20px;background:rgba(0,0,0,0.6);padding:6px 14px;border-radius:20px;font-size:12px;color:#ccc;pointer-events:none;z-index:90}.touch-zone{position:fixed;top:0;bottom:0;width:35%;z-index:50}.touch-zone.left{left:0}.touch-zone.right{right:0}.touch-zone.center{left:35%;width:30%}@media print{body{overflow:visible;background:white}section,section.active{position:relative;display:block;break-after:page;height:100vh}nav,.tv-hint,.touch-zone{display:none}}</style></head><body>${deck.slides.map((s, i) => `<section class="${i === 0 ? 'active' : ''}">${slideSVG(s, { showNumber: true, current: i + 1, total })}</section>`).join('')}<div class="touch-zone left" id="touch-prev" title="Toque para voltar"></div><div class="touch-zone center" id="touch-toggle" title="Toque para alternar barra"></div><div class="touch-zone right" id="touch-next" title="Toque para avançar"></div><div class="tv-hint">Controle Remoto: Setas ← → ou OK / Espaço</div><nav id="navbar"><button id="prev">← Voltar</button><span id="position">1 / ${total}</span><button id="next">Avançar →</button><button id="fullscreen">⛶</button></nav><script>const slides=[...document.querySelectorAll('section')],nav=document.querySelector('#navbar');let index=0,hideTimer=null;function resetHideTimer(){nav.classList.remove('hidden');clearTimeout(hideTimer);hideTimer=setTimeout(()=>nav.classList.add('hidden'),4000);}function show(n){index=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,i)=>s.classList.toggle('active',i===index));document.querySelector('#position').textContent=(index+1)+' / '+slides.length;resetHideTimer();}document.querySelector('#prev').onclick=()=>show(index-1);document.querySelector('#next').onclick=()=>show(index+1);document.querySelector('#touch-prev').onclick=()=>show(index-1);document.querySelector('#touch-next').onclick=()=>show(index+1);document.querySelector('#touch-toggle').onclick=()=>nav.classList.toggle('hidden');document.querySelector('#fullscreen').onclick=()=>{if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(()=>{});}else{document.exitFullscreen().catch(()=>{});}};window.addEventListener('keydown',e=>{const c=e.keyCode||e.which,k=e.key;if(['ArrowRight','ArrowDown',' ','PageDown','Enter'].includes(k)||[39,40,32,34,13,10252,415,427,66,23].includes(c)){e.preventDefault();show(index+1);}else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(k)||[37,38,33,8,428].includes(c)){e.preventDefault();show(index-1);}else if(k==='f'||k==='F'){document.querySelector('#fullscreen').click();}resetHideTimer();});let touchStartX=0;window.addEventListener('touchstart',e=>{touchStartX=e.changedTouches[0].screenX;resetHideTimer();},{passive:true});window.addEventListener('touchend',e=>{const diffX=e.changedTouches[0].screenX-touchStartX;if(diffX<-50)show(index+1);else if(diffX>50)show(index-1);},{passive:true});resetHideTimer();document.addEventListener('mousemove',resetHideTimer);<\/script></body></html>`; 
}

function renderSlideToImage(svgText, width = 1920, height = 1080, type = 'image/jpeg', quality = 0.93) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            try {
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                canvas.toBlob(b => {
                    if (!b) {
                        reject(new Error('Falha ao gerar imagem do slide.'));
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => resolve(new Uint8Array(reader.result));
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(b);
                }, type, quality);
            } catch (err) {
                URL.revokeObjectURL(url);
                reject(err);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Falha ao renderizar SVG do slide para imagem.'));
        };
        img.src = url;
    });
}

async function exportTVPackage(deck, onProgress) {
    const files = {};
    const total = deck.slides.length;
    const pad = (n, len = 3) => String(n).padStart(len, '0');
    const safeTitle = (deck.title || 'Apresentacao').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚâêîôûÂÊÎÔÛãõÃÕçÇ_-]/g, '_').slice(0, 30);

    files['000_ABRIR_SLIDES_NA_TV.html'] = presentationHTML(deck);

    for (let i = 0; i < total; i++) {
        if (onProgress) onProgress(i + 1, total);
        const slide = deck.slides[i];
        const svg = slideSVG(slide, { showNumber: true, current: i + 1, total, title: deck.title });
        const bytes = await renderSlideToImage(svg, 1920, 1080, 'image/jpeg', 0.93);
        const fileName = `${pad(i + 1)}_Slide_${safeTitle}.jpg`;
        files[fileName] = bytes;
    }

    files['LEIA-ME_COMO_USAR_NA_TV.txt'] = `=====================================================
ESCOLA OFFICE · APRESENTAÇÃO NA TV (VIA PEN DRIVE)
Projeto: ${deck.title || 'Apresentação'}
Total de Slides: ${total}
=====================================================

COMO USAR ESTA PASTA NA SMART TV DA ESCOLA:

MODO 1 - VIA FOTOS / IMAGENS USB (RECOMENDADO):
1. Copie todos os arquivos desta pasta para o seu Pen Drive.
2. Conecte o Pen Drive na entrada USB da TV da sala de aula.
3. No menu da TV, selecione "USB", "Fotos" ou "Mídia".
4. Abra a primeira imagem: 001_Slide_${safeTitle}.jpg.
5. Use as setas do controle remoto comum da TV (← e →) para passar a aula.
   * Os arquivos possuem prefixo de 3 dígitos (001, 002, 003...) para garantir
     que NENHUMA TV bagunce a ordem dos seus slides.
   * Cada imagem possui um contador discreto no rodapé informando a página atual.

MODO 2 - VIA NAVEGADOR DE INTERNET DA SMART TV:
1. Se a TV tiver navegador de internet (Browser/Internet), abra o arquivo:
   000_ABRIR_SLIDES_NA_TV.html
2. Pressione OK ou as setas do controle remoto da TV para navegar em tela cheia.

Criado com Escola Office · Salinas da Margarida - BA
`;

    return createZip(files);
}
async function importDOCX(bytes, title) {
    const zip = new ZipReader(bytes), doc = parseXML(await zip.text('word/document.xml'));
    const body = first(doc, 'body'), pages = [{ id: uid(), html: '' }];
    const run = node => { if (node.localName === 't')
        return esc(node.textContent); if (node.localName === 'br')
        return '<br>'; if (node.localName === 'tab')
        return '&emsp;'; if (node.localName === 'r') {
        let content = [...node.children].filter(c => c.localName !== 'rPr').map(run).join(''), style = '';
        const pr = direct(node, 'rPr')[0];
        if (pr) {
            if (first(pr, 'b'))
                style += 'font-weight:700;';
            if (first(pr, 'i'))
                style += 'font-style:italic;';
            if (first(pr, 'u'))
                style += 'text-decoration:underline;';
            const color = first(pr, 'color'), size = first(pr, 'sz');
            if (color && /^[A-F0-9]{6}$/i.test(attr(color, 'val') || ''))
                style += `color:#${attr(color, 'val')};`;
            if (size)
                style += `font-size:${Number(attr(size, 'val')) / 1.5}px;`;
        }
        return style ? `<span style="${style}">${content}</span>` : content;
    } return [...node.children].map(run).join(''); };
    const paragraph = node => { const pstyle = first(node, 'pStyle'), name = attr(pstyle, 'val') || '', heading = /heading([1-4])/i.exec(name), tag = heading ? 'h' + heading[1] : 'p', align = attr(first(node, 'jc'), 'val'); return `<${tag}${['left', 'right', 'center', 'both'].includes(align) ? ` style="text-align:${align === 'both' ? 'justify' : align}"` : ''}>${run(node) || '<br>'}</${tag}>`; };
    for (const node of body.children) {
        if (node.localName === 'p') {
            if (descendants(node, 'br').some(b => attr(b, 'type') === 'page')) {
                pages.push({ id: uid(), html: '' });
                continue;
            }
            pages.at(-1).html += paragraph(node);
        }
        else if (node.localName === 'tbl')
            pages.at(-1).html += `<table><tbody>${direct(node, 'tr').map(row => `<tr>${direct(row, 'tc').map(cell => `<td>${direct(cell, 'p').map(paragraph).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return { title, comments: [], pages: pages.map(p => ({ ...p, html: sanitizeHTML(p.html || '<p><br></p>') })) };
}
async function importXLSX(bytes, title) {
    const zip = new ZipReader(bytes), book = parseXML(await zip.text('xl/workbook.xml')), relationships = parseXML(await zip.text('xl/_rels/workbook.xml.rels'));
    const mapping = new Map(descendants(relationships, 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')])), strings = [];
    if (zip.has('xl/sharedStrings.xml')) {
        const shared = parseXML(await zip.text('xl/sharedStrings.xml'));
        for (const si of descendants(shared, 'si'))
            strings.push(descendants(si, 't').map(t => t.textContent).join(''));
    }
    let styles = [];
    if (zip.has('xl/styles.xml')) {
        const styleDoc = parseXML(await zip.text('xl/styles.xml')), fonts = first(styleDoc, 'fonts'), fills = first(styleDoc, 'fills'), xfs = first(styleDoc, 'cellXfs'), numFmts = descendants(styleDoc, 'numFmt');
        styles = direct(xfs, 'xf').map(x => { const font = fonts?.children[Number(x.getAttribute('fontId'))], fill = fills?.children[Number(x.getAttribute('fillId'))], color = font && first(font, 'color')?.getAttribute('rgb'), bg = fill && first(fill, 'fgColor')?.getAttribute('rgb'), nf = Number(x.getAttribute('numFmtId')), code = numFmts.find(f => Number(f.getAttribute('numFmtId')) === nf)?.getAttribute('formatCode') || ''; return { b: !!(font && first(font, 'b')), i: !!(font && first(font, 'i')), u: !!(font && first(font, 'u')), color: color ? '#' + color.slice(-6) : '#354b3e', fill: bg ? '#' + bg.slice(-6) : '#ffffff', size: Number(font && first(font, 'sz')?.getAttribute('val') || 9.75) / .75, align: first(x, 'alignment')?.getAttribute('horizontal') || undefined, fmt: [9, 10].includes(nf) || code.includes('%') ? 'percent' : code.includes('$') || [5, 6, 7, 8, 44].includes(nf) ? 'currency' : [2, 4].includes(nf) ? 'number' : 'general' }; });
    }
    const sheets = [];
    for (const descriptor of descendants(book, 'sheet')) {
        const id = descriptor.getAttributeNS(OFFICE.slice(0, -1), 'id') || descriptor.getAttribute('r:id'), target = mapping.get(id);
        if (!target)
            continue;
        const part = resolvePart('xl/workbook.xml', target), doc = parseXML(await zip.text(part)), cells = {}, widths = {};
        let count = 0;
        for (const c of descendants(doc, 'c')) {
            if (++count > 200000)
                throw new Error('Import cell limit exceeded.');
            const ref = c.getAttribute('r');
            if (!/^[A-Z]{1,3}[1-9]\d*$/.test(ref || ''))
                continue;
            const formula = first(c, 'f'), type = c.getAttribute('t'), v = first(c, 'v')?.textContent || '';
            const value = formula ? '=' + formula.textContent : type === 's' ? strings[Number(v)] || '' : type === 'inlineStr' ? descendants(c, 't').map(t => t.textContent).join('') : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
            cells[ref] = { v: value, s: styles[Number(c.getAttribute('s'))] || {} };
        }
        for (const col of descendants(doc, 'col')) {
            const min = Number(col.getAttribute('min')) - 1, max = Math.min(255, Number(col.getAttribute('max')) - 1);
            for (let c = min; c <= max; c++)
                widths[c] = Math.max(50, Math.min(600, Number(col.getAttribute('width')) * 7));
        }
        sheets.push({ id: uid(), name: descriptor.getAttribute('name') || 'Sheet', rows: 10000, cols: 64, widths, cells });
    }
    if (!sheets.length)
        throw new Error('No worksheets found.');
    return { title, activeSheet: sheets[0].id, sheets };
}
async function importPPTX(bytes, title) {
    const zip = new ZipReader(bytes), pres = parseXML(await zip.text('ppt/presentation.xml')), relationships = parseXML(await zip.text('ppt/_rels/presentation.xml.rels')), map = new Map(descendants(relationships, 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')])), size = first(pres, 'sldSz'), sx = 960 / Number(size?.getAttribute('cx') || 9144000), sy = 540 / Number(size?.getAttribute('cy') || 5143500), slides = [];
    for (const descriptor of descendants(pres, 'sldId')) {
        const target = map.get(descriptor.getAttributeNS(OFFICE.slice(0, -1), 'id') || descriptor.getAttribute('r:id'));
        if (!target)
            continue;
        const part = resolvePart('ppt/presentation.xml', target), doc = parseXML(await zip.text(part)), bg = first(doc, 'bg'), color = bg && first(bg, 'srgbClr')?.getAttribute('val'), elements = [];
        for (const sp of direct(first(doc, 'spTree'), 'sp')) {
            const transform = first(sp, 'xfrm'), off = transform && first(transform, 'off'), extent = transform && first(transform, 'ext');
            if (!off || !extent)
                continue;
            const x = Number(off.getAttribute('x')) * sx, y = Number(off.getAttribute('y')) * sy, w = Number(extent.getAttribute('cx')) * sx, h = Number(extent.getAttribute('cy')) * sy, tx = first(sp, 'txBody'), geom = first(sp, 'prstGeom')?.getAttribute('prst');
            if (tx) {
                const paragraphs = direct(tx, 'p'), text = paragraphs.map(p => descendants(p, 't').map(t => t.textContent).join('')).join('\n'), props = first(tx, 'rPr'), fill = props && first(props, 'srgbClr')?.getAttribute('val'), align = first(tx, 'pPr')?.getAttribute('algn');
                elements.push({ id: uid(), type: 'text', x, y, w, h, text, fontSize: Number(props?.getAttribute('sz') || 1800) / 75, bold: props?.getAttribute('b') === '1', color: '#' + (fill || '183F33'), align: align === 'ctr' ? 'center' : align === 'r' ? 'right' : 'left' });
            }
            else {
                const spPr = direct(sp, 'spPr')[0], fill = spPr && first(spPr, 'srgbClr')?.getAttribute('val');
                elements.push({ id: uid(), type: geom === 'ellipse' ? 'ellipse' : 'rect', x, y, w, h, fill: '#' + (fill || 'A9C79C'), radius: geom === 'roundRect' ? 12 : 0 });
            }
        }
        slides.push({ id: uid(), background: '#' + (color || 'FFFFFF'), notes: '', elements });
    }
    if (!slides.length)
        throw new Error('No slides found.');
    return { title, activeSlide: 0, slides };
}
function importCSV(text, title) { const separator = text.includes('\t') && !text.includes(',') ? '\t' : ',', rows = parseDelimited(text, separator); if (rows.reduce((n, r) => n + r.length, 0) > 200000)
    throw new Error('CSV import limit: 200,000 cells.'); const cells = {}; rows.forEach((row, r) => row.forEach((v, c) => { if (c < 256 && r < 100000)
    cells[address(c, r)] = { v: /^[=+@]/.test(v) ? "'" + v : v }; })); const sheet = { id: uid(), name: 'Imported data', rows: Math.max(10000, Math.min(100000, rows.length + 100)), cols: Math.max(64, Math.min(256, Math.max(...rows.map(r => r.length), 1))), widths: {}, cells }; return { title, activeSheet: sheet.id, sheets: [sheet] }; }

return {exportDOCX,exportXLSX,exportPPTX,writerHTML,workbookCSV,slideSVG,presentationHTML,renderSlideToImage,exportTVPackage,importDOCX,importXLSX,importPPTX,importCSV};
})();
const __meridian_14 = (() => {
// Gerador de Folha de Provas & Atividades Pedagógicas
// Desenvolvido para o Escola Office · Suíte Educacional Livre

const EXAM_TYPES = [
    { id: 'mista', name: 'Avaliação Completa (Dissertativa + Objetiva com Gabarito)' },
    { id: 'dissertativa', name: 'Avaliação Dissertativa (com Linhas Pautadas)' },
    { id: 'multipla', name: 'Avaliação Objetiva (Questões Múltipla Escolha + Cartão-Resposta)' },
    { id: 'estudo', name: 'Estudo Dirigido / Atividade de Pesquisa com Texto-Base' },
    { id: 'redacao', name: 'Folha Oficial de Redação (30 Linhas Numeradas + Grade)' }
];

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function ruledLines(count = 5) {
    let lines = '';
    for (let i = 0; i < count; i++) {
        lines += '<div style="border-bottom:1px dashed #bdaea0;height:24px;margin:5px 0"></div>';
    }
    return lines;
}

function generateExamHTML(opts = {}) {
    const escola = esc(opts.escola || 'Escola Municipal de Ensino Fundamental');
    const disciplina = esc(opts.disciplina || 'História');
    const turma = esc(opts.turma || '9º Ano — Turma A');
    const professor = esc(opts.professor || 'Prof. Sérgio Araújo');
    const periodo = esc(opts.periodo || '1º Bimestre — Ano Letivo 2026');
    const valor = esc(opts.valor || 'Valor: 10,0 pontos');
    const titulo = esc(opts.titulo || 'AVALIAÇÃO DE APRENDIZAGEM');
    const instrucoes = esc(opts.instrucoes || 'Leia com atenção todas as questões antes de responder. Utilize caneta esferográfica azul ou preta. Escreva com letra legível e fundamente suas respostas.');
    const tipo = opts.tipo || 'mista';

    const headerHTML = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:2px solid #8c3b1d;font-family:'Cinzel',serif">
        <tr>
            <td style="border:none;padding:12px 14px;background:#fdfbf7;text-align:center" colspan="3">
                <div style="font-size:11px;letter-spacing:2px;color:#8c3b1d;font-weight:700">SECRETARIA MUNICIPAL DE EDUCAÇÃO</div>
                <div style="font-size:19px;font-weight:700;color:#2e2820;margin:4px 0">${escola}</div>
                <div style="font-size:13px;font-style:italic;font-family:'Cormorant Garamond',Georgia,serif;color:#5c5042">
                    ${disciplina} &nbsp;•&nbsp; ${turma} &nbsp;•&nbsp; ${periodo} &nbsp;•&nbsp; ${professor}
                </div>
            </td>
        </tr>
        <tr style="border-top:1px solid #d8cfbe;background:#f7f3eb;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px">
            <td style="padding:8px 12px;border-right:1px solid #d8cfbe;width:58%">
                <strong>Estudante:</strong> _______________________________________________
            </td>
            <td style="padding:8px 12px;border-right:1px solid #d8cfbe;width:22%;text-align:center">
                <strong>Data:</strong> ____/____/2026
            </td>
            <td style="padding:8px 12px;width:20%;color:#8c3b1d;font-weight:700;text-align:center">
                <strong>Nota:</strong> [ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ]
            </td>
        </tr>
    </table>

    <div style="text-align:center;margin:12px 0 16px">
        <h2 style="font-family:'Cinzel',serif;font-size:18px;letter-spacing:1px;color:#8c3b1d;margin:0;padding:0">${titulo}</h2>
        <span style="font-size:12px;color:#6b5c4c;font-style:italic;font-family:'Cormorant Garamond',serif">${valor}</span>
    </div>

    <div style="background:#f4eee3;border-left:4px solid #8c3b1d;padding:10px 14px;margin-bottom:22px;font-size:13px;line-height:1.5;color:#4a3f33;font-style:italic">
        <strong>Orientações:</strong> ${instrucoes}
    </div>
    `;

    if (tipo === 'redacao') {
        let lines30 = '';
        for (let i = 1; i <= 30; i++) {
            const num = String(i).padStart(2, '0');
            lines30 += `
            <div style="display:flex;align-items:center;height:27px;border-bottom:1px solid #c9bea9">
                <span style="width:34px;font-size:11px;font-family:'Cinzel',serif;color:#8c3b1d;font-weight:700;user-select:none;border-right:1px solid #d8cfbe;margin-right:10px">${num}</span>
                <span style="flex:1"></span>
            </div>`;
        }

        return `
        ${headerHTML}
        <div style="margin-bottom:20px">
            <h3 style="font-family:'Cinzel',serif;font-size:14px;color:#8c3b1d;margin-bottom:6px">PROPOSTA DE REDAÇÃO E TEXTO DISSERTATIVO-ARGUMENTATIVO</h3>
            <p style="font-size:1.15rem;line-height:1.7;margin-bottom:12px">
                A partir da leitura dos textos estudados e com base nos conhecimentos construídos ao longo da unidade, redija um texto dissertativo-argumentativo em norma padrão da língua portuguesa sobre o tema proposto, apresentando proposta de intervenção que respeite os direitos humanos.
            </p>
            <div style="background:#fdfbf7;border:1px dashed #8c3b1d;padding:12px;text-align:center;margin:15px 0">
                <strong style="font-family:'Cinzel',serif;font-size:15px;color:#3b2818">TEMA: MEMÓRIA, IDENTIDADE E CIDADANIA NA COMUNIDADE ESCOLAR</strong>
            </div>
        </div>

        <div style="margin:20px 0 10px;text-align:center">
            <span style="font-size:13px;color:#7a6b5c">Título: ____________________________________________________________________</span>
        </div>

        <div style="border:1px solid #d8cfbe;background:#fff;padding:8px 14px;border-radius:4px;margin-bottom:20px">
            ${lines30}
        </div>

        <table style="width:100%;border-collapse:collapse;margin-top:15px;font-size:11px;border:1px solid #d8cfbe;text-align:center">
            <tr style="background:#f2ebd9;color:#3b2818">
                <th style="padding:6px;border:1px solid #d8cfbe">I. Norma Culta (2,5)</th>
                <th style="padding:6px;border:1px solid #d8cfbe">II. Tema e Repertório (2,5)</th>
                <th style="padding:6px;border:1px solid #d8cfbe">III. Coesão e Argumentação (2,5)</th>
                <th style="padding:6px;border:1px solid #d8cfbe">IV. Conclusão / Proposta (2,5)</th>
                <th style="padding:6px;border:1px solid #d8cfbe;background:#ebd8c7;color:#8c3b1d;font-weight:700">Total (10,0)</th>
            </tr>
            <tr>
                <td style="padding:8px;border:1px solid #d8cfbe">[ &nbsp; &nbsp; &nbsp; ]</td>
                <td style="padding:8px;border:1px solid #d8cfbe">[ &nbsp; &nbsp; &nbsp; ]</td>
                <td style="padding:8px;border:1px solid #d8cfbe">[ &nbsp; &nbsp; &nbsp; ]</td>
                <td style="padding:8px;border:1px solid #d8cfbe">[ &nbsp; &nbsp; &nbsp; ]</td>
                <td style="padding:8px;border:1px solid #d8cfbe;font-weight:700">[ &nbsp; &nbsp; &nbsp; ]</td>
            </tr>
        </table>
        `;
    }

    if (tipo === 'dissertativa') {
        return `
        ${headerHTML}
        <div style="margin-bottom:24px">
            <p><strong>Questão 01 (Valor: 2,5 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.7;margin-bottom:8px">
                Explique com suas palavras o processo histórico analisado em sala de aula, destacando as principais causas e transformações sociais vivenciadas pela comunidade no período.
            </p>
            ${ruledLines(6)}
        </div>

        <div style="margin-bottom:24px">
            <p><strong>Questão 02 (Valor: 2,5 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.7;margin-bottom:8px">
                Relacione o conceito de memória coletiva com a preservação das tradições culturais e do patrimônio histórico local. De que forma os saberes tradicionais fortalecem o sentimento de pertencimento territorial?
            </p>
            ${ruledLines(6)}
        </div>

        <div style="margin-bottom:24px">
            <p><strong>Questão 03 (Valor: 2,5 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.7;margin-bottom:8px">
                A partir dos documentos e mapas investigados na unidade, aponte dois impactos territoriais significativos para as populações ribeirinhas e pesqueiras ao longo dos séculos.
            </p>
            ${ruledLines(6)}
        </div>

        <div style="margin-bottom:24px">
            <p><strong>Questão 04 (Valor: 2,5 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.7;margin-bottom:8px">
                Conclua sua análise propondo uma ação cidadã que a escola ou o município possa realizar para proteger a memória histórica e o meio ambiente local.
            </p>
            ${ruledLines(6)}
        </div>
        `;
    }

    if (tipo === 'multipla') {
        return `
        ${headerHTML}
        <div style="margin:0 0 20px;padding:12px 16px;background:#fdfbf7;border:2px solid #8c3b1d;border-radius:4px">
            <div style="font-family:'Cinzel',serif;font-size:12px;font-weight:700;color:#8c3b1d;letter-spacing:1px;text-align:center;margin-bottom:8px">
                CARTÃO-RESPOSTA / GABARITO OFICIAL (PREENCHA COMPLETAMENTE O CÍRCULO)
            </div>
            <table style="width:100%;text-align:center;border-collapse:collapse;font-size:12px">
                <tr style="background:#f2ebd9">
                    <th style="padding:5px;border:1px solid #d8cfbe">Questão</th>
                    <th style="padding:5px;border:1px solid #d8cfbe">01</th>
                    <th style="padding:5px;border:1px solid #d8cfbe">02</th>
                    <th style="padding:5px;border:1px solid #d8cfbe">03</th>
                    <th style="padding:5px;border:1px solid #d8cfbe">04</th>
                    <th style="padding:5px;border:1px solid #d8cfbe">05</th>
                </tr>
                <tr>
                    <td style="padding:6px;border:1px solid #d8cfbe;font-weight:700">Alternativas</td>
                    <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
                    <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
                    <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
                    <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
                    <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
                </tr>
            </table>
        </div>

        <div style="margin-bottom:20px">
            <p><strong>Questão 01 (Valor: 2,0 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                A respeito do patrimônio imaterial e dos saberes tradicionais das comunidades da Bahia e do Recôncavo, assinale a afirmativa correta:
            </p>
            <p style="margin:4px 0 4px 18px">(A) O patrimônio imaterial se restringe apenas a construções antigas de pedra e cal.</p>
            <p style="margin:4px 0 4px 18px">(B) As cantigas de roda, técnicas de pesca artesanal e festas populares compõem o patrimônio vivo.</p>
            <p style="margin:4px 0 4px 18px">(C) Os saberes tradicionais deixaram de existir após o avanço das tecnologias digitais.</p>
            <p style="margin:4px 0 4px 18px">(D) Apenas documentos oficiais registrados em cartório têm valor como fonte histórica.</p>
        </div>

        <div style="margin-bottom:20px">
            <p><strong>Questão 02 (Valor: 2,0 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                A preservação dos manguezais e das zonas estuarinas possui papel fundamental na sustentabilidade do Recôncavo Baiano porque:
            </p>
            <p style="margin:4px 0 4px 18px">(A) São berçários ecológicos naturais que sustentam o sustento de marisqueiras e pescadores.</p>
            <p style="margin:4px 0 4px 18px">(B) Impedem completamente qualquer atividade humana na costa litorânea.</p>
            <p style="margin:4px 0 4px 18px">(C) Devem ser aterrados para expansão imobiliária sem planejamento ambiental.</p>
            <p style="margin:4px 0 4px 18px">(D) Não exercem influência sobre a reprodução de caranguejos e peixes marinhos.</p>
        </div>

        <div style="margin-bottom:20px">
            <p><strong>Questão 03 (Valor: 2,0 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                No estudo da História, o uso de fontes orais (entrevistas com anciãos e mestres populares) permite:
            </p>
            <p style="margin:4px 0 4px 18px">(A) Substituir a verdade histórica por lendas sem valor pedagógico.</p>
            <p style="margin:4px 0 4px 18px">(B) Dar voz a sujeitos históricos frequentemente ausentes dos compêndios tradicionais.</p>
            <p style="margin:4px 0 4px 18px">(C) Anular a importância dos arquivos municipais e eclesiásticos.</p>
            <p style="margin:4px 0 4px 18px">(D) Restringir a pesquisa exclusivamente a dados estatísticos e numéricos.</p>
        </div>

        <div style="margin-bottom:20px">
            <p><strong>Questão 04 (Valor: 2,0 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                A cidadania ativa no ambiente escolar se manifesta de maneira prioritária quando:
            </p>
            <p style="margin:4px 0 4px 18px">(A) O estudante participa ativamente dos debates, respeita as diferenças e propõe melhorias coletivas.</p>
            <p style="margin:4px 0 4px 18px">(B) Cada indivíduo preocupa-se apenas com a sua própria nota nas avaliações.</p>
            <p style="margin:4px 0 4px 18px">(C) O silêncio absoluto substitui o diálogo entre a coordenação, professores e estudantes.</p>
            <p style="margin:4px 0 4px 18px">(D) O patrimônio público escolar é negligenciado sem responsabilização coletiva.</p>
        </div>

        <div style="margin-bottom:20px">
            <p><strong>Questão 05 (Valor: 2,0 pontos)</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                Sobre a relação entre território, trabalho e identidade cultural em Salinas da Margarida, podemos afirmar:
            </p>
            <p style="margin:4px 0 4px 18px">(A) As atividades marítimas e a extração do sal moldaram o modo de vida e a memória social do município.</p>
            <p style="margin:4px 0 4px 18px">(B) A cidade desenvolveu-se exclusivamente com base na indústria pesada automobilística.</p>
            <p style="margin:4px 0 4px 18px">(C) A culinária local não guarda nenhum vínculo com os frutos do mar e os mangues.</p>
            <p style="margin:4px 0 4px 18px">(D) O território é um espaço neutro que não interfere nos costumes da comunidade.</p>
        </div>
        `;
    }

    if (tipo === 'estudo') {
        return `
        ${headerHTML}
        <div style="margin-bottom:22px">
            <h3 style="font-family:'Cinzel',serif;font-size:15px;color:#8c3b1d;margin-bottom:8px">DOCUMENTO DISPARADOR / FONTE HISTÓRICA:</h3>
            <blockquote style="margin:12px 0;padding:16px 22px;border-left:4px solid #8c3b1d;background:#fdfbf7;font-style:italic;line-height:1.75;color:#3d3328">
                “O mar e os manguezais não são apenas elementos da paisagem física de Salinas da Margarida; são arquivos vivos de trabalho, resistência e sabedoria comunitária. Cada maré que sobe e desce carrega narrativas transmitidas de geração em geração, onde marisqueiras e pescadores decifram os sinais do vento, da lua e das águas com precisão científica e ancestral.”
            </blockquote>
            <div style="text-align:right;font-size:12px;color:#7a6b5c;font-style:italic">— Caderno de Memória & Saberes Populares de Salinas da Margarida (2026).</div>
        </div>

        <div style="margin-bottom:24px">
            <p><strong>1. Análise Documental e Compreensão</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                De acordo com o texto, por que o mar e os manguezais são considerados “arquivos vivos” e não apenas recursos naturais?
            </p>
            ${ruledLines(4)}
        </div>

        <div style="margin-bottom:24px">
            <p><strong>2. Diálogo com a Realidade Local</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                Entreviste mentalmente ou recorde relatos de moradores da comunidade: que saberes sobre a natureza você já ouviu de seus pais, avós ou vizinhos pescadores?
            </p>
            ${ruledLines(4)}
        </div>

        <div style="margin-bottom:24px">
            <p><strong>3. Proposta Interdisciplinar</strong></p>
            <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
                Como as disciplinas de História e Ciências da Natureza podem trabalhar juntas para preservar os ecossistemas e a memória do nosso município?
            </p>
            ${ruledLines(4)}
        </div>
        `;
    }

    // Tipo padrão: 'mista' (Avaliação Completa)
    return `
    ${headerHTML}

    <div style="margin:0 0 20px;padding:12px 16px;background:#fdfbf7;border:2px solid #8c3b1d;border-radius:4px">
        <div style="font-family:'Cinzel',serif;font-size:12px;font-weight:700;color:#8c3b1d;letter-spacing:1px;text-align:center;margin-bottom:8px">
            CARTÃO-RESPOSTA / GABARITO (QUESTÕES OBJETIVAS)
        </div>
        <table style="width:100%;text-align:center;border-collapse:collapse;font-size:12px">
            <tr style="background:#f2ebd9">
                <th style="padding:5px;border:1px solid #d8cfbe">Questão</th>
                <th style="padding:5px;border:1px solid #d8cfbe">01</th>
                <th style="padding:5px;border:1px solid #d8cfbe">02</th>
                <th style="padding:5px;border:1px solid #d8cfbe">03</th>
            </tr>
            <tr>
                <td style="padding:6px;border:1px solid #d8cfbe;font-weight:700">Alternativas</td>
                <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
                <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
                <td style="padding:6px;border:1px solid #d8cfbe">Ⓐ Ⓑ Ⓒ Ⓓ</td>
            </tr>
        </table>
    </div>

    <h3 style="font-family:'Cinzel',serif;font-size:14px;color:#8c3b1d;border-bottom:1px solid #d8cfbe;padding-bottom:4px;margin:18px 0 12px">
        PARTE I — QUESTÕES OBJETIVAS DE MÚLTIPLA ESCOLHA
    </h3>

    <div style="margin-bottom:18px">
        <p><strong>Questão 01 (Valor: 1,5 ponto)</strong></p>
        <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
            Ao investigar a história e a formação cultural da Baía de Todos-os-Santos e do Recôncavo Baiano, destaca-se como marco identitário central:
        </p>
        <p style="margin:4px 0 4px 18px">(A) O entrelaçamento de saberes indígenas, afro-brasileiros e ribeirinhos ligados à navegação e pesca.</p>
        <p style="margin:4px 0 4px 18px">(B) A total ausência de manifestações religiosas e populares na vida cotidiana.</p>
        <p style="margin:4px 0 4px 18px">(C) O isolamento geográfico absoluto em relação às rotas comerciais e culturais.</p>
        <p style="margin:4px 0 4px 18px">(D) A substituição de todas as práticas tradicionais por indústrias modernas sem memória.</p>
    </div>

    <div style="margin-bottom:18px">
        <p><strong>Questão 02 (Valor: 1,5 ponto)</strong></p>
        <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
            A pesquisa histórica escolar com foco no patrimônio municipal tem como principal objetivo pedagógico:
        </p>
        <p style="margin:4px 0 4px 18px">(A) Apenas memorizar datas de fundação e nomes de governantes do passado.</p>
        <p style="margin:4px 0 4px 18px">(B) Compreender criticamente a realidade do território e valorizar a identidade da comunidade.</p>
        <p style="margin:4px 0 4px 18px">(C) Copiar trechos de livros didáticos sem reflexão ou análise contextual.</p>
        <p style="margin:4px 0 4px 18px">(D) Substituir a convivência comunitária por exercícios repetitivos em sala de aula.</p>
    </div>

    <div style="margin-bottom:18px">
        <p><strong>Questão 03 (Valor: 1,5 ponto)</strong></p>
        <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
            O trabalho tradicional das marisqueiras nos mangues representa um exemplo de:
        </p>
        <p style="margin:4px 0 4px 18px">(A) Saberes ancestrais de manejo sustentável aliados à economia solidária e sobrevivência cultural.</p>
        <p style="margin:4px 0 4px 18px">(B) Destruição deliberada dos ecossistemas estuarinos sem benefícios para a família.</p>
        <p style="margin:4px 0 4px 18px">(C) Prática recente surgida exclusivamente no século XXI com a internet.</p>
        <p style="margin:4px 0 4px 18px">(D) Atividade sem relevância para a culinária e a cultura alimentar baiana.</p>
    </div>

    <h3 style="font-family:'Cinzel',serif;font-size:14px;color:#8c3b1d;border-bottom:1px solid #d8cfbe;padding-bottom:4px;margin:24px 0 12px">
        PARTE II — QUESTÕES DISSERTATIVAS (RESPOSTAS ESCRITAS)
    </h3>

    <div style="margin-bottom:22px">
        <p><strong>Questão 04 (Valor: 2,5 pontos)</strong></p>
        <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
            Explique como o território onde vivemos influencia nossa identidade e os laços afetivos que construímos com nossa cidade e escola.
        </p>
        ${ruledLines(5)}
    </div>

    <div style="margin-bottom:22px">
        <p><strong>Questão 05 (Valor: 3,0 pontos)</strong></p>
        <p style="font-size:1.15rem;line-height:1.6;margin-bottom:6px">
            Com base nos estudos realizados, proponha uma iniciativa comunitária de valorização da história de Salinas da Margarida que envolva os jovens estudantes.
        </p>
        ${ruledLines(6)}
    </div>
    `;
}

return {EXAM_TYPES,generateExamHTML};
})();
const __meridian_15 = (() => {
// Gerador de Rubricas de Avaliação Formativa
// Desenvolvido para o Escola Office · Suíte Educacional Livre

const RUBRIC_TEMPLATES = [
    { id: 'seminario', name: 'Apresentação Oral & Seminário Temático' },
    { id: 'redacao', name: 'Produção Textual & Redação Dissertativa' },
    { id: 'pesquisa', name: 'Projeto de Pesquisa & Trabalho em Grupo' },
    { id: 'pratica', name: 'Resolução de Problemas & Atividade Prática' },
    { id: 'personalizada', name: 'Matriz de Rubrica em Branco (Personalizável)' }
];

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function generateRubricHTML(opts = {}) {
    const escola = esc(opts.escola || 'Escola Municipal de Ensino Fundamental');
    const disciplina = esc(opts.disciplina || 'História');
    const turma = esc(opts.turma || '9º Ano — Turma A');
    const professor = esc(opts.professor || 'Prof. Sérgio Araújo');
    const periodo = esc(opts.periodo || '1º Bimestre — Ano Letivo 2026');
    const atividade = esc(opts.atividade || 'Seminário Temático: Memória e Território');
    const tipo = opts.tipo || 'seminario';

    const headerHTML = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:2px solid #8c3b1d;font-family:'Cinzel',serif">
        <tr>
            <td style="border:none;padding:12px 14px;background:#fdfbf7;text-align:center" colspan="3">
                <div style="font-size:11px;letter-spacing:2px;color:#8c3b1d;font-weight:700">SECRETARIA MUNICIPAL DE EDUCAÇÃO</div>
                <div style="font-size:19px;font-weight:700;color:#2e2820;margin:4px 0">${escola}</div>
                <div style="font-size:13px;font-style:italic;font-family:'Cormorant Garamond',Georgia,serif;color:#5c5042">
                    ${disciplina} &nbsp;•&nbsp; ${turma} &nbsp;•&nbsp; ${periodo} &nbsp;•&nbsp; ${professor}
                </div>
            </td>
        </tr>
        <tr style="border-top:1px solid #d8cfbe;background:#f7f3eb;font-family:'Cormorant Garamond',Georgia,serif;font-size:14px">
            <td style="padding:8px 12px;border-right:1px solid #d8cfbe;width:58%">
                <strong>Estudante / Grupo:</strong> __________________________________________
            </td>
            <td style="padding:8px 12px;border-right:1px solid #d8cfbe;width:22%;text-align:center">
                <strong>Data:</strong> ____/____/2026
            </td>
            <td style="padding:8px 12px;width:20%;color:#8c3b1d;font-weight:700;text-align:center">
                <strong>Pontuação Final:</strong> [ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ]
            </td>
        </tr>
    </table>

    <div style="text-align:center;margin:12px 0 16px">
        <h2 style="font-family:'Cinzel',serif;font-size:18px;letter-spacing:1px;color:#8c3b1d;margin:0;padding:0">
            MATRIZ DE RUBRICA DE AVALIAÇÃO FORMATIVA
        </h2>
        <div style="font-size:13px;color:#6b5c4c;font-style:italic;font-family:'Cormorant Garamond',serif;margin-top:4px">
            Atividade Avaliada: <strong>${atividade}</strong>
        </div>
    </div>

    <div style="background:#f4eee3;border-left:4px solid #8c3b1d;padding:10px 14px;margin-bottom:20px;font-size:13px;line-height:1.5;color:#4a3f33;font-style:italic">
        <strong>Critérios de Avaliação:</strong> Esta rubrica orienta a avaliação com base em níveis de proficiência observáveis. Marque com um [X] o nível que melhor descreve o desempenho do estudante em cada critério.
    </div>
    `;

    let rowsHTML = '';

    if (tipo === 'seminario') {
        const rows = [
            {
                criterio: '1. Domínio do Conteúdo & Conceitos Históricos',
                peso: '(Peso: 2,5)',
                n1: 'Apresenta informações incorretas, demonstrando pouca leitura prévia do tema.',
                n2: 'Apresenta fatos de forma superficial, dependendo exclusivamente da leitura de slides.',
                n3: 'Explica os conceitos com segurança, contextualiza os fatos e responde às dúvidas com clareza.',
                n4: 'Demonstra domínio aprofundado, articula fontes históricas e estabelece relações críticas interdisciplinares.'
            },
            {
                criterio: '2. Postura, Articulação Oral e Clareza',
                peso: '(Peso: 2,5)',
                n1: 'Tom de voz inaudível, fala desarticulada e sem contato visual com a turma.',
                n2: 'Voz baixa em alguns momentos, postura rígida e leitura excessiva de anotações.',
                n3: 'Boa dicção, volume adequado, postura confiante e diálogo harmonioso com os ouvintes.',
                n4: 'Expressão oral exemplar, entusiasmo, uso expressivo da linguagem e engajamento total da turma.'
            },
            {
                criterio: '3. Uso de Recursos Visuais & Slides',
                peso: '(Peso: 2,5)',
                n1: 'Ausência de recursos visuais ou slides poluídos com excesso de texto ilegível.',
                n2: 'Slides simples com textos longos; imagens pouco integradas à explicação oral.',
                n3: 'Slides bem diagramados, imagens pertinentes, fontes visíveis e bom equilíbrio estético.',
                n4: 'Recursos visuais criativos e elegantes (mapas, fotos históricas, gráficos) que enriquecem o raciocínio.'
            },
            {
                criterio: '4. Trabalho Coletivo & Gestão do Tempo',
                peso: '(Peso: 2,5)',
                n1: 'Falta de sincronia; membros do grupo desinformados; estouro grave do tempo regulamentar.',
                n2: 'Divisão fragmentada da fala; um membro fala muito mais que os outros; controle parcial do tempo.',
                n3: 'Participação equilibrada de todos os integrantes com respeito ao tempo limite estipulado.',
                n4: 'Excelente coesão de equipe, transições fluidas entre falas e perfeito gerenciamento do tempo.'
            }
        ];

        rowsHTML = rows.map(r => `
            <tr>
                <td style="padding:10px 12px;border:1px solid #d8cfbe;background:#fbf9f5;width:24%">
                    <strong style="color:#3b2818;font-size:13px">${r.criterio}</strong><br>
                    <small style="color:#8c3b1d;font-weight:700">${r.peso}</small>
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#854d0e;margin-bottom:4px">[ &nbsp; ] Inicial (1,0)</div>
                    ${r.n1}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#1e40af;margin-bottom:4px">[ &nbsp; ] Em Desenv. (1,5)</div>
                    ${r.n2}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#15803d;margin-bottom:4px">[ &nbsp; ] Proficiente (2,0)</div>
                    ${r.n3}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#8c3b1d;margin-bottom:4px">[ &nbsp; ] Avançado (2,5)</div>
                    ${r.n4}
                </td>
            </tr>
        `).join('');
    } else if (tipo === 'redacao') {
        const rows = [
            {
                criterio: 'I. Adequação Temática e Tipologia',
                peso: '(2,5 pts)',
                n1: 'Fuga ao tema proposto ou estrutura totalmente alheia ao texto dissertativo-argumentativo.',
                n2: 'Tangencia o tema ou apresenta traços excessivos de narração/relato sem tese definida.',
                n3: 'Desenvolve o tema de forma consistente com tese clara e argumentos organizados.',
                n4: 'Abordagem autoral, aprofundada, com ampla compreensão temática e tese bem fundamentada.'
            },
            {
                criterio: 'II. Domínio da Norma Padrão da Língua',
                peso: '(2,5 pts)',
                n1: 'Erros frequentes de concordância, regência, acentuação e vocabulário muito informal.',
                n2: 'Alguns desvios gramaticais e de pontuação que dificultam parcialmente a leitura fluida.',
                n3: 'Estrutura sintática adequada com vocabulário preciso e poucos desvios gramaticais.',
                n4: 'Excelente domínio sintático, pontuação expressiva, vocabulário refinado e sem desvios.'
            },
            {
                criterio: 'III. Coesão, Coerência e Repertório',
                peso: '(2,5 pts)',
                n1: 'Ideias desconexas, sem conectivos adequados e com contradições internas.',
                n2: 'Uso repetitivo de conectivos; repertório restrito ao senso comum ou cópia da proposta.',
                n3: 'Boa articulação entre parágrafos, conectivos diversificados e repertório legitimado.',
                n4: 'Encadeamento argumentativo brilhante, uso produtivo de repertório histórico/cultural.'
            },
            {
                criterio: 'IV. Proposta de Intervenção Cidadã',
                peso: '(2,5 pts)',
                n1: 'Ausência de proposta ou elaboração de intervenção que desrespeita os direitos humanos.',
                n2: 'Proposta vaga, sem especificar agente, ação concreta ou meio de realização.',
                n3: 'Proposta clara com agente, ação e finalidade social articulada à discussão do texto.',
                n4: 'Intervenção detalhada, viável, inovadora, com desdobramentos práticos para a comunidade.'
            }
        ];

        rowsHTML = rows.map(r => `
            <tr>
                <td style="padding:10px 12px;border:1px solid #d8cfbe;background:#fbf9f5;width:24%">
                    <strong style="color:#3b2818;font-size:13px">${r.criterio}</strong><br>
                    <small style="color:#8c3b1d;font-weight:700">${r.peso}</small>
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#854d0e;margin-bottom:4px">[ &nbsp; ] Inicial (1,0)</div>
                    ${r.n1}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#1e40af;margin-bottom:4px">[ &nbsp; ] Em Desenv. (1,5)</div>
                    ${r.n2}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#15803d;margin-bottom:4px">[ &nbsp; ] Proficiente (2,0)</div>
                    ${r.n3}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#8c3b1d;margin-bottom:4px">[ &nbsp; ] Avançado (2,5)</div>
                    ${r.n4}
                </td>
            </tr>
        `).join('');
    } else {
        // Matriz versátil de pesquisa / prática / personalizada
        const rows = [
            {
                criterio: '1. Compreensão do Problema & Pesquisa',
                peso: '(2,5 pts)',
                n1: 'Compreensão insuficiente dos objetivos propostos.',
                n2: 'Compreensão parcial; atende aos requisitos básicos com lacunas.',
                n3: 'Compreende com clareza o problema e apresenta dados consistentes.',
                n4: 'Compreensão aprofundada, análise crítica e busca proativa de fontes.'
            },
            {
                criterio: '2. Metodologia & Desenvolvimento',
                peso: '(2,5 pts)',
                n1: 'Não segue passos lógicos ou etapas planejadas.',
                n2: 'Aplica a metodologia de forma hesitante com inconsistências.',
                n3: 'Aplica métodos adequados, organizando o raciocínio com clareza.',
                n4: 'Metodologia exemplar, criatividade na solução e rigor investigativo.'
            },
            {
                criterio: '3. Comunicação & Qualidade da Entrega',
                peso: '(2,5 pts)',
                n1: 'Entrega desorganizada, ilegível ou incompleta.',
                n2: 'Entrega aceitável, mas com formatação confusa ou erros conceituais.',
                n3: 'Trabalho bem estruturado, redação clara e apresentação limpa.',
                n4: 'Apresentação primorosa, acabamento editorial impecável e expressivo.'
            },
            {
                criterio: '4. Autonomia & Participação Cidadã',
                peso: '(2,5 pts)',
                n1: 'Passividade constante, depende de auxílio para todas as ações.',
                n2: 'Participa mediante solicitação, interagindo timidamente com o grupo.',
                n3: 'Colaborativo, responsável com prazos e receptivo a feedbacks.',
                n4: 'Liderança positiva, protagonismo estudantil e engajamento transformador.'
            }
        ];

        rowsHTML = rows.map(r => `
            <tr>
                <td style="padding:10px 12px;border:1px solid #d8cfbe;background:#fbf9f5;width:24%">
                    <strong style="color:#3b2818;font-size:13px">${r.criterio}</strong><br>
                    <small style="color:#8c3b1d;font-weight:700">${r.peso}</small>
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#854d0e;margin-bottom:4px">[ &nbsp; ] Inicial (1,0)</div>
                    ${r.n1}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#1e40af;margin-bottom:4px">[ &nbsp; ] Em Desenv. (1,5)</div>
                    ${r.n2}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#15803d;margin-bottom:4px">[ &nbsp; ] Proficiente (2,0)</div>
                    ${r.n3}
                </td>
                <td style="padding:8px 10px;border:1px solid #d8cfbe;font-size:12px;line-height:1.5;width:19%">
                    <div style="font-weight:700;color:#8c3b1d;margin-bottom:4px">[ &nbsp; ] Avançado (2,5)</div>
                    ${r.n4}
                </td>
            </tr>
        `).join('');
    }

    return `
    ${headerHTML}

    <table style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #d8cfbe">
        <thead>
            <tr style="background:#ede6da;font-family:'Cinzel',serif;color:#3b2818;font-size:12px">
                <th style="padding:10px;border:1px solid #d8cfbe;text-align:left">Dimensão Avaliada</th>
                <th style="padding:10px;border:1px solid #d8cfbe;text-align:center">Nível 1 · Inicial</th>
                <th style="padding:10px;border:1px solid #d8cfbe;text-align:center">Nível 2 · Em Desenv.</th>
                <th style="padding:10px;border:1px solid #d8cfbe;text-align:center">Nível 3 · Proficiente</th>
                <th style="padding:10px;border:1px solid #d8cfbe;text-align:center">Nível 4 · Avançado</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHTML}
        </tbody>
    </table>

    <div style="margin-top:20px;padding:14px;border:1px solid #d8cfbe;background:#fdfbf7;border-radius:4px">
        <h4 style="font-family:'Cinzel',serif;font-size:13px;color:#8c3b1d;margin:0 0 8px">
            PARECER PEDAGÓGICO & DEVOLUTIVA FORMATIVA (FEEDBACK DO PROFESSOR):
        </h4>
        <div style="font-size:13px;color:#5c5042;line-height:1.6;margin-bottom:6px">
            <strong>Pontos de Destaque / Conquistas:</strong>
        </div>
        <div style="border-bottom:1px dashed #bdaea0;height:22px;margin:4px 0"></div>
        <div style="border-bottom:1px dashed #bdaea0;height:22px;margin:4px 0"></div>

        <div style="font-size:13px;color:#5c5042;line-height:1.6;margin:14px 0 6px">
            <strong>Orientações para Próximos Passos e Aperfeiçoamento:</strong>
        </div>
        <div style="border-bottom:1px dashed #bdaea0;height:22px;margin:4px 0"></div>
        <div style="border-bottom:1px dashed #bdaea0;height:22px;margin:4px 0"></div>

        <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:14px;border-top:1px solid #e2d9cd;font-size:12px;color:#7a6b5c">
            <span>Visto do Professor: ___________________________</span>
            <span>Ciente do Estudante / Responsável: ___________________________</span>
        </div>
    </div>
    `;
}

return {RUBRIC_TEMPLATES,generateRubricHTML};
})();
const __meridian_16 = (() => {
// Calculadora Inteligente de Recuperação na Planilha Escolar
// Desenvolvido para o Escola Office · Suíte Educacional Livre

const { FormulaEngine, parseAddress, address, columnName, columnIndex } = __meridian_10;
function analyzeRecovery(workbook, sheetId, opts = {}) {
    const sheet = workbook.sheets.find(s => s.id === sheetId) || workbook.sheets[0];
    const engine = new FormulaEngine(workbook);
    const mediaCorte = Number(opts.mediaCorte ?? 6.0);
    const mediaFinalMin = Number(opts.mediaFinalMin ?? 5.0);

    // Detectar linhas de alunos e colunas de dados
    let headerRow = 4; // Padrão da linha 4
    let mediaCol = 'F';
    let nomeCol = 'A';

    // Varre células para encontrar possíveis cabeçalhos de Média e Estudante
    for (const [ref, cell] of Object.entries(sheet.cells)) {
        const text = String(cell.v || '').toUpperCase();
        if (text.includes('MÉDIA') || text.includes('MEDIA')) {
            const p = parseAddress(ref);
            headerRow = p.r + 1;
            mediaCol = columnName(p.c);
            break;
        }
    }

    const students = [];
    const rowsFound = new Set();

    for (const [ref, cell] of Object.entries(sheet.cells)) {
        let p;
        try { p = parseAddress(ref); } catch { continue; }
        if (p.r < headerRow) continue; // Acima do cabeçalho
        if (columnName(p.c) === nomeCol && cell.v && !rowsFound.has(p.r)) {
            const valStr = String(cell.v).trim();
            // Evita linhas de totais ou indicadores
            if (valStr.toUpperCase().includes('TOTAL') || 
                valStr.toUpperCase().includes('MÉDIA') || 
                valStr.toUpperCase().includes('INDICADOR') || 
                valStr.toUpperCase().includes('META')) {
                continue;
            }
            rowsFound.add(p.r);
            students.push({
                row: p.r + 1,
                nome: valStr
            });
        }
    }

    // Ordenar por linha
    students.sort((a, b) => a.row - b.row);

    const aprovados = [];
    const recuperacao = [];

    for (const st of students) {
        const mediaRef = `${mediaCol}${st.row}`;
        const rawMedia = engine.get(sheet.id, mediaRef);
        const mediaNum = Number(rawMedia);

        if (!isNaN(mediaNum)) {
            st.media = Math.round(mediaNum * 10) / 10;
            if (st.media >= mediaCorte) {
                aprovados.push(st);
            } else {
                // Cálculo: (MediaAnual + ProvaFinal) / 2 >= mediaFinalMin
                // ProvaFinal >= (mediaFinalMin * 2) - MediaAnual
                const necessaria = Math.max(0, Math.round(((mediaFinalMin * 2) - st.media) * 10) / 10);
                st.notaNecessaria = necessaria;
                st.viavel = necessaria <= 10.0;
                recuperacao.push(st);
            }
        }
    }

    const total = students.length;
    const taxaAprovacao = total > 0 ? Math.round((aprovados.length / total) * 100) : 0;

    return {
        total,
        headerRow,
        mediaCol,
        nomeCol,
        mediaCorte,
        mediaFinalMin,
        aprovados,
        recuperacao,
        taxaAprovacao
    };
}

function applyRecoveryToSheet(sheet, analysis, opts = {}) {
    const rH = analysis.headerRow;
    const mediaCol = analysis.mediaCol;
    const mediaFinalMin = Number(opts.mediaFinalMin ?? 5.0);

    // Definir colunas H, I, J para Recuperação
    sheet.widths = sheet.widths || {};
    sheet.widths[7] = 135; // Coluna H
    sheet.widths[8] = 130; // Coluna I
    sheet.widths[9] = 145; // Coluna J

    // Cabeçalhos
    sheet.cells[`H${rH}`] = { v: 'Recuperação Final', s: { b: true, fill: '#f5ebe1', color: '#8c3b1d' } };
    sheet.cells[`I${rH}`] = { v: 'Nota Necessária', s: { b: true, fill: '#f5ebe1', color: '#8c3b1d' } };
    sheet.cells[`J${rH}`] = { v: 'Resultado Final', s: { b: true, fill: '#f5ebe1', color: '#8c3b1d' } };

    // Injetar fórmulas para os estudantes
    const recupSet = new Set(analysis.recuperacao.map(s => s.row));

    for (const s of [...analysis.aprovados, ...analysis.recuperacao]) {
        const r = s.row;
        const isRecup = recupSet.has(r);

        // H: Célula vazia pronta para o lançamento
        if (!sheet.cells[`H${r}`]?.v) {
            sheet.cells[`H${r}`] = { v: '', s: { fmt: 'number', fill: isRecup ? '#fdfbf7' : '#ffffff' } };
        }

        // I: Fórmula viva da nota necessária
        sheet.cells[`I${r}`] = {
            v: `=IF(${mediaCol}${r}>=${analysis.mediaCorte}, 0, ROUND(MAX(0, (${mediaFinalMin}*2) - ${mediaCol}${r}), 1))`,
            s: { b: true, fmt: 'number', fill: isRecup ? '#fdf3ed' : '#ffffff', color: isRecup ? '#8c3b1d' : '#2e2820' }
        };

        // J: Fórmula da situação final
        sheet.cells[`J${r}`] = {
            v: `=IF(${mediaCol}${r}>=${analysis.mediaCorte},"Aprovado Direto",IF(H${r}="","Em Recuperação",IF(ROUND((${mediaCol}${r}+H${r})/2,1)>=${mediaFinalMin},"Aprovado na Recup.","Reprovado")))`,
            s: { b: true, fill: isRecup ? '#fdf3ed' : '#ffffff', color: isRecup ? '#8c3b1d' : '#2d6a4f' }
        };

        // Destaque visual suave para quem está em recuperação
        if (isRecup) {
            const currentMediaCell = sheet.cells[`${mediaCol}${r}`];
            if (currentMediaCell) {
                currentMediaCell.s = { ...currentMediaCell.s, fill: '#faeae6', color: '#8c3b1d', b: true };
            }
        }
    }
}

function formatRecoveryReport(analysis, info = {}) {
    const escola = info.escola || 'Escola Municipal de Ensino Fundamental';
    const disciplina = info.disciplina || 'História';
    const turma = info.turma || '9º Ano';

    let txt = `📋 CONVOCAÇÃO & RELATÓRIO DE RECUPERAÇÃO FINAL (2026)\n`;
    txt += `Unidade Escolar: ${escola}\n`;
    txt += `Disciplina: ${disciplina} | Turma: ${turma}\n`;
    txt += `Critério: Média Anual mínima: ${analysis.mediaCorte} | Média Final com Prova: ${analysis.mediaFinalMin}\n`;
    txt += `--------------------------------------------------------\n`;
    txt += `📊 Desempenho Geral: ${analysis.total} Estudantes Avaliados\n`;
    txt += `• Aprovados Diretos: ${analysis.aprovados.length} (${analysis.taxaAprovacao}%)\n`;
    txt += `• Em Recuperação Final: ${analysis.recuperacao.length} (${100 - analysis.taxaAprovacao}%)\n`;
    txt += `--------------------------------------------------------\n`;

    if (analysis.recuperacao.length === 0) {
        txt += `🎉 Parabéns! Nenhum estudante da turma ficou em recuperação.\n`;
    } else {
        txt += `ESTUDANTES CONVOCADOS E PONTUAÇÃO NECESSÁRIA:\n`;
        analysis.recuperacao.forEach((s, idx) => {
            const num = String(idx + 1).padStart(2, '0');
            const obs = s.viavel ? `precisa de nota ${s.notaNecessaria}` : `situação crítica (> 10,0)`;
            txt += `${num}. ${s.nome} — Média Anual: ${s.media.toFixed(1)} ➔ ${obs} na Prova Final\n`;
        });
    }

    txt += `--------------------------------------------------------\n`;
    txt += `Data da Prova de Recuperação: ____/____/2026\n`;
    txt += `Prof. Responsável: ${info.professor || 'Prof. Sérgio Araújo'}\n`;

    return txt;
}

return {analyzeRecovery,applyRecoveryToSheet,formatRecoveryReport};
})();
const __meridian_17 = (() => {
const { escapeHTML, download } = __meridian_1;
const { icon } = __meridian_2;
const { exportDOCX, exportXLSX, exportPPTX, writerHTML } = __meridian_12;
/**
 * Coleta os dados binários e metadados do documento ativo para envio via WhatsApp.
 */
function getWhatsAppPackage(app) {
    app.flushEdits();
    const state = app.store.state;
    const active = app.active;

    if (active === 'writer') {
        const title = (state.writer.title || 'Caderno de Estudos').trim();
        const safeName = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Documento_Escolar';
        const bytes = exportDOCX(state.writer);
        const fileName = `${safeName}.docx`;
        const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const message = `*Escola Office — Documento Pedagógico* 📄\n*Título:* ${title}\n*Páginas:* ${state.writer.pages.length}\n*Autor:* Prof. Sérgio Araújo\n\nSegue anexo o documento oficial formatado em Microsoft Word (.docx).`;
        return {
            title,
            fileName,
            bytes,
            mime,
            formatLabel: 'Microsoft Word (.docx)',
            iconType: 'file',
            color: '#1a5fb4',
            summary: `${state.writer.pages.length} página(s) com texto e formatação`,
            message
        };
    } else if (active === 'grid') {
        const title = (state.workbook.title || 'Diário de Notas e Cálculos').trim();
        const safeName = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Planilha_Escolar';
        const bytes = exportXLSX(state.workbook);
        const fileName = `${safeName}.xlsx`;
        const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const sheetNames = state.workbook.sheets.map(s => s.name).join(', ');
        const message = `*Escola Office — Planilha de Notas e Indicadores* 📊\n*Título:* ${title}\n*Abas:* ${sheetNames}\n*Autor:* Prof. Sérgio Araújo\n\nSegue anexa a planilha oficial formatada em Microsoft Excel (.xlsx) com fórmulas vivas.`;
        return {
            title,
            fileName,
            bytes,
            mime,
            formatLabel: 'Microsoft Excel (.xlsx)',
            iconType: 'table',
            color: '#26a269',
            summary: `${state.workbook.sheets.length} aba(s) com notas e fórmulas preservadas`,
            message
        };
    } else {
        const title = (state.deck.title || 'Apresentação Pedagógica').trim();
        const safeName = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Apresentacao_Escolar';
        const bytes = exportPPTX(state.deck);
        const fileName = `${safeName}.pptx`;
        const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        const message = `*Escola Office — Apresentação Pedagógica* 📽️\n*Tema:* ${title}\n*Slides:* ${state.deck.slides.length}\n*Autor:* Prof. Sérgio Araújo\n\nSegue anexa a apresentação formatada em PowerPoint (.pptx).`;
        return {
            title,
            fileName,
            bytes,
            mime,
            formatLabel: 'PowerPoint (.pptx)',
            iconType: 'slide',
            color: '#e66100',
            summary: `${state.deck.slides.length} slide(s) visuais editáveis`,
            message
        };
    }
}

/**
 * Abre o diálogo de exportação inteligente e envio para o WhatsApp.
 */
function openWhatsAppDialog(app) {
    const pkg = getWhatsAppPackage(app);
    const hasWebShareFiles = typeof navigator !== 'undefined' && 
        typeof navigator.share === 'function' && 
        typeof navigator.canShare === 'function';

    const modalHTML = `
        <div class="whatsapp-dialog">
            <!-- Cabeçalho de Destaque -->
            <div class="whatsapp-banner" style="display:flex;align-items:center;gap:14px;padding:16px;background:linear-gradient(135deg, #128c7e, #25d366);color:#fff;border-radius:10px;margin-bottom:18px">
                <div style="width:42px;height:42px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0">
                    <span style="display:flex">${icon('whatsapp')}</span>
                </div>
                <div style="flex:1">
                    <strong style="font-size:16px;display:block">Enviar para Coordenador ou Colega</strong>
                    <small style="opacity:0.95;font-size:12px">O arquivo é gerado no formato nativo oficial (.docx, .xlsx ou .pptx) sem perda de qualidade ou estrutura.</small>
                </div>
            </div>

            <!-- Informações do Arquivo Pronto -->
            <div style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
                <div style="width:40px;height:40px;background:var(--panel);border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;color:${pkg.color};flex-shrink:0">
                    ${icon(pkg.iconType)}
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHTML(pkg.fileName)}">${escapeHTML(pkg.fileName)}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHTML(pkg.formatLabel)} · ${escapeHTML(pkg.summary)}</div>
                </div>
                <span class="pill" style="background:rgba(37,211,102,0.15);color:#128c7e;font-weight:600;font-size:11px;padding:4px 9px;border-radius:12px;white-space:nowrap">
                    100% Compatível
                </span>
            </div>

            <!-- Campo Opcional de Telefone do Coordenador -->
            <label class="field" style="margin-bottom:16px">
                <span style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Número do WhatsApp do Destinatário (Opcional)</span>
                <input id="wa-phone" placeholder="Ex: 71 99999-8888 ou deixe em branco para escolher a conversa" maxlength="20" style="width:100%;padding:9px 12px;font-size:13px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)">
                <small style="font-size:11px;color:var(--muted);display:block;margin-top:4px">Se deixar em branco, o WhatsApp abrirá sua lista de conversas para você escolher.</small>
            </label>

            <!-- Ações Principais -->
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px">
                <button type="button" id="wa-send-btn" class="btn" style="background:#25d366;color:#fff;font-weight:700;padding:12px 18px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:14px;box-shadow:0 2px 8px rgba(37,211,102,0.3)">
                    ${icon('whatsapp')} Enviar Arquivo pelo WhatsApp
                </button>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <button type="button" id="wa-download-btn" class="btn outlined" style="padding:10px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px">
                        ${icon('download')} Baixar Arquivo
                    </button>
                    <button type="button" id="wa-copy-btn" class="btn outlined" style="padding:10px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px">
                        ${icon('copy')} Copiar Mensagem
                    </button>
                </div>
            </div>

            <!-- Guia de 2 Passos para Computador -->
            <div style="background:var(--panel);border:1px dashed var(--line);border-radius:8px;padding:12px 14px;font-size:12px;line-height:1.5;color:var(--ink)">
                <strong style="color:var(--brand);display:block;margin-bottom:6px">💡 Como funciona no Computador e no Celular:</strong>
                <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:6px">
                    <span style="font-weight:700;color:#128c7e">📱 No Celular:</span>
                    <span>Ao tocar em <strong>Enviar</strong>, abre a lista do WhatsApp. Escolha o coordenador e o arquivo já vai em anexo!</span>
                </div>
                <div style="display:flex;gap:10px;align-items:flex-start">
                    <span style="font-weight:700;color:#128c7e">💻 No Computador:</span>
                    <span>O arquivo é baixado e o WhatsApp Web é aberto. Na conversa, basta <strong>arrastar o arquivo baixado</strong> para a tela ou clicar no clipe 📎 <em>Documento</em>.</span>
                </div>
            </div>
        </div>

        <div class="modal-footer" style="margin-top:20px">
            <button class="btn" data-close>Fechar</button>
        </div>
    `;

    app.modal('Compartilhar no WhatsApp', modalHTML, modal => {
        const phoneInput = modal.querySelector('#wa-phone');
        const sendBtn = modal.querySelector('#wa-send-btn');
        const downloadBtn = modal.querySelector('#wa-download-btn');
        const copyBtn = modal.querySelector('#wa-copy-btn');

        // Formata número de telefone para WhatsApp
        const sanitizePhone = val => {
            let digits = String(val || '').replace(/\D/g, '');
            if (!digits) return '';
            if (digits.length <= 11 && !digits.startsWith('55')) {
                digits = '55' + digits;
            }
            return digits;
        };

        // Ação de download direto
        const performDownload = () => {
            download(pkg.fileName, pkg.bytes, pkg.mime);
            app.notify(`Arquivo "${pkg.fileName}" baixado com sucesso!`);
        };

        // Ação de cópia do texto
        const performCopy = async () => {
            try {
                await navigator.clipboard.writeText(pkg.message);
                app.notify('Mensagem pedagógica copiada para a área de transferência!');
            } catch {
                app.notify('Não foi possível copiar automaticamente.', true);
            }
        };

        // Ação Principal: Enviar
        sendBtn.onclick = async () => {
            const rawPhone = phoneInput.value.trim();
            const phone = sanitizePhone(rawPhone);

            // Cria o objeto de arquivo
            let file = null;
            try {
                file = new File([pkg.bytes], pkg.fileName, { type: pkg.mime });
            } catch {
                file = null;
            }

            // Tenta Web Share API de arquivos (Nativo no Celular Android/iOS ou navegadores com suporte)
            if (hasWebShareFiles && file && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: pkg.title,
                        text: pkg.message,
                        files: [file]
                    });
                    app.notify('Arquivo enviado via WhatsApp com sucesso!');
                    app.closeModal();
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return; // Usuário cancelou a tela nativa
                    console.warn('Web Share falhou, usando modo web alternativo:', err);
                }
            }

            // Modo Computador / Web WhatsApp:
            // 1. Baixa o arquivo para o computador
            performDownload();

            // 2. Prepara a URL do WhatsApp
            const textParam = encodeURIComponent(pkg.message);
            const waUrl = phone 
                ? `https://api.whatsapp.com/send?phone=${phone}&text=${textParam}`
                : `https://web.whatsapp.com/send?text=${textParam}`;

            // Abre o WhatsApp em uma nova aba
            window.open(waUrl, '_blank');
            app.notify('WhatsApp aberto! O arquivo foi baixado para você anexar na conversa.');
        };

        downloadBtn.onclick = performDownload;
        copyBtn.onclick = performCopy;
    });
}

return {getWhatsAppPackage,openWhatsAppDialog};
})();
const __meridian_18 = (() => {
const { escapeHTML, download } = __meridian_1;
const { icon } = __meridian_2;
const { exportDOCX, exportXLSX, exportPPTX } = __meridian_12;
/**
 * Coleta os dados binários e metadados do documento ativo formatado para o Google Workspace (Google Drive).
 */
function getDrivePackage(app) {
    app.flushEdits();
    const state = app.store.state;
    const active = app.active;

    if (active === 'writer') {
        const title = (state.writer.title || 'Caderno de Estudos').trim();
        const safeName = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Documento_Escolar';
        const bytes = exportDOCX(state.writer);
        const fileName = `${safeName}.docx`;
        const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        return {
            title,
            fileName,
            bytes,
            mime,
            formatLabel: 'Compatível com Google Docs',
            googleAppName: 'Google Docs',
            iconType: 'file',
            color: '#4285f4',
            summary: `${state.writer.pages.length} página(s) · Formato .docx nativo editável no Docs`,
            driveUrl: 'https://docs.google.com'
        };
    } else if (active === 'grid') {
        const title = (state.workbook.title || 'Diário de Notas e Cálculos').trim();
        const safeName = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Planilha_Escolar';
        const bytes = exportXLSX(state.workbook);
        const fileName = `${safeName}.xlsx`;
        const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        return {
            title,
            fileName,
            bytes,
            mime,
            formatLabel: 'Compatível com Google Planilhas (Sheets)',
            googleAppName: 'Google Sheets',
            iconType: 'table',
            color: '#0f9d58',
            summary: `${state.workbook.sheets.length} aba(s) · Formato .xlsx com fórmulas vivas no Sheets`,
            driveUrl: 'https://sheets.google.com'
        };
    } else {
        const title = (state.deck.title || 'Apresentação Pedagógica').trim();
        const safeName = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Apresentacao_Escolar';
        const bytes = exportPPTX(state.deck);
        const fileName = `${safeName}.pptx`;
        const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        return {
            title,
            fileName,
            bytes,
            mime,
            formatLabel: 'Compatível com Google Apresentações (Slides)',
            googleAppName: 'Google Slides',
            iconType: 'slide',
            color: '#f4b400',
            summary: `${state.deck.slides.length} slide(s) · Formato .pptx editável no Slides`,
            driveUrl: 'https://slides.google.com'
        };
    }
}

/**
 * Abre o diálogo de exportação e sincronização com o Google Drive.
 */
function openGoogleDriveDialog(app) {
    const pkg = getDrivePackage(app);
    const hasWebShareFiles = typeof navigator !== 'undefined' && 
        typeof navigator.share === 'function' && 
        typeof navigator.canShare === 'function';

    const modalHTML = `
        <div class="google-drive-dialog">
            <!-- Cabeçalho de Destaque Google Drive -->
            <div class="drive-banner" style="display:flex;align-items:center;gap:14px;padding:16px;background:linear-gradient(135deg, #1a73e8, #0f9d58);color:#fff;border-radius:10px;margin-bottom:18px">
                <div style="width:44px;height:44px;background:rgba(255,255,255,0.22);display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0">
                    <span style="display:flex">${icon('drive')}</span>
                </div>
                <div style="flex:1">
                    <strong style="font-size:16px;display:block">Exportar para o Google Drive</strong>
                    <small style="opacity:0.95;font-size:12px">Salve na nuvem do Google e abra diretamente no ${escapeHTML(pkg.googleAppName)} com 100% de formatação preservada.</small>
                </div>
            </div>

            <!-- Informações do Arquivo Pronto -->
            <div style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:14px;margin-bottom:18px;display:flex;align-items:center;gap:14px">
                <div style="width:40px;height:40px;background:var(--panel);border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;color:${pkg.color};flex-shrink:0">
                    ${icon(pkg.iconType)}
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHTML(pkg.fileName)}">${escapeHTML(pkg.fileName)}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHTML(pkg.formatLabel)} · ${escapeHTML(pkg.summary)}</div>
                </div>
            </div>

            <!-- Opções Principais -->
            <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:18px">
                <!-- Ação 1: Download Imediato + Abrir Google Drive Web -->
                <button class="btn primary" id="btn-drive-download-open" style="padding:14px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:14px;background:linear-gradient(135deg, #1a73e8, #185abc);border:none;box-shadow:0 2px 8px rgba(26,115,232,0.3)">
                    ${icon('drive')} <strong>Baixar Arquivo e Abrir Google Drive</strong>
                </button>

                <!-- Ação 2: Compartilhar diretamente com o app Google Drive via Web Share API -->
                <button class="btn outlined" id="btn-drive-share" style="padding:12px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px">
                    ${icon('export')} <span>Enviar direto para o aplicativo Drive no celular/computador</span>
                </button>

                <!-- Ação 3: Imprimir / Salvar como PDF para o Google Drive -->
                <button class="btn outlined" id="btn-drive-pdf" style="padding:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:var(--muted)">
                    ${icon('print')} <span>Salvar cópia em PDF para o Drive</span>
                </button>
            </div>

            <!-- Instruções Passo a Passo -->
            <div style="background:rgba(26,115,232,0.05);border:1px solid rgba(26,115,232,0.2);border-radius:8px;padding:12px 14px">
                <div style="font-weight:700;font-size:12px;color:#1a73e8;margin-bottom:6px;display:flex;align-items:center;gap:6px">
                    ${icon('sparkle')} Como funciona no Google Drive:
                </div>
                <ol style="margin:0;padding-left:18px;font-size:11.5px;color:var(--text);line-height:1.6">
                    <li>Ao clicar no botão azul acima, o arquivo é baixado no seu computador no padrão oficial do Google Workspace.</li>
                    <li>A página do seu <strong>Google Drive</strong> abrirá automaticamente em uma nova aba.</li>
                    <li>Arraste o arquivo baixado para sua pasta escolar no Drive. Ele abrirá diretamente com edição completa no <strong>${escapeHTML(pkg.googleAppName)}</strong>!</li>
                </ol>
            </div>

            <div class="modal-footer" style="margin-top:16px;margin-bottom:0">
                <button class="btn" data-close>Fechar</button>
            </div>
        </div>
    `;

    app.modal('Google Drive · Escola Office', modalHTML, modal => {
        const btnDownloadOpen = modal.querySelector('#btn-drive-download-open');
        const btnShare = modal.querySelector('#btn-drive-share');
        const btnPdf = modal.querySelector('#btn-drive-pdf');

        btnDownloadOpen.onclick = () => {
            download(pkg.fileName, pkg.bytes, pkg.mime);
            app.notify(`Arquivo "${pkg.fileName}" baixado! Abrindo o Google Drive...`);
            setTimeout(() => {
                window.open('https://drive.google.com/drive/u/0/my-drive', '_blank');
            }, 600);
        };

        btnShare.onclick = async () => {
            if (hasWebShareFiles) {
                try {
                    const file = new File([pkg.bytes], pkg.fileName, { type: pkg.mime });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: pkg.title,
                            text: `Documento pedagógico: ${pkg.title} (${pkg.formatLabel})`,
                            files: [file]
                        });
                        app.notify('Arquivo compartilhado com o Google Drive!');
                        return;
                    }
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.warn('Erro no Web Share:', err);
                    }
                }
            }
            download(pkg.fileName, pkg.bytes, pkg.mime);
            app.notify(`Arquivo baixado. Abrindo o Google Drive...`);
            window.open('https://drive.google.com/drive/u/0/my-drive', '_blank');
        };

        btnPdf.onclick = () => {
            app.closeModal();
            setTimeout(() => {
                app.execute('print');
            }, 300);
        };
    });
}

return {getDrivePackage,openGoogleDriveDialog};
})();
const __meridian_19 = (() => {
const { uid, clone, escapeHTML, download } = __meridian_1;
const { icon } = __meridian_2;
const { exportDOCX, exportXLSX, exportPPTX } = __meridian_12;
const { openWhatsAppDialog } = __meridian_17;
const BASKET_STORAGE_KEY = 'escola-office-basket-v1';

/**
 * Gerenciador de armazenamento local da Cestinha (IndexedDB / LocalStorage).
 */
class BasketManager {
    constructor(app) {
        this.app = app;
        this.items = [];
        this.loaded = false;
    }

    async init() {
        if (this.loaded) return;
        try {
            // Tenta carregar do IndexedDB via store 'projects'
            const db = this.app.persistence?.db;
            if (db) {
                const stored = await new Promise((resolve) => {
                    const tx = db.transaction('projects', 'readonly');
                    const req = tx.objectStore('projects').get('basket_items');
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                });
                if (Array.isArray(stored)) {
                    this.items = stored;
                    this.loaded = true;
                    this.updateUI();
                    return;
                }
            }
            // Fallback para localStorage
            const local = localStorage.getItem(BASKET_STORAGE_KEY);
            if (local) {
                this.items = JSON.parse(local);
            }
        } catch {
            this.items = [];
        }
        this.loaded = true;
        this.updateUI();
    }

    async persist() {
        try {
            // Salva no IndexedDB se disponível
            const db = this.app.persistence?.db;
            if (db) {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('projects', 'readwrite');
                    tx.objectStore('projects').put(this.items, 'basket_items');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            }
            // Espelha no localStorage para redundância leve
            try {
                localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(this.items));
            } catch { }
        } catch (e) {
            console.warn('Falha ao persistir Cestinha:', e);
        }
        this.updateUI();
    }

    updateUI() {
        const count = this.items.length;
        document.querySelectorAll('.basket-badge').forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        });
        document.querySelectorAll('.basket-btn').forEach(btn => {
            btn.title = count > 0 
                ? `Cestinha Pedagógica (${count} item${count > 1 ? 's' : ''} guardado${count > 1 ? 's' : ''})`
                : 'Cestinha Pedagógica (vazia)';
        });
    }

    async addItem(item) {
        await this.init();
        this.items.unshift(item);
        if (this.items.length > 50) this.items.pop(); // Limite seguro de 50 itens
        await this.persist();
    }

    async removeItem(id) {
        await this.init();
        this.items = this.items.filter(i => i.id !== id);
        await this.persist();
    }

    async clear() {
        this.items = [];
        await this.persist();
    }
}

/**
 * Guarda o projeto atual na Cestinha.
 */
async function putCurrentProjectInBasket(app, customTitle = null) {
    app.flushEdits();
    const state = app.store.state;
    const active = app.active;
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let kindLabel = 'Documento';
    let iconType = 'file';
    let summary = '';
    let itemTitle = customTitle || state.title || 'Caderno de Estudos';

    if (active === 'writer') {
        kindLabel = 'Documento Escrito';
        iconType = 'file';
        summary = `${state.writer.pages.length} página(s)`;
    } else if (active === 'grid') {
        kindLabel = 'Planilha de Notas';
        iconType = 'table';
        summary = `${state.workbook.sheets.length} aba(s) com fórmulas`;
    } else if (active === 'draw') {
        kindLabel = 'Desenho Vetorial';
        iconType = 'chart';
        summary = `${state.draw?.nodes?.length || 0} objeto(s) vetoriais`;
    } else if (active === 'forms') {
        kindLabel = 'Formulário & Avaliação';
        iconType = 'file';
        summary = `${state.forms?.questions?.length || 0} questão(ões) autogabaritadas`;
    } else {
        kindLabel = 'Apresentação';
        iconType = 'slide';
        summary = `${state.deck.slides.length} slide(s)`;
    }

    const item = {
        id: uid(),
        category: 'project',
        tool: active,
        title: itemTitle,
        kindLabel,
        iconType,
        summary,
        date: dateStr,
        timestamp: Date.now(),
        payload: clone(state)
    };

    if (!app.basket) app.basket = new BasketManager(app);
    await app.basket.addItem(item);
    app.notify(`"${itemTitle}" colocado na Cestinha! Você pode abrir depois a qualquer momento.`);
}

/**
 * Guarda um trecho selecionado na Cestinha (estilo peças/blocos do App Inventor).
 */
async function putSnippetInBasket(app, snippetText, label = null) {
    if (!snippetText || !snippetText.trim()) {
        app.notify('Selecione algum texto ou peça para guardar na Cestinha.', true);
        return;
    }
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const cleanText = snippetText.trim();
    const title = label || cleanText.slice(0, 45) + (cleanText.length > 45 ? '…' : '');

    const item = {
        id: uid(),
        category: 'snippet',
        tool: app.active,
        title,
        kindLabel: 'Peça Pedagógica',
        iconType: 'copy',
        summary: `${cleanText.length} caracteres · Trecho reutilizável`,
        date: dateStr,
        timestamp: Date.now(),
        payload: cleanText
    };

    if (!app.basket) app.basket = new BasketManager(app);
    await app.basket.addItem(item);
    app.notify(`Peça "${title}" guardada na Cestinha!`);
}

/**
 * Renderiza o modal completo da Cestinha Pedagógica.
 */
async function openBasketDialog(app) {
    if (!app.basket) app.basket = new BasketManager(app);
    await app.basket.init();

    const renderDialogContent = (filter = 'all') => {
        let items = app.basket.items;
        if (filter === 'projects') items = items.filter(i => i.category === 'project');
        else if (filter === 'snippets') items = items.filter(i => i.category === 'snippet');
        else if (filter === 'writer') items = items.filter(i => i.tool === 'writer' && i.category === 'project');
        else if (filter === 'grid') items = items.filter(i => i.tool === 'grid' && i.category === 'project');
        else if (filter === 'deck') items = items.filter(i => i.tool === 'deck' && i.category === 'project');

        const hasSelection = Boolean(window.getSelection()?.toString()?.trim());

        return `
            <div class="basket-view" id="basket-content-root">
                <!-- Barra Superior da Cestinha -->
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line)">
                    <div>
                        <strong style="font-size:15px;display:flex;align-items:center;gap:8px">
                            ${icon('basket')} Cestinha Pedagógica
                            <span style="font-size:11px;font-weight:700;background:var(--brand);color:#fff;padding:2px 8px;border-radius:10px">
                                ${app.basket.items.length} ${app.basket.items.length === 1 ? 'item' : 'itens'}
                            </span>
                        </strong>
                        <small style="color:var(--muted);font-size:11px;display:block;margin-top:2px">
                            Guarde arquivos, planos e peças para resgatar a qualquer momento (100% offline).
                        </small>
                    </div>

                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button type="button" id="basket-add-current" class="btn primary" style="font-size:11px;padding:6px 12px">
                            ${icon('plus')} Colocar Trabalho Atual
                        </button>
                        ${hasSelection ? `
                        <button type="button" id="basket-add-selection" class="btn soft" style="font-size:11px;padding:6px 12px">
                            ${icon('copy')} Colocar Seleção
                        </button>` : ''}
                    </div>
                </div>

                <!-- Filtros rápidos -->
                <div class="basket-tabs" style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:4px">
                    <button type="button" class="btn ${filter === 'all' ? 'primary' : 'outlined'}" data-filter="all" style="font-size:11px;height:28px;padding:0 10px">Todos (${app.basket.items.length})</button>
                    <button type="button" class="btn ${filter === 'projects' ? 'primary' : 'outlined'}" data-filter="projects" style="font-size:11px;height:28px;padding:0 10px">Arquivos Completos</button>
                    <button type="button" class="btn ${filter === 'snippets' ? 'primary' : 'outlined'}" data-filter="snippets" style="font-size:11px;height:28px;padding:0 10px">Peças & Trechos</button>
                </div>

                <!-- Lista de Itens da Cestinha -->
                <div class="basket-items-list" style="max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px">
                    ${items.length === 0 ? `
                        <div style="text-align:center;padding:36px 16px;background:var(--panel2);border:1px dashed var(--line);border-radius:8px;color:var(--muted)">
                            <div style="font-size:32px;margin-bottom:8px">🧺</div>
                            <strong style="display:block;color:var(--ink);font-size:14px">Sua Cestinha está vazia neste filtro</strong>
                            <p style="font-size:12px;margin:6px auto 14px;max-width:320px">Clique em <strong>"Colocar Trabalho Atual"</strong> acima para guardar uma cópia do que você está produzindo.</p>
                        </div>
                    ` : items.map(item => `
                        <div class="basket-item-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;transition:transform 0.1s">
                            <div style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--panel);border:1px solid var(--line);color:${item.tool === 'writer' ? '#1a5fb4' : item.tool === 'grid' ? '#26a269' : '#e66100'}">
                                ${icon(item.iconType || 'file')}
                            </div>

                            <div style="flex:1;min-width:0">
                                <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHTML(item.title)}">
                                    ${escapeHTML(item.title)}
                                </div>
                                <div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
                                    <span>${escapeHTML(item.kindLabel)}</span>
                                    <span>•</span>
                                    <span>${escapeHTML(item.summary)}</span>
                                    <span>•</span>
                                    <span>${escapeHTML(item.date)}</span>
                                </div>
                            </div>

                            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                                ${item.category === 'project' ? `
                                    <button type="button" class="btn primary" data-open-project="${item.id}" title="Abrir e carregar este projeto" style="height:30px;padding:0 10px;font-size:11px">
                                        ${icon('folder')} Abrir
                                    </button>
                                ` : `
                                    <button type="button" class="btn primary" data-insert-snippet="${item.id}" title="Copiar / Inserir no documento atual" style="height:30px;padding:0 10px;font-size:11px">
                                        ${icon('paste')} Inserir
                                    </button>
                                `}
                                <button type="button" class="icon-btn btn-delete-basket-item" data-delete-item="${item.id}" title="Excluir da Cestinha" aria-label="Excluir da Cestinha" style="width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border-radius:6px;color:#c01c28;background:rgba(192,28,40,0.06);border:1px solid rgba(192,28,40,0.2)">
                                    ${icon('trash')}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="modal-footer" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between">
                    <div>
                        ${app.basket.items.length > 0 ? `
                        <button type="button" id="basket-clear-all" class="btn" style="color:#c01c28;background:rgba(192,28,40,0.06);border:1px solid rgba(192,28,40,0.2);font-size:11.5px;padding:6px 12px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer">
                            ${icon('trash')} Esvaziar Cestinha
                        </button>` : ''}
                    </div>
                    <button class="btn" data-close>Fechar</button>
                </div>
            </div>
        `;
    };

    app.modal('Cestinha de Arquivos e Peças', renderDialogContent('all'), modal => {
        let currentFilter = 'all';

        const updateDOM = (filter = currentFilter) => {
            currentFilter = filter;
            const root = modal.querySelector('#basket-content-root');
            if (root) {
                root.outerHTML = renderDialogContent(currentFilter);
                bindHandlers();
            }
        };

        const bindHandlers = () => {
            // Filtros
            modal.querySelectorAll('[data-filter]').forEach(btn => {
                btn.onclick = () => updateDOM(btn.dataset.filter);
            });

            // Guardar trabalho atual
            modal.querySelector('#basket-add-current')?.addEventListener('click', async () => {
                await putCurrentProjectInBasket(app);
                updateDOM(currentFilter);
            });

            // Guardar seleção
            modal.querySelector('#basket-add-selection')?.addEventListener('click', async () => {
                const text = window.getSelection()?.toString() || '';
                await putSnippetInBasket(app, text);
                updateDOM(currentFilter);
            });

            // Abrir projeto da cestinha
            modal.querySelectorAll('[data-open-project]').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.openProject;
                    const item = app.basket.items.find(i => i.id === id);
                    if (!item || !item.payload) return;

                    if (confirm(`Deseja abrir "${item.title}" agora? Lembre-se de colocar na Cestinha o trabalho atual se quiser guardá-lo.`)) {
                        app.store.replace(item.payload);
                        if (item.tool && item.tool !== app.active) {
                            app.switchApp(item.tool);
                        }
                        app.closeModal();
                        app.notify(`Projeto "${item.title}" resgatado da Cestinha e aberto com sucesso!`);
                    }
                };
            });

            // Inserir trecho/snippet
            modal.querySelectorAll('[data-insert-snippet]').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.insertSnippet;
                    const item = app.basket.items.find(i => i.id === id);
                    if (!item) return;

                    try {
                        await navigator.clipboard.writeText(String(item.payload));
                        if (app.active === 'writer' && document.execCommand) {
                            document.execCommand('insertText', false, String(item.payload));
                        }
                        app.notify(`Peça "${item.title}" copiada e inserida!`);
                        app.closeModal();
                    } catch {
                        app.notify('Não foi possível inserir automaticamente.', true);
                    }
                };
            });

            // Excluir item individual (lixeirinha)
            modal.querySelectorAll('[data-delete-item]').forEach(btn => {
                btn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = btn.dataset.deleteItem;
                    const item = app.basket.items.find(i => i.id === id);
                    const title = item ? item.title : 'Item';
                    await app.basket.removeItem(id);
                    app.notify(`"${title}" excluído da Cestinha.`);
                    updateDOM(currentFilter);
                };
            });

            // Esvaziar cestinha (limpar tudo)
            const clearAllBtn = modal.querySelector('#basket-clear-all');
            if (clearAllBtn) {
                clearAllBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm('Deseja realmente esvaziar todos os itens da Cestinha?')) {
                        await app.basket.clear();
                        app.notify('Cestinha esvaziada com sucesso.');
                        updateDOM(currentFilter);
                    }
                };
            }
        };

        bindHandlers();
    });
}

return {BasketManager,putCurrentProjectInBasket,putSnippetInBasket,openBasketDialog};
})();
const __meridian_21 = (() => {
/* Retained WebGPU backend with worker-built triangle meshes, 4x MSAA, WGSL gradients,
 * per-object affine uniforms, viewport culling and cached text/image textures.
 * Canvas 2D is an explicitly identified compatibility and PNG-export backend. */
'use strict';
(() => {
    const colorCache = new Map();
    let colorCtx;
    function rgba(css) { if (!css || css === 'none')
        return [0, 0, 0, 0]; if (colorCache.has(css))
        return colorCache.get(css); let a; if (/^#[\da-f]{6}$/i.test(css))
        a = [parseInt(css.slice(1, 3), 16) / 255, parseInt(css.slice(3, 5), 16) / 255, parseInt(css.slice(5, 7), 16) / 255, 1];
    else if (/^#[\da-f]{3}$/i.test(css))
        a = [...css.slice(1)].map(c => parseInt(c + c, 16) / 255).concat(1);
    else {
        const c = colorCtx || (colorCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
        c.clearRect(0, 0, 1, 1);
        c.fillStyle = '#000';
        c.fillStyle = css;
        c.fillRect(0, 0, 1, 1);
        a = Array.from(c.getImageData(0, 0, 1, 1).data, v => v / 255);
    } colorCache.set(css, a); return a; }
    function gradientVector(fill, b) { let a = (fill.angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), ext = Math.max(1, Math.abs(c) * b.w + Math.abs(s) * b.h), gx = c / ext, gy = s / ext; return [gx, gy, .5 - gx * (b.x + b.w / 2) - gy * (b.y + b.h / 2), 0]; }
    function canvasFill(ctx, fill, b) { if (typeof fill === 'object') {
        let a = (fill.angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), ext = Math.max(1, Math.abs(c) * b.w + Math.abs(s) * b.h), x = b.x + b.w / 2, y = b.y + b.h / 2, g = ctx.createLinearGradient(x - c * ext / 2, y - s * ext / 2, x + c * ext / 2, y + s * ext / 2);
        g.addColorStop(0, fill.color0);
        g.addColorStop(1, fill.color1);
        return g;
    } return fill || 'transparent'; }
    function paintText(ctx, n) { ctx.font = `${n.fontStyle || 'normal'} ${n.fontWeight || 400} ${n.fontSize}px ${n.fontFamily || 'Arial'}`; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = canvasFill(ctx, n.fill, V.localBounds(n)); const spacing = n.letterSpacing || 0, lines = String(n.text || '').split('\n'); if ('letterSpacing' in ctx)
        ctx.letterSpacing = spacing + 'px'; lines.forEach((line, i) => { const y = n.fontSize * .91 + i * n.fontSize * n.lineHeight; if (!spacing || 'letterSpacing' in ctx)
        ctx.fillText(line, 0, y);
    else {
        let x = 0;
        for (let ch of line) {
            ctx.fillText(ch, x, y);
            x += ctx.measureText(ch).width + spacing;
        }
    } }); if ('letterSpacing' in ctx)
        ctx.letterSpacing = '0px'; }
    const images = new Map();
    function getImage(src, invalidate) { if (images.has(src))
        return images.get(src); let img = new Image(); img.onload = () => invalidate?.(); img.onerror = () => { img.failed = true; invalidate?.(); }; img.src = src; images.set(src, img); return img; }
    function drawNodeCanvas(ctx, n, invalidate, outline = false) { ctx.save(); ctx.transform(...n.matrix); ctx.globalAlpha = n.opacity ?? 1; let b = V.localBounds(n); if (n.type === 'text') {
        if (!outline && n.fill !== 'none')
            paintText(ctx, n);
        else if (outline) {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = .5;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
        }
    }
    else if (n.type === 'image') {
        let img = getImage(n.src, invalidate);
        if (img.complete && img.naturalWidth)
            ctx.drawImage(img, 0, 0, n.w, n.h);
    }
    else {
        let p = new Path2D(V.pathsToD(V.shapePaths(n)));
        if (!outline && n.fill && n.fill !== 'none') {
            ctx.fillStyle = canvasFill(ctx, n.fill, b);
            ctx.fill(p, n.fillRule || 'nonzero');
        }
        if (outline || n.stroke && n.stroke !== 'none' && n.strokeWidth > 0) {
            ctx.strokeStyle = outline ? '#242424' : n.stroke;
            ctx.lineWidth = outline ? .7 : n.strokeWidth;
            ctx.lineJoin = n.lineJoin || 'round';
            ctx.lineCap = n.lineCap || 'round';
            ctx.miterLimit = n.miterLimit || 4;
            ctx.stroke(p);
        }
    } ctx.restore(); }
    class Camera {
        constructor() { this.zoom = .7; this.x = 80; this.y = 70; this.width = 1000; this.height = 700; }
        world(p) { return V.pt((p.x - this.x) / this.zoom, (p.y - this.y) / this.zoom); }
        screen(p) { return V.pt(p.x * this.zoom + this.x, p.y * this.zoom + this.y); }
        zoomAt(factor, p) { let w = this.world(p); this.zoom = Math.max(.02, Math.min(64, this.zoom * factor)); this.x = p.x - w.x * this.zoom; this.y = p.y - w.y * this.zoom; }
        fit(b, pad = 58) { this.zoom = Math.max(.02, Math.min(8, Math.min((this.width - pad * 2) / Math.max(1, b.w), (this.height - pad * 2) / Math.max(1, b.h)))); this.x = (this.width - b.w * this.zoom) / 2 - b.x * this.zoom + 9; this.y = (this.height - b.h * this.zoom) / 2 - b.y * this.zoom + 9; }
    }
    class MeshService {
        constructor(onResult) { this.onResult = onResult; this.pending = new Map(); this.inFlight = 0; try {
            const embedded = document.getElementById('vectora-worker');
            this.url = embedded ? URL.createObjectURL(new Blob([embedded.textContent], { type: 'text/javascript' })) : null;
            this.worker = new Worker(this.url || new URL('src/geometry-worker.js', document.baseURI));
            this.worker.onmessage = e => { this.inFlight--; onResult(e.data); this.pump(); };
            this.worker.onerror = () => { this.worker?.terminate(); this.worker = null; this.inFlight = 0; onResult({ workerFailure: true }); this.pump(); };
        }
        catch {
            this.worker = null;
        } }
        request(id, key, node, tolerance) { this.pending.set(id, { id, key, node: V.clone(node), tolerance }); this.pump(); }
        pump() { while (this.pending.size && this.inFlight < 2) {
            let [id, data] = this.pending.entries().next().value;
            this.pending.delete(id);
            this.inFlight++;
            if (this.worker)
                this.worker.postMessage(data);
            else
                setTimeout(() => { try {
                    let p = V.flatten(V.shapePaths(data.node), data.tolerance);
                    this.onResult({ ...data, fill: data.node.fill === 'none' ? new Float32Array() : V.tessellate(p, data.node.fillRule), stroke: data.node.stroke === 'none' || !data.node.strokeWidth ? new Float32Array() : V.strokeMesh(p, data.node.strokeWidth, data.node.lineJoin, data.node.lineCap) });
                }
                catch (e) {
                    this.onResult({ ...data, error: e.message });
                }
                finally {
                    this.inFlight--;
                    this.pump();
                } }, 0);
        } }
        destroy() { this.worker?.terminate(); if (this.url)
            URL.revokeObjectURL(this.url); }
    }
    const shader = `
struct Camera { view:vec4f, pan:vec4f }
struct Paint { row0:vec4f, row1:vec4f, color0:vec4f, color1:vec4f, gradient:vec4f, clip:vec4f, options:vec4f }
@group(0) @binding(0) var<uniform> camera:Camera;
@group(1) @binding(0) var<uniform> paint:Paint;
@group(2) @binding(0) var image:texture_2d<f32>;
@group(2) @binding(1) var imageSampler:sampler;
struct VSOut { @builtin(position) position:vec4f, @location(0) local:vec2f, @location(1) uv:vec2f, @location(2) world:vec2f }
@vertex fn vs(@location(0) local:vec2f,@location(1) uv:vec2f)->VSOut {
 var o:VSOut;let world=vec2f(dot(paint.row0.xyz,vec3f(local,1)),dot(paint.row1.xyz,vec3f(local,1)));
 let screen=world*camera.view.z+camera.pan.xy;
 o.position=vec4f(screen.x/camera.view.x*2-1,1-screen.y/camera.view.y*2,0,1);o.local=local;o.uv=uv;o.world=world;return o;
}
@fragment fn fs(i:VSOut)->@location(0) vec4f {
 if(paint.options.x>0.5 && (i.world.x<paint.clip.x || i.world.y<paint.clip.y || i.world.x>paint.clip.z || i.world.y>paint.clip.w)){discard;}
 var c=paint.color0;
 if(paint.row1.w>1.5){c=textureSample(image,imageSampler,i.uv);}
 else if(paint.row1.w>0.5){let t=clamp(dot(i.local,paint.gradient.xy)+paint.gradient.z,0,1);c=mix(paint.color0,paint.color1,t);}
 let alpha=c.a*paint.row0.w;return vec4f(c.rgb*alpha,alpha);
}`;
    class Renderer extends EventTarget {
        constructor({ gpu, fallback, background, store, camera, invalidate }) { super(); Object.assign(this, { canvas: gpu, fallback, background, store, camera, invalidate }); this.cache = new Map(); this.textures = new Map(); this.mode = 'Initializing'; this.stats = { vertices: 0, draws: 0, frameMs: 0 }; this.clip = false; this.outline = false; this.grid = false; this.meshes = new MeshService(data => this.meshReady(data)); this.ready = this.init(); }
        async init() {
            try {
                if (new URLSearchParams(location.search).get('renderer') === 'canvas')
                    throw Error('Canvas renderer selected explicitly');
                if (!navigator.gpu)
                    throw Error('WebGPU is not exposed by this browser');
                const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
                if (!adapter)
                    throw Error('No WebGPU adapter');
                const adapterDetails = adapter.info;
                this.adapterInfo = [adapterDetails?.vendor, adapterDetails?.architecture, adapterDetails?.device, adapterDetails?.description].filter(Boolean).join(' · ') || 'WebGPU adapter';
                if (new URLSearchParams(location.search).get('renderer') !== 'webgpu' && (adapterDetails?.isFallbackAdapter || /swiftshader|lavapipe|llvmpipe|software/i.test(this.adapterInfo)))
                    throw Error('Software GPU detected (' + this.adapterInfo + '). Canvas 2D is preferred for interactive use. Add ?renderer=webgpu to explicitly test the software WebGPU backend.');
                this.device = await adapter.requestDevice();
                this.device.lost.then(info => { this.deviceLost = true; this.reason = info.message || 'GPU device lost'; this.useFallback(); });
                this.device.addEventListener('uncapturederror', e => { console.error('WebGPU validation:', e.error); this.reason = e.error.message; this.useFallback(); });
                const d = this.device;
                this.context = this.canvas.getContext('webgpu');
                if (!this.context)
                    throw Error('Cannot create WebGPU canvas');
                this.format = navigator.gpu.getPreferredCanvasFormat();
                this.context.configure({ device: d, format: this.format, alphaMode: 'premultiplied' });
                this.cameraLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }] });
                this.paintLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 112 } }] });
                this.textureLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }] });
                let module = d.createShaderModule({ code: shader }), info = await module.getCompilationInfo();
                if (info.messages.some(m => m.type === 'error'))
                    throw Error(info.messages.map(m => m.message).join('\n'));
                this.pipeline = await d.createRenderPipelineAsync({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.cameraLayout, this.paintLayout, this.textureLayout] }), vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }, { shaderLocation: 1, offset: 8, format: 'float32x2' }] }] }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] }, primitive: { topology: 'triangle-list' }, multisample: { count: 4 } });
                this.cameraBuffer = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                this.cameraGroup = d.createBindGroup({ layout: this.cameraLayout, entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }] });
                this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear' });
                let white = document.createElement('canvas');
                white.width = white.height = 1;
                white.getContext('2d').fillRect(0, 0, 1, 1);
                this.white = this.makeTexture(white);
                this.mode = 'WebGPU';
                this.canvas.hidden = false;
                this.fallback.hidden = true;
            }
            catch (e) {
                this.reason = e.message;
                this.useFallback();
            }
            this.dispatchEvent(new Event('ready'));
            this.invalidate();
            return this.mode;
        }
        useFallback() { this.mode = 'Canvas 2D'; this.canvas.hidden = true; this.fallback.hidden = false; this.dispatchEvent(new Event('ready')); this.invalidate(); }
        resize(w, h, dpr) { this.dpr = Math.min(3, dpr || 1, (this.device?.limits.maxTextureDimension2D || 16384) / Math.max(w, h)); let pw = Math.max(1, Math.round(w * this.dpr)), ph = Math.max(1, Math.round(h * this.dpr)); for (let canvas of [this.canvas, this.fallback, this.background]) {
            if (canvas.width !== pw || canvas.height !== ph) {
                canvas.width = pw;
                canvas.height = ph;
            }
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
        } if (this.msaa && (this.msaa.width !== pw || this.msaa.height !== ph)) {
            this.msaa.destroy();
            this.msaa = null;
        } }
        makeBuffer(xy, quad = false) { if (!this.device || this.deviceLost || !xy.length)
            return null; let data; if (quad)
            data = xy;
        else {
            data = new Float32Array(xy.length * 2);
            for (let i = 0, j = 0; i < xy.length; i += 2, j += 4) {
                data[j] = xy[i];
                data[j + 1] = xy[i + 1];
            }
        } let buffer = this.device.createBuffer({ size: Math.max(16, data.byteLength), usage: GPUBufferUsage.VERTEX, mappedAtCreation: true }); new Float32Array(buffer.getMappedRange()).set(data); buffer.unmap(); return { buffer, count: data.length / 4 }; }
        meshReady(data) { if (data.workerFailure) {
            for (let c of this.cache.values())
                if (c.pending)
                    c.key = '';
            this.invalidate();
            return;
        } let c = this.cache.get(data.id); if (!c || c.key !== data.key)
            return; c.pending = false; if (data.error) {
            c.error = data.error;
            console.warn('Tessellation:', data.error);
            this.reason = data.error;
            this.useFallback();
            return;
        } c.fill?.buffer.destroy(); c.stroke?.buffer.destroy(); try {
            c.fill = this.makeBuffer(data.fill);
            c.stroke = this.makeBuffer(data.stroke);
        }
        catch (e) {
            this.reason = e.message;
            this.useFallback();
        } this.invalidate(); }
        mesh(n) { let s = Math.max(Math.hypot(n.matrix[0], n.matrix[1]), Math.hypot(n.matrix[2], n.matrix[3])), tol = Math.max(.03, Math.min(2, Math.pow(2, Math.floor(Math.log2(.45 / (this.camera.zoom * (s || 1))))))), key = JSON.stringify([n.type, n.w, n.h, n.radius, n.sides, n.innerRatio, n.paths, n.fill !== 'none', n.stroke !== 'none', n.strokeWidth, n.lineJoin, n.lineCap, n.fillRule, tol]), c = this.cache.get(n.id); if (!c) {
            c = { key: '', fill: null, stroke: null };
            this.cache.set(n.id, c);
        } if (c.key !== key) {
            c.key = key;
            c.pending = true;
            this.meshes.request(n.id, key, n, tol);
        } return c; }
        makeTexture(source) { const d = this.device, w = source.width || source.naturalWidth, h = source.height || source.naturalHeight, texture = d.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }); d.queue.copyExternalImageToTexture({ source }, { texture, premultipliedAlpha: false }, [w, h]); const group = d.createBindGroup({ layout: this.textureLayout, entries: [{ binding: 0, resource: texture.createView() }, { binding: 1, resource: this.sampler }] }); return { texture, group }; }
        texture(n) { let effective = this.camera.zoom * this.dpr * Math.max(Math.hypot(n.matrix[0], n.matrix[1]), Math.hypot(n.matrix[2], n.matrix[3])), res = Math.max(1, Math.min(4, Math.pow(2, Math.ceil(Math.log2(effective))))), key = JSON.stringify([n.type, n.text, n.fontSize, n.fontFamily, n.fontWeight, n.fontStyle, n.letterSpacing, n.lineHeight, n.w, n.h, n.fill, n.src, res]), old = this.textures.get(n.id); if (old?.key === key)
            return old; let source, pad = n.type === 'text' ? 4 : 0; if (n.type === 'image') {
            let img = getImage(n.src, this.invalidate);
            if (!img.complete || !img.naturalWidth)
                return null;
            res = Math.min(1, 4096 / img.naturalWidth, 4096 / img.naturalHeight);
            source = document.createElement('canvas');
            source.width = Math.max(1, Math.ceil(img.naturalWidth * res));
            source.height = Math.max(1, Math.ceil(img.naturalHeight * res));
            source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
        }
        else {
            res = Math.min(res, 4096 / (n.w + pad * 2), 4096 / (n.h + pad * 2));
            source = document.createElement('canvas');
            source.width = Math.max(1, Math.ceil((n.w + pad * 2) * res));
            source.height = Math.max(1, Math.ceil((n.h + pad * 2) * res));
            let c = source.getContext('2d');
            c.scale(res, res);
            c.translate(pad, pad);
            paintText(c, n);
        } old?.texture.destroy(); old?.mesh.buffer.destroy(); let t = this.makeTexture(source), x = -pad, y = -pad, w = n.w + pad * 2, h = n.h + pad * 2, verts = new Float32Array([x, y, 0, 0, x + w, y, 1, 0, x + w, y + h, 1, 1, x, y, 0, 0, x + w, y + h, 1, 1, x, y + h, 0, 1]), entry = { key, ...t, mesh: this.makeBuffer(verts, true), bytes: source.width * source.height * 4 }; this.textures.set(n.id, entry); return entry; }
        drawBackground() { const c = this.background.getContext('2d'), cam = this.camera, dark = document.documentElement.dataset.theme !== 'light'; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, cam.width, cam.height); c.fillStyle = dark ? '#27282A' : '#C9CBCE'; c.fillRect(0, 0, cam.width, cam.height); for (let b of this.store.doc.artboards) {
            let p = cam.screen(V.pt(b.x, b.y)), w = b.w * cam.zoom, h = b.h * cam.zoom;
            c.save();
            c.shadowColor = '#00000050';
            c.shadowBlur = 12;
            c.shadowOffsetY = 3;
            c.fillStyle = b.background || '#fff';
            c.fillRect(p.x, p.y, w, h);
            c.restore();
            if (this.grid) {
                c.save();
                c.beginPath();
                c.rect(p.x, p.y, w, h);
                c.clip();
                c.strokeStyle = '#00000018';
                c.lineWidth = .5;
                let step = 20 * cam.zoom;
                if (step > 4) {
                    c.beginPath();
                    for (let x = p.x; x <= p.x + w; x += step) {
                        c.moveTo(x, p.y);
                        c.lineTo(x, p.y + h);
                    }
                    for (let y = p.y; y <= p.y + h; y += step) {
                        c.moveTo(p.x, y);
                        c.lineTo(p.x + w, y);
                    }
                    c.stroke();
                }
                c.restore();
            }
            c.font = '10px Arial';
            c.fillStyle = dark ? '#A9ABAE' : '#505153';
            c.fillText(b.name, p.x, p.y - 12);
        } }
        drawFallback() { let c = this.fallback.getContext('2d'), cam = this.camera; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, cam.width, cam.height); c.translate(cam.x, cam.y); c.scale(cam.zoom, cam.zoom); let nodes = this.store.visibleNodes; for (let n of nodes) {
            if (n.id === this.editingText)
                continue;
            c.save();
            if (this.clip) {
                let b = this.store.doc.artboards.find(b => b.id === n.artboardId);
                if (b) {
                    c.beginPath();
                    c.rect(b.x, b.y, b.w, b.h);
                    c.clip();
                }
            }
            drawNodeCanvas(c, n, this.invalidate, this.outline);
            c.restore();
        } this.stats.draws = nodes.length; this.stats.vertices = 0; }
        frame() { const start = performance.now(); this.drawBackground(); if (this.mode !== 'WebGPU' || this.outline) {
            this.canvas.hidden = true;
            this.fallback.hidden = false;
            this.drawFallback();
            this.stats.frameMs = performance.now() - start;
            return;
        } this.canvas.hidden = false; this.fallback.hidden = true; try {
            this.drawGPU();
        }
        catch (e) {
            console.error(e);
            this.reason = e.message;
            this.useFallback();
            this.drawFallback();
        } this.stats.frameMs = performance.now() - start; }
        drawGPU() {
            const d = this.device, cam = this.camera, draws = [], viewport = { x: -cam.x / cam.zoom, y: -cam.y / cam.zoom, x2: (cam.width - cam.x) / cam.zoom, y2: (cam.height - cam.y) / cam.zoom }, visible = new Set(this.store.index.query(viewport).map(e => e.id)), alive = new Set(this.store.doc.nodes.map(n => n.id));
            for (let [id, c] of this.cache)
                if (!alive.has(id)) {
                    c.fill?.buffer.destroy();
                    c.stroke?.buffer.destroy();
                    this.cache.delete(id);
                }
            for (let [id, c] of this.textures)
                if (!alive.has(id)) {
                    c.texture.destroy();
                    c.mesh.buffer.destroy();
                    this.textures.delete(id);
                }
            for (let n of this.store.visibleNodes) {
                if (!visible.has(n.id) || n.id === this.editingText)
                    continue;
                if (n.type === 'text' || n.type === 'image') {
                    if (n.type === 'text' && n.fill === 'none')
                        continue;
                    let t = this.texture(n);
                    if (t)
                        draws.push({ node: n, mesh: t.mesh, paint: '#fff', texture: t, kind: 2 });
                }
                else {
                    let c = this.mesh(n);
                    if (c.fill && n.fill !== 'none')
                        draws.push({ node: n, mesh: c.fill, paint: n.fill, texture: this.white, kind: typeof n.fill === 'object' ? 1 : 0 });
                    if (c.stroke && n.stroke !== 'none')
                        draws.push({ node: n, mesh: c.stroke, paint: n.stroke, texture: this.white, kind: 0 });
                }
            }
            const needed = Math.max(256, draws.length * 256);
            if (!this.paintBuffer || this.paintCapacity < needed) {
                this.paintBuffer?.destroy();
                this.paintCapacity = Math.pow(2, Math.ceil(Math.log2(needed)));
                this.paintBuffer = d.createBuffer({ size: this.paintCapacity, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                this.paintGroup = d.createBindGroup({ layout: this.paintLayout, entries: [{ binding: 0, resource: { buffer: this.paintBuffer, size: 112 } }] });
            }
            let uniforms = new Float32Array(needed / 4);
            for (let i = 0; i < draws.length; i++) {
                const { node: n, paint, kind } = draws[i], m = n.matrix, offset = i * 64, fill = typeof paint === 'object' ? paint : null, b = this.store.doc.artboards.find(b => b.id === n.artboardId);
                uniforms.set([m[0], m[2], m[4], n.opacity ?? 1, m[1], m[3], m[5], kind], offset);
                uniforms.set(rgba(fill ? fill.color0 : paint), offset + 8);
                uniforms.set(rgba(fill ? fill.color1 : paint), offset + 12);
                if (fill)
                    uniforms.set(gradientVector(fill, V.localBounds(n)), offset + 16);
                if (b) {
                    uniforms.set([b.x, b.y, b.x + b.w, b.y + b.h], offset + 20);
                    uniforms[offset + 24] = this.clip ? 1 : 0;
                }
            }
            d.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array([cam.width, cam.height, cam.zoom, 0, cam.x, cam.y, 0, 0]));
            d.queue.writeBuffer(this.paintBuffer, 0, uniforms);
            if (!this.msaa)
                this.msaa = d.createTexture({ size: [this.canvas.width, this.canvas.height], format: this.format, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
            let encoder = d.createCommandEncoder(), pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.msaa.createView(), resolveTarget: this.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'discard' }] });
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.cameraGroup);
            let vertices = 0;
            for (let i = 0; i < draws.length; i++) {
                let q = draws[i];
                pass.setBindGroup(1, this.paintGroup, [i * 256]);
                pass.setBindGroup(2, q.texture.group);
                pass.setVertexBuffer(0, q.mesh.buffer);
                pass.draw(q.mesh.count);
                vertices += q.mesh.count;
            }
            pass.end();
            d.queue.submit([encoder.finish()]);
            this.stats.vertices = vertices;
            this.stats.draws = draws.length;
            this.stats.textureMB = [...this.textures.values()].reduce((s, t) => s + t.bytes, 0) / 1048576;
        }
        async exportPNG(board, scale = 2, transparent = false) { const canvas = document.createElement('canvas'); if (board.w * scale > 16384 || board.h * scale > 16384 || board.w * board.h * scale * scale > 64000000)
            throw Error('Export exceeds the 64-megapixel limit.'); canvas.width = Math.ceil(board.w * scale); canvas.height = Math.ceil(board.h * scale); let ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.translate(-board.x, -board.y); if (!transparent) {
            for (let b of (board.all ? this.store.doc.artboards : [board])) {
                ctx.fillStyle = b.background || '#fff';
                ctx.fillRect(b.x, b.y, b.w, b.h);
            }
        } await Promise.all(this.store.visibleNodes.filter(n => n.type === 'image').map(n => new Promise(resolve => { let img = getImage(n.src); if (img.complete)
            resolve();
        else {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        } }))); for (let n of this.store.visibleNodes)
            drawNodeCanvas(ctx, n, () => { }); return new Promise(resolve => canvas.toBlob(resolve, 'image/png')); }
    }
    Object.assign(V, { rgba, gradientVector, canvasFill, paintText, drawNodeCanvas, getImage, Camera, MeshService, Renderer });
})();
const VectoraRenderer = globalThis.V;


return {VectoraRenderer};
})();
const __meridian_22 = (() => {
/* Safe document and SVG import/export. Imported XML is parsed, never executed or inserted. */
'use strict';
(() => {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])), num = n => Number(Number(n).toFixed(5));
    function parseTransform(s) { let m = V.ident(); for (let match of (s || '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
        let p = match[2].trim().split(/[\s,]+/).map(Number);
        if (p.some(x => !Number.isFinite(x)))
            throw Error('Invalid SVG transformation');
        let t = V.ident();
        switch (match[1]) {
            case 'matrix':
                if (p.length !== 6)
                    throw Error('Invalid SVG matrix');
                t = p;
                break;
            case 'translate':
                t = V.translate(p[0] || 0, p[1] || 0);
                break;
            case 'scale':
                t = V.scale(p[0], p[1] ?? p[0]);
                break;
            case 'rotate':
                t = V.rotate((p[0] || 0) * Math.PI / 180);
                if (p.length >= 3)
                    t = V.around(t, V.pt(p[1], p[2]));
                break;
            case 'skewX':
                t = [1, 0, Math.tan(p[0] * Math.PI / 180), 1, 0, 0];
                break;
            case 'skewY':
                t = [1, Math.tan(p[0] * Math.PI / 180), 0, 1, 0, 0];
                break;
        }
        m = V.matrix(m, t);
    } return m; }
    function svgExport(doc, board = null, selection = null, embedMetadata = false) {
        let artboards = board ? [board] : doc.artboards, bb = V.unionBounds(artboards.map(b => ({ x: b.x, y: b.y, x2: b.x + b.w, y2: b.y + b.h }))), defs = [], body = [], nodes = doc.layers.flatMap(l => l.visible === false ? [] : doc.nodes.filter(n => n.layerId === l.id && n.visible !== false && (!selection || selection.has(n.id))));
        if (!selection)
            for (let b of artboards)
                body.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${esc(b.background || '#fff')}"/>`);
        for (let n of nodes) {
            let b = V.localBounds(n), fill = n.fill;
            if (typeof fill === 'object') {
                let a = (fill.angle || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), extent = Math.max(1, Math.abs(c) * b.w + Math.abs(s) * b.h), cx = b.x + b.w / 2, cy = b.y + b.h / 2, id = 'gradient-' + n.id;
                defs.push(`<linearGradient id="${esc(id)}" gradientUnits="userSpaceOnUse" x1="${num(cx - c * extent / 2)}" y1="${num(cy - s * extent / 2)}" x2="${num(cx + c * extent / 2)}" y2="${num(cy + s * extent / 2)}"><stop stop-color="${esc(fill.color0)}"/><stop offset="1" stop-color="${esc(fill.color1)}"/></linearGradient>`);
                fill = `url(#${id})`;
            }
            let common = `id="${esc(n.id)}" data-name="${esc(n.name)}" transform="matrix(${n.matrix.map(num).join(' ')})" opacity="${num(n.opacity ?? 1)}" fill="${esc(fill || 'none')}" stroke="${esc(n.stroke || 'none')}" stroke-width="${num(n.strokeWidth || 0)}" stroke-linecap="${esc(n.lineCap || 'round')}" stroke-linejoin="${esc(n.lineJoin || 'round')}" fill-rule="${esc(n.fillRule || 'nonzero')}"`;
            if (n.type === 'text')
                body.push(`<text ${common} font-family="${esc(n.fontFamily || 'Arial')}" font-size="${num(n.fontSize)}" font-weight="${esc(n.fontWeight || 400)}" font-style="${esc(n.fontStyle || 'normal')}" letter-spacing="${num(n.letterSpacing || 0)}">${String(n.text || '').split('\n').map((line, i) => `<tspan x="0" y="${num(n.fontSize * .91 + i * n.fontSize * n.lineHeight)}">${esc(line)}</tspan>`).join('')}</text>`);
            else if (n.type === 'image')
                body.push(`<image ${common} width="${num(n.w)}" height="${num(n.h)}" href="${esc(n.src)}"/>`);
            else
                body.push(`<path ${common} d="${V.pathsToD(V.shapePaths(n))}"/>`);
        }
        let metadata = embedMetadata && !board && !selection ? `<metadata id="vectora-document">${esc(JSON.stringify(doc))}</metadata>` : '';
        return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(bb.w)}" height="${num(bb.h)}" viewBox="${num(bb.x)} ${num(bb.y)} ${num(bb.w)} ${num(bb.h)}"><title>${esc(doc.name)}</title>${metadata}<defs>${defs.join('')}</defs>${body.join('\n')}</svg>`;
    }
    function importSVG(text, name = 'Imported artwork') {
        if (text.length > 25 * 1024 * 1024)
            throw Error('SVG exceeds the 25 MB limit.');
        const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
        if (xml.querySelector('parsererror'))
            throw Error('The SVG is not well-formed XML.');
        const root = xml.documentElement;
        if (root.localName !== 'svg')
            throw Error('No SVG root element.');
        const metadata = root.querySelector('metadata#vectora-document');
        if (metadata) {
            try {
                return { doc: V.validateDocument(JSON.parse(metadata.textContent)), warnings: [] };
            }
            catch { }
        }
        let warnings = new Set(), vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number), w = parseFloat(root.getAttribute('width')) || 1200, h = parseFloat(root.getAttribute('height')) || 800;
        if (vb.length === 4 && vb.every(Number.isFinite)) {
            w = vb[2];
            h = vb[3];
        }
        else
            vb = [0, 0, w, h];
        if (w <= 0 || h <= 0 || w > 100000 || h > 100000)
            throw Error('Unsupported SVG dimensions.');
        let doc = V.blankDocument(w, h, name.replace(/\.svg$/i, '')), gradients = new Map(), idMap = new Map();
        for (let e of root.querySelectorAll('[id]'))
            idMap.set(e.id, e);
        for (let g of root.querySelectorAll('linearGradient,radialGradient')) {
            let stops = [...g.querySelectorAll('stop')].map(s => { let style = Object.fromEntries((s.getAttribute('style') || '').split(';').filter(Boolean).map(x => x.split(':').map(x => x.trim()))); return s.getAttribute('stop-color') || style['stop-color'] || '#000'; });
            if (g.localName === 'radialGradient')
                warnings.add('Radial gradients approximated by linear gradients.');
            if (stops.length > 2)
                warnings.add('Multi-stop gradients reduced to first and last colors.');
            let x1 = parseFloat(g.getAttribute('x1')) || 0, y1 = parseFloat(g.getAttribute('y1')) || 0, x2 = parseFloat(g.getAttribute('x2')) || 100, y2 = parseFloat(g.getAttribute('y2')) || 0;
            gradients.set(g.id, { type: 'linear', color0: stops[0] || '#000', color1: stops.at(-1) || '#fff', angle: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI });
            if (g.hasAttribute('gradientTransform'))
                warnings.add('Gradient transforms are approximated.');
        }
        const styleNames = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-linejoin', 'stroke-linecap', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'display', 'visibility'];
        let total = 0;
        function walk(el, parentM, inherited, depth = 0, groupId = null) {
            if (depth > 32)
                throw Error('SVG nesting limit exceeded.');
            if (++total > 20000)
                throw Error('SVG element limit exceeded.');
            let tag = el.localName;
            if (['script', 'foreignObject', 'style', 'filter', 'clipPath', 'mask', 'defs', 'metadata', 'title', 'desc', 'linearGradient', 'radialGradient', 'pattern'].includes(tag)) {
                if (['style', 'filter', 'clipPath', 'mask', 'pattern'].includes(tag))
                    warnings.add('Stylesheets, filters, clipping masks and patterns are not imported.');
                return;
            }
            let style = { ...inherited }, inline = Object.fromEntries((el.getAttribute('style') || '').split(';').filter(s => s.includes(':')).map(s => { let i = s.indexOf(':'); return [s.slice(0, i).trim(), s.slice(i + 1).trim()]; }));
            for (let k of styleNames) {
                if (el.hasAttribute(k))
                    style[k] = el.getAttribute(k);
                if (inline[k] !== undefined)
                    style[k] = inline[k];
            }
            if (style.display === 'none' || style.visibility === 'hidden')
                return;
            let ownOpacity = parseFloat(el.getAttribute('opacity') || inline.opacity || '1');
            style.opacity = Number(inherited.opacity ?? 1) * ownOpacity;
            let m = V.matrix(parentM, parseTransform(el.getAttribute('transform')));
            const attr = (k, def = 0) => { let v = parseFloat(el.getAttribute(k)); return Number.isFinite(v) ? v : def; };
            if (el.hasAttribute('clip-path') || el.hasAttribute('mask') || el.hasAttribute('filter'))
                warnings.add('Clipping masks and filters were omitted.');
            if (tag === 'svg' || tag === 'g' || tag === 'a' || tag === 'symbol') {
                let group = tag === 'g' ? (groupId || V.uid('group')) : groupId;
                for (let child of el.children)
                    walk(child, m, style, depth + 1, group);
                return;
            }
            if (tag === 'use') {
                let href = el.getAttribute('href') || el.getAttribute('xlink:href');
                if (href?.startsWith('#') && idMap.has(href.slice(1)))
                    walk(idMap.get(href.slice(1)), V.matrix(m, V.translate(attr('x'), attr('y'))), style, depth + 1, groupId);
                else
                    warnings.add('External SVG references were omitted.');
                return;
            }
            let n = V.node('path', { layerId: 'artwork', matrix: m, groupId, name: el.getAttribute('data-name') || el.id || tag, fill: style.fill || '#000', stroke: style.stroke || 'none', strokeWidth: Number.isFinite(parseFloat(style['stroke-width'])) ? parseFloat(style['stroke-width']) : 1, opacity: Math.max(0, Math.min(1, Number(style.opacity ?? 1))), fillRule: style['fill-rule'] || 'nonzero', lineJoin: style['stroke-linejoin'] || 'miter', lineCap: style['stroke-linecap'] || 'butt' });
            if (/^url\(/.test(n.fill)) {
                let id = n.fill.match(/#([^\s)'";]+)/)?.[1];
                n.fill = gradients.get(id) || '#000';
                if (!gradients.has(id))
                    warnings.add('Unsupported paint servers were replaced with black.');
            }
            if (style['fill-opacity'] && Number(style['fill-opacity']) !== 1) {
                n.opacity *= Number(style['fill-opacity']);
                warnings.add('Fill opacity was folded into object opacity.');
            }
            if (style['stroke-opacity'] && Number(style['stroke-opacity']) !== 1)
                warnings.add('Independent stroke opacity is not supported.');
            if (tag === 'path')
                n.paths = V.parsePath(el.getAttribute('d') || '');
            else if (tag === 'rect') {
                n.type = 'rect';
                n.w = attr('width');
                n.h = attr('height');
                n.radius = attr('rx', attr('ry'));
                n.matrix = V.matrix(m, V.translate(attr('x'), attr('y')));
            }
            else if (tag === 'circle' || tag === 'ellipse') {
                n.type = 'ellipse';
                let rx = tag === 'circle' ? attr('r') : attr('rx'), ry = tag === 'circle' ? rx : attr('ry');
                n.w = rx * 2;
                n.h = ry * 2;
                n.matrix = V.matrix(m, V.translate(attr('cx') - rx, attr('cy') - ry));
            }
            else if (tag === 'line')
                n.paths = [{ closed: false, points: [V.anchor(attr('x1'), attr('y1')), V.anchor(attr('x2'), attr('y2'))] }];
            else if (tag === 'polyline' || tag === 'polygon') {
                let ns = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
                n.paths = [{ closed: tag === 'polygon', points: [] }];
                for (let i = 0; i + 1 < ns.length; i += 2)
                    n.paths[0].points.push(V.anchor(ns[i], ns[i + 1]));
            }
            else if (tag === 'text') {
                n.type = 'text';
                n.fontSize = parseFloat(style['font-size']) || 16;
                n.fontFamily = (style['font-family'] || 'Arial').replace(/["']/g, '');
                n.fontWeight = style['font-weight'] || 400;
                n.fontStyle = style['font-style'] || 'normal';
                n.letterSpacing = parseFloat(style['letter-spacing']) || 0;
                n.lineHeight = 1.12;
                let spans = [...el.children].filter(e => e.localName === 'tspan');
                n.text = spans.length ? spans.map(e => e.textContent).join('\n') : el.textContent;
                let tx = attr('x'), ty = attr('y');
                if (spans.length) {
                    tx = parseFloat(spans[0].getAttribute('x')) || tx;
                    ty = parseFloat(spans[0].getAttribute('y')) || ty;
                    if (spans.length > 1) {
                        let y2 = parseFloat(spans[1].getAttribute('y'));
                        if (Number.isFinite(y2))
                            n.lineHeight = (y2 - ty) / n.fontSize;
                    }
                }
                n.matrix = V.matrix(m, V.translate(tx, ty - n.fontSize * .91));
                V.measureText(n);
                if (el.getAttribute('text-anchor') === 'middle')
                    n.matrix = V.matrix(n.matrix, V.translate(-n.w / 2, 0));
                if (el.getAttribute('text-anchor') === 'end')
                    n.matrix = V.matrix(n.matrix, V.translate(-n.w, 0));
                if (el.querySelector('textPath'))
                    warnings.add('Text on a path imported as ordinary text.');
            }
            else if (tag === 'image') {
                let src = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
                if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)) {
                    warnings.add('External and SVG image links omitted for security.');
                    return;
                }
                n.type = 'image';
                n.src = src;
                n.w = attr('width');
                n.h = attr('height');
                n.matrix = V.matrix(m, V.translate(attr('x'), attr('y')));
            }
            else {
                warnings.add('Unsupported SVG element omitted: ' + tag);
                return;
            }
            doc.nodes.push(n);
        }
        walk(root, V.translate(-vb[0], -vb[1]), { fill: '#000', stroke: 'none', opacity: 1 });
        return { doc: V.validateDocument(doc), warnings: [...warnings] };
    }
    function download(data, name, type = 'application/octet-stream') { let blob = data instanceof Blob ? data : new Blob([data], { type }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    class SessionStorage {
        async open() { if (this.db)
            return; return new Promise((resolve, reject) => { if (!globalThis.indexedDB) {
            reject(Error('IndexedDB unavailable'));
            return;
        } let req = indexedDB.open('vectora-studio', 1); req.onupgradeneeded = () => req.result.createObjectStore('documents'); req.onsuccess = () => { this.db = req.result; resolve(); }; req.onerror = () => reject(req.error); }); }
        async save(doc) { if (!this.db)
            await this.open(); return new Promise((resolve, reject) => { let tx = this.db.transaction('documents', 'readwrite'); tx.objectStore('documents').put(V.clone(doc), 'session'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
        async load() { if (!this.db)
            await this.open(); return new Promise((resolve, reject) => { let r = this.db.transaction('documents', 'readonly').objectStore('documents').get('session'); r.onsuccess = () => resolve(r.result ? V.validateDocument(r.result) : null); r.onerror = () => reject(r.error); }); }
    }
    Object.assign(V, { esc, parseTransform, svgExport, importSVG, download, SessionStorage });
})();
const VectoraIO = globalThis.V;


return {VectoraIO};
})();
const __meridian_23 = (() => {
'use strict';
(() => {
    const icons = {
        select: '<path d="M5 3l13 10-6 1-3 6z" fill="currentColor" stroke-width="1"/>', direct: '<path d="M5 3l13 10-6 1-3 6z"/>', pen: '<path d="M14 3l7 7-10 11-8 1 1-8zM14 3l-3 9 10-2M3 22l8-10"/><circle cx="11" cy="12" r="2"/>', pencil: '<path d="M4 17L16 5l4 4L8 21H4zM14 7l4 4M4 17l4 4"/>', brush: '<path d="M9 13L19 3l2 2-9 11M9 13l3 3c0 6-6 6-9 4 4 0 1-6 6-7z"/>', rect: '<rect x="4" y="4" width="16" height="16" rx="1"/>', ellipse: '<ellipse cx="12" cy="12" rx="8" ry="8"/>', polygon: '<path d="M8 4h8l5 8-5 8H8l-5-8z"/>', star: '<path d="M12 2l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z"/>', line: '<path d="M4 20L20 4"/><circle cx="4" cy="20" r="1"/><circle cx="20" cy="4" r="1"/>', type: '<path d="M4 6V3h16v3M12 3v18M8 21h8"/>', gradient: '<defs><linearGradient id="ico-grad"><stop stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><rect x="3" y="5" width="18" height="14" fill="url(#ico-grad)"/>', eyedropper: '<path d="M15 3l6 6M16 6l-3 3-2-2-7 7v4l-2 3 3-2h4l7-7-2-2 3-3M5 14l4 4"/>', erase: '<path d="M14 3l8 8-10 10H7L2 16zM7 11l8 8M12 21h10"/>', artboard: '<path d="M3 7h18M7 3v18M3 17h18M17 3v18"/><path d="M7 7h10v10H7z" fill="currentColor" fill-opacity=".12"/>', hand: '<path d="M7 12V6a1.5 1.5 0 013 0v5-7a1.5 1.5 0 013 0v7-5a1.5 1.5 0 013 0v6-3a1.5 1.5 0 013 0v7c0 4-2 6-6 6-3 0-5-2-7-5l-3-4c-1-2 1-3 2-2z"/>', zoom: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6M7 10h6M10 7v6"/>', rotate: '<path d="M4 10a8 8 0 111 8M3 3v7h7"/>', search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>', export: '<path d="M12 16V3m-4 4l4-4 4 4M5 11H3v10h18V11h-2"/>', import: '<path d="M12 3v13m-4-4l4 4 4-4M4 17v4h16v-4"/>', chevronDown: '<path d="M7 9l5 5 5-5"/>', chevronRight: '<path d="M9 6l6 6-6 6"/>', chevronLeft: '<path d="M15 6l-6 6 6 6"/>', chevrons: '<path d="M7 8l4 4-4 4M13 8l4 4-4 4"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', close: '<path d="M6 6l12 12M6 18L18 6"/>', more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>', swap: '<path d="M5 5h12v6M13 7l4 4 4-4M19 19H7v-6M3 17l4-4 4 4"/>', defaultPaint: '<rect x="3" y="3" width="12" height="12" fill="currentColor"/><rect x="9" y="9" width="12" height="12" fill="var(--panel)"/>', outline: '<rect x="3" y="5" width="18" height="14"/><path d="M7 9h10v6H7z" stroke-dasharray="2 2"/>', fit: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><rect x="7" y="7" width="10" height="10"/>', file: '<path d="M6 2h8l5 5v15H6zM14 2v6h5"/>', layers: '<path d="M12 3l10 5-10 5L2 8zM3 12l9 5 9-5M3 16l9 5 9-5"/>', history: '<path d="M3 10a9 9 0 119 11M3 4v6h6M12 7v6l4 2"/>', sliders: '<path d="M5 3v4m0 4v10M12 3v10m0 4v4M19 3v2m0 4v12M2 7h6v4H2zM9 13h6v4H9zM16 5h6v4h-6z"/>', swatches: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>', gpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>', shield: '<path d="M12 2l8 3v6c0 6-8 11-8 11S4 17 4 11V5zM8 12l3 3 5-6"/>', copy: '<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>', group: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="3 3"/><rect x="6" y="6" width="7" height="7"/><rect x="11" y="11" width="7" height="7"/>', front: '<path d="M3 9h6v12H3zM9 15h12v6H9"/><rect x="9" y="3" width="12" height="12" fill="currentColor" fill-opacity=".25"/>', back: '<rect x="3" y="9" width="12" height="12" fill="currentColor" fill-opacity=".2"/><path d="M9 9V3h12v12h-6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>', eye: '<path d="M2 12c5-9 15-9 20 0-5 9-15 9-20 0z"/><circle cx="12" cy="12" r="3"/>', lock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 018 0v4M12 15v3"/>', unlock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 018 0M12 15v3"/>', alignLeft: '<path d="M4 3v18M7 5h12v5H7zM7 14h8v5H7z"/>', alignCenter: '<path d="M12 2v20M4 5h16v5H4zM7 14h10v5H7z"/>', alignRight: '<path d="M20 3v18M5 5h12v5H5zM9 14h8v5H9z"/>', alignTop: '<path d="M3 4h18M5 7h5v12H5zM14 7h5v8h-5z"/>', alignMiddle: '<path d="M2 12h20M5 4h5v16H5zM14 7h5v10h-5z"/>', alignBottom: '<path d="M3 20h18M5 5h5v12H5zM14 9h5v8h-5z"/>', union: '<path d="M3 3h12v6h6v12H9v-6H3z" fill="currentColor" fill-opacity=".25"/>', subtract: '<path d="M3 3h12v6H9v6H3z" fill="currentColor" fill-opacity=".25"/><path d="M15 9h6v12H9v-6" stroke-dasharray="2 2"/>', intersect: '<path d="M3 3h12v12H3zM9 9h12v12H9z" opacity=".4"/><path d="M9 9h6v6H9z" fill="currentColor"/>', xor: '<path d="M3 3h12v6H9v6H3zM15 9h6v12H9v-6h6z" fill="currentColor" fill-opacity=".4"/>', undo: '<path d="M8 4L3 9l5 5M3 9h12a6 6 0 010 12h-3"/>', redo: '<path d="M16 4l5 5-5 5M21 9H9a6 6 0 000 12h3"/>', check: '<path d="M4 12l5 5L20 6"/>', link: '<path d="M10 14l4-4M8 16l-2 2a4 4 0 01-6-6l5-5a4 4 0 016 0M16 8l2-2a4 4 0 00-6-6L7 5" transform="translate(3 3) scale(.85)"/>', flipH: '<path d="M12 2v20M3 5l6 14H3zM21 5l-6 14h6z"/>', flipV: '<path d="M2 12h20M5 3l14 6V3zM5 21l14-6v6z"/>', path: '<path d="M3 18C3 2 21 22 21 6M3 18L7 4M21 6l-4 14"/><rect x="1" y="16" width="4" height="4"/><rect x="19" y="4" width="4" height="4"/><circle cx="7" cy="4" r="1"/><circle cx="17" cy="20" r="1"/>', image: '<rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8" cy="8" r="2"/><path d="M3 17l6-6 5 5 3-3 4 4"/>', save: '<path d="M3 3h15l3 3v15H3zM7 3v6h10V3M7 21V13h10v8"/>', folder: '<path d="M3 6h7l2 3h10l-3 12H3zM3 6V3h7l3 3h6v3"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9 8c0-4 7-4 7 0 0 3-4 2-4 6M12 17v1"/>', code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18"/>', monitor: '<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M8 22h8M12 17v5"/>', phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 19h2"/>', grid: '<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>', magnet: '<path d="M5 3v9a7 7 0 0014 0V3h-5v9a2 2 0 01-4 0V3zM5 7h5M14 7h5"/>'
    };
    V.icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.rect}</svg>`;
    V.hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = V.icon(el.dataset.icon); });
})();
const VectoraIcons = globalThis.V;


return {VectoraIcons};
})();
const __meridian_24 = (() => {
/* Pointer-driven editing state machine. Gestures are reversible transactions, not UI-only mocks. */
'use strict';
(() => {
    const toolInfo = {
        select: ['Seleção', 'Clique para selecionar. Arraste para mover. Shift adiciona à seleção.'],
        direct: ['Seleção Direta', 'Arraste nós de ancoragem ou alças Bézier. Duplo clique no segmento para adicionar nó.'],
        pen: ['Caneta Bézier', 'Clique para cantos, arraste para curvas. Clique no primeiro ponto para fechar. Enter conclui.'],
        pencil: ['Lápis', 'Arraste para desenhar um traçado à mão livre.'],
        brush: ['Pincel', 'Arraste para desenhar um traçado vetorial suave e uniforme.'],
        rect: ['Retângulo', 'Arraste para desenhar. Shift trava em quadrado perfeito.'],
        ellipse: ['Elipse', 'Arraste para desenhar. Shift trava em círculo perfeito.'],
        polygon: ['Polígono', 'Arraste para desenhar. Setas do teclado alteram o número de lados.'],
        star: ['Estrela', 'Arraste para desenhar. Setas do teclado alteram o número de pontas.'],
        line: ['Linha', 'Arraste para desenhar. Shift trava em ângulos múltiplos de 45°.'],
        text: ['Texto', 'Clique para adicionar texto editável. Duplo clique no texto para editar.'],
        gradient: ['Gradiente', 'Arraste sobre a forma selecionada para definir o ângulo do gradiente linear.'],
        eyedropper: ['Conta-gotas', 'Clique em qualquer forma para copiar suas cores de preenchimento e contorno.'],
        erase: ['Borracha de Objetos', 'Arraste sobre formas para excluí-las da ilustração.'],
        artboard: ['Prancheta', 'Arraste uma prancheta para movê-la. Shift+arrastar cria uma nova prancheta.'],
        hand: ['Mão (Navegar)', 'Arraste para mover a área de visualização da prancheta.'],
        zoom: ['Zoom', 'Clique para ampliar. Alt+clique para reduzir o zoom.'],
        rotate: ['Rotacionar', 'Arraste para girar a seleção. Shift trava em múltiplos de 15°.']
    };
    class Editor {
        constructor(app) { this.app = app; this.canvas = app.dom.overlay; this.tool = 'select'; this.space = false; this.gesture = null; this.pen = null; this.hover = null; this.pointer = V.pt(); this.snapLines = []; this.anchorSelection = null; this.textNode = null; this.canvas.addEventListener('pointerdown', e => this.down(e)); this.canvas.addEventListener('pointermove', e => this.move(e)); this.canvas.addEventListener('pointerup', e => this.up(e)); this.canvas.addEventListener('pointercancel', () => this.cancel()); this.canvas.addEventListener('dblclick', e => this.doubleClick(e)); this.canvas.addEventListener('contextmenu', e => { e.preventDefault(); this.app.contextMenu(e); }); this.canvas.addEventListener('wheel', e => this.wheel(e), { passive: false }); this.canvas.addEventListener('pointerleave', () => { if (!this.gesture) {
            this.hover = null;
            this.app.invalidate();
        } }); const te = app.dom.textEditor; te.addEventListener('input', () => { if (!this.textNode)
            return; this.textNode.text = te.value; V.measureText(this.textNode); this.store.emit(); this.positionText(); }); te.addEventListener('blur', () => this.finishText()); te.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') {
            e.preventDefault();
            this.finishText(true);
        }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.finishText();
        } }); }
        get store() { return this.app.store; }
        get cam() { return this.app.camera; }
        get renderer() { return this.app.renderer; }
        local(e) { const r = this.canvas.getBoundingClientRect(); return V.pt(e.clientX - r.left, e.clientY - r.top); }
        world(e) { return this.cam.world(this.local(e)); }
        setTool(tool) { if (!toolInfo[tool])
            return; if (this.pen && tool !== 'pen')
            this.finishPen(); if (this.textNode)
            this.finishText(); this.tool = tool; this.anchorSelection = null; this.hover = null; this.updateCursor(); this.app.updateToolUI(); this.app.invalidate(); }
        updateCursor() { let c = this.space || this.tool === 'hand' ? (this.gesture ? 'grabbing' : 'grab') : this.tool === 'select' ? 'default' : this.tool === 'text' ? 'text' : this.tool === 'zoom' ? 'zoom-in' : this.tool === 'erase' ? 'not-allowed' : this.tool === 'direct' ? 'default' : 'crosshair'; this.canvas.style.cursor = c; }
        hit(p, { unlocked = true } = {}) { let tol = 6 / this.cam.zoom, items = this.store.index.query({ x: p.x - tol, y: p.y - tol, x2: p.x + tol, y2: p.y + tol }).sort((a, b) => b.order - a.order); for (let { node: n } of items) {
            if (unlocked && this.store.isLocked(n))
                continue;
            let inv = V.inverse(n.matrix);
            if (!inv)
                continue;
            let q = V.transform(inv, p), s = Math.max(.001, Math.min(Math.hypot(n.matrix[0], n.matrix[1]), Math.hypot(n.matrix[2], n.matrix[3])));
            if (n.type === 'text' || n.type === 'image') {
                if (V.contains(V.localBounds(n), q, tol / s))
                    return n;
                continue;
            }
            let polys = V.flatten(V.shapePaths(n), .55);
            if (n.fill !== 'none' && V.windingAt(polys, q, n.fillRule))
                return n;
            if (n.stroke !== 'none' && n.strokeWidth > 0) {
                for (let poly of polys) {
                    let points = poly.points, count = poly.closed ? points.length : points.length - 1;
                    for (let i = 0; i < count; i++)
                        if (V.segmentDistance(q, points[i], points[(i + 1) % points.length]) <= n.strokeWidth / 2 + tol / s)
                            return n;
                }
            }
        } return null; }
        idsFor(n) { return n.groupId && this.tool !== 'direct' ? this.store.doc.nodes.filter(a => a.groupId === n.groupId && !this.store.isLocked(a)).map(a => a.id) : [n.id]; }
        handles(b) { let x = b.x, y = b.y, x2 = b.x2, y2 = b.y2, cx = (x + x2) / 2, cy = (y + y2) / 2; return [{ key: 'nw', p: V.pt(x, y), fixed: V.pt(x2, y2) }, { key: 'n', p: V.pt(cx, y), fixed: V.pt(cx, y2) }, { key: 'ne', p: V.pt(x2, y), fixed: V.pt(x, y2) }, { key: 'e', p: V.pt(x2, cy), fixed: V.pt(x, cy) }, { key: 'se', p: V.pt(x2, y2), fixed: V.pt(x, y) }, { key: 's', p: V.pt(cx, y2), fixed: V.pt(cx, y) }, { key: 'sw', p: V.pt(x, y2), fixed: V.pt(x2, y) }, { key: 'w', p: V.pt(x, cy), fixed: V.pt(x2, cy) }]; }
        hitHandle(p, b) { for (let h of this.handles(b))
            if (V.dist(p, h.p) * this.cam.zoom < 7)
                return h; let rp = V.pt((b.x + b.x2) / 2, b.y - 25 / this.cam.zoom); if (V.dist(p, rp) * this.cam.zoom < 8)
            return { key: 'rotate', p: rp }; return null; }
        anchorHit(p) { let best = null, min = 8 / this.cam.zoom; for (let n of this.store.selected) {
            if (this.store.isLocked(n) || ['text', 'image'].includes(n.type))
                continue;
            V.shapePaths(n).forEach((path, pi) => path.points.forEach((a, ai) => { for (let kind of ['in', 'out', 'point']) {
                let q = kind === 'point' ? a : a[kind];
                if (!q)
                    continue;
                let d = V.dist(V.transform(n.matrix, q), p);
                if (d < min) {
                    min = d;
                    best = { n, pi, ai, kind };
                }
            } }));
        } return best; }
        allBounds() { return V.unionBounds(this.store.doc.artboards.map(b => ({ x: b.x, y: b.y, x2: b.x + b.w, y2: b.y + b.h }))); }
        fitAll() { this.cam.fit(this.allBounds()); this.app.invalidate(); }
        fitBoard() { let b = this.store.activeBoard; this.cam.fit({ x: b.x, y: b.y, w: b.w, h: b.h }); this.app.invalidate(); }
        fitSelection() { let b = this.store.selectionBounds(); if (b) {
            this.cam.fit(b);
            this.app.invalidate();
        } }
        wheel(e) { e.preventDefault(); const p = this.local(e); if (e.shiftKey) {
            this.cam.x -= e.deltaY || e.deltaX;
            this.cam.y -= e.deltaX;
        }
        else
            this.cam.zoomAt(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * .007), p); this.app.invalidate(); }
        snapPoint(p, exclude = new Set()) { this.snapLines = []; if (this.app.gridSnap) {
            p = V.pt(Math.round(p.x / 20) * 20, Math.round(p.y / 20) * 20);
        } if (!this.app.smartGuides)
            return p; let xs = [], ys = []; for (let b of this.store.doc.artboards) {
            xs.push(b.x, b.x + b.w / 2, b.x + b.w);
            ys.push(b.y, b.y + b.h / 2, b.y + b.h);
        } for (let item of this.store.index.query({ x: p.x - 50 / this.cam.zoom, y: p.y - 50 / this.cam.zoom, x2: p.x + 50 / this.cam.zoom, y2: p.y + 50 / this.cam.zoom })) {
            if (exclude.has(item.id))
                continue;
            let b = item.bounds;
            xs.push(b.x, (b.x + b.x2) / 2, b.x2);
            ys.push(b.y, (b.y + b.y2) / 2, b.y2);
        } for (let g of this.store.doc.guides || [])
            (g.axis === 'x' ? xs : ys).push(g.value); let x = p.x, y = p.y, dx = 6 / this.cam.zoom, dy = dx; for (let v of xs)
            if (Math.abs(v - p.x) < dx) {
                dx = Math.abs(v - p.x);
                x = v;
            } for (let v of ys)
            if (Math.abs(v - p.y) < dy) {
                dy = Math.abs(v - p.y);
                y = v;
            } if (x !== p.x)
            this.snapLines.push({ axis: 'x', value: x }); if (y !== p.y)
            this.snapLines.push({ axis: 'y', value: y }); return V.pt(x, y); }
        snapDelta(delta, b, exclude) { this.snapLines = []; if (this.app.gridSnap) {
            delta = V.pt(Math.round((b.x + delta.x) / 20) * 20 - b.x, Math.round((b.y + delta.y) / 20) * 20 - b.y);
        } if (!this.app.smartGuides)
            return delta; let xs = [], ys = []; for (let a of this.store.doc.artboards) {
            xs.push(a.x, a.x + a.w / 2, a.x + a.w);
            ys.push(a.y, a.y + a.h / 2, a.y + a.h);
        } for (let item of this.store.index.query({ x: (-this.cam.x) / this.cam.zoom, y: (-this.cam.y) / this.cam.zoom, x2: (this.cam.width - this.cam.x) / this.cam.zoom, y2: (this.cam.height - this.cam.y) / this.cam.zoom })) {
            if (exclude.has(item.id))
                continue;
            let a = item.bounds;
            xs.push(a.x, (a.x + a.x2) / 2, a.x2);
            ys.push(a.y, (a.y + a.y2) / 2, a.y2);
        } for (let g of this.store.doc.guides || [])
            (g.axis === 'x' ? xs : ys).push(g.value); let dx = 0, dy = 0, minx = 6 / this.cam.zoom, miny = minx, sx = null, sy = null; for (let a of [b.x, (b.x + b.x2) / 2, b.x2])
            for (let v of xs) {
                let diff = v - a - delta.x;
                if (Math.abs(diff) < minx) {
                    minx = Math.abs(diff);
                    dx = diff;
                    sx = v;
                }
            } for (let a of [b.y, (b.y + b.y2) / 2, b.y2])
            for (let v of ys) {
                let diff = v - a - delta.y;
                if (Math.abs(diff) < miny) {
                    miny = Math.abs(diff);
                    dy = diff;
                    sy = v;
                }
            } if (sx !== null)
            this.snapLines.push({ axis: 'x', value: sx }); if (sy !== null)
            this.snapLines.push({ axis: 'y', value: sy }); return V.pt(delta.x + dx, delta.y + dy); }
        originals() { return this.store.selected.filter(n => !this.store.isLocked(n)).map(n => ({ n, m: [...n.matrix] })); }
        down(e) {
            if (e.button === 2)
                return;
            e.preventDefault();
            this.app.closePopovers();
            this.canvas.focus({ preventScroll: true });
            if (this.textNode)
                this.finishText();
            const screen = this.local(e), p = this.cam.world(screen);
            this.pointer = p;
            this.canvas.setPointerCapture(e.pointerId);
            if (e.button === 1 || this.space || this.tool === 'hand') {
                e.preventDefault();
                this.gesture = { kind: 'pan', screen, x: this.cam.x, y: this.cam.y };
                this.updateCursor();
                return;
            }
            if (screen.x < 22 || screen.y < 22) {
                this.store.history.begin('Add guide');
                const axis = screen.y < 22 ? 'y' : 'x', g = { id: V.uid('guide'), axis, value: p[axis] };
                (this.store.doc.guides ||= []).push(g);
                this.gesture = { kind: 'guide', guide: g };
                this.store.emit();
                return;
            }
            const board = this.store.doc.artboards.find(b => V.contains({ x: b.x, y: b.y, x2: b.x + b.w, y2: b.y + b.h }, p));
            if (board && this.tool !== 'artboard')
                this.store.activeArtboard = board.id;
            if (this.tool === 'zoom') {
                this.cam.zoomAt(e.altKey ? 1 / 1.35 : 1.35, screen);
                this.app.invalidate();
                return;
            }
            if (this.tool === 'pen') {
                this.penDown(e, p);
                return;
            }
            if (this.tool === 'direct') {
                let a = this.anchorHit(p);
                if (a) {
                    this.store.history.begin(a.kind === 'point' ? 'Move anchor' : 'Move Bézier handle');
                    if (a.n.type !== 'path') {
                        a.n.paths = V.clone(V.shapePaths(a.n));
                        a.n.type = 'path';
                    }
                    this.anchorSelection = { id: a.n.id, pi: a.pi, ai: a.ai };
                    this.gesture = { ...a, kind: 'anchor', part: a.kind, start: p, original: V.clone(a.n.paths[a.pi].points[a.ai]) };
                    return;
                }
            }
            if (this.tool === 'select' || this.tool === 'rotate') {
                let b = this.store.selectionBounds();
                if (b && this.store.selected.some(n => !this.store.isLocked(n))) {
                    let h = this.tool === 'rotate' ? { key: 'rotate' } : this.hitHandle(p, b);
                    if (h) {
                        let center = V.pt((b.x + b.x2) / 2, (b.y + b.y2) / 2);
                        this.store.history.begin(h.key === 'rotate' ? 'Rotate objects' : 'Resize objects');
                        this.gesture = { kind: h.key === 'rotate' ? 'rotate' : 'resize', handle: h, start: p, b, center, angle: Math.atan2(p.y - center.y, p.x - center.x), originals: this.originals() };
                        return;
                    }
                }
            }
            if (['select', 'direct', 'rotate'].includes(this.tool)) {
                let n = this.hit(p);
                this.anchorSelection = null;
                if (n) {
                    let ids = this.idsFor(n);
                    if (e.shiftKey) {
                        let next = new Set(this.store.selection);
                        for (let id of ids)
                            next.has(id) ? next.delete(id) : next.add(id);
                        this.store.select([...next]);
                    }
                    else if (!this.store.selection.has(n.id))
                        this.store.select(ids);
                    if (!this.store.selection.has(n.id))
                        return;
                    this.store.history.begin(e.altKey ? 'Duplicate and move' : 'Move objects');
                    if (e.altKey) {
                        let groups = new Map();
                        let ns = this.store.selected.map(a => { if (a.groupId && !groups.has(a.groupId))
                            groups.set(a.groupId, V.uid('group')); return { ...V.clone(a), id: V.uid(), name: a.name + ' copy', groupId: a.groupId ? groups.get(a.groupId) : undefined }; });
                        this.store.doc.nodes.push(...ns);
                        this.store.selection = new Set(ns.map(a => a.id));
                        this.store.emit();
                    }
                    this.gesture = { kind: 'move', start: p, originals: this.originals(), b: this.store.selectionBounds() };
                }
                else {
                    let g = (this.app.showGuides ? this.store.doc.guides || [] : []).find(g => Math.abs(p[g.axis] - g.value) * this.cam.zoom < 5);
                    if (g && !this.app.lockGuides) {
                        this.store.history.begin('Move guide');
                        this.gesture = { kind: 'guide', guide: g };
                    }
                    else {
                        if (!e.shiftKey)
                            this.store.select([]);
                        this.gesture = { kind: 'marquee', start: p, end: p, add: e.shiftKey };
                    }
                }
                this.app.invalidate();
                return;
            }
            if (this.tool === 'text') {
                let n = this.hit(p);
                if (n?.type === 'text')
                    this.editText(n);
                else {
                    this.store.history.begin('Add text');
                    n = V.node('text', { opacity: this.app.opacity, name: 'Text', text: 'Your text', fontSize: 48, fontFamily: 'Arial', fontWeight: 600, lineHeight: 1.12, letterSpacing: 0, matrix: V.translate(p.x, p.y), fill: this.app.fill === 'none' ? '#344C3D' : V.clone(this.app.fill), stroke: 'none' });
                    V.measureText(n);
                    this.store.add(n);
                    this.store.select([n.id]);
                    this.store.emit();
                    this.editText(n, true);
                }
                return;
            }
            if (this.tool === 'eyedropper') {
                let n = this.hit(p, { unlocked: false });
                if (n) {
                    this.app.fill = V.clone(n.fill);
                    this.app.stroke = n.stroke;
                    this.app.strokeWidth = n.strokeWidth;
                    this.app.opacity = n.opacity;
                    this.store.mutate('Sample appearance', () => { for (let a of this.store.selected)
                        if (!this.store.isLocked(a))
                            Object.assign(a, { fill: V.clone(n.fill), stroke: n.stroke, strokeWidth: n.strokeWidth, opacity: n.opacity }); });
                    this.app.refreshUI();
                    this.app.toast('Appearance sampled.');
                }
                return;
            }
            if (this.tool === 'erase') {
                this.store.history.begin('Erase objects');
                this.gesture = { kind: 'erase' };
                this.eraseAt(p);
                return;
            }
            if (this.tool === 'gradient') {
                let n = this.hit(p) || this.store.selected[0];
                if (!n || this.store.isLocked(n))
                    return;
                this.store.select([n.id]);
                this.store.history.begin('Edit gradient');
                n.fill = typeof n.fill === 'object' ? V.clone(n.fill) : { type: 'linear', color0: n.fill === 'none' ? '#F5BC8B' : n.fill, color1: '#344C3D', angle: 0 };
                this.gesture = { kind: 'gradient', n, start: V.transform(V.inverse(n.matrix) || V.ident(), p) };
                this.store.emit();
                return;
            }
            if (this.tool === 'artboard') {
                let b = this.store.activeBoard, bb = { x: b.x, y: b.y, x2: b.x + b.w, y2: b.y + b.h, w: b.w, h: b.h }, h = this.hitHandle(p, bb);
                if (h && h.key !== 'rotate' && !e.shiftKey) {
                    this.store.history.begin('Resize artboard');
                    this.gesture = { kind: 'boardresize', b, original: { ...b }, handle: h };
                }
                else if (board && !e.shiftKey) {
                    this.store.activeArtboard = board.id;
                    this.store.history.begin('Move artboard');
                    this.gesture = { kind: 'boardmove', b: board, start: p, x: board.x, y: board.y, originals: this.store.doc.nodes.filter(n => n.artboardId === board.id).map(n => ({ n, m: [...n.matrix] })) };
                }
                else {
                    this.store.history.begin('Create artboard');
                    let b = { id: V.uid('board'), name: 'Artboard ' + (this.store.doc.artboards.length + 1), x: p.x, y: p.y, w: 1, h: 1, background: '#FFFFFF' };
                    this.store.doc.artboards.push(b);
                    this.store.activeArtboard = b.id;
                    this.gesture = { kind: 'boarddraw', b, start: p };
                }
                this.store.select([]);
                this.store.emit();
                return;
            }
            if (this.store.doc.layers.find(l => l.id === this.store.activeLayer)?.locked) {
                this.app.toast('Unlock the active layer before drawing.', true);
                return;
            }
            let start = this.snapPoint(p), n;
            if (this.tool === 'pencil' || this.tool === 'brush') {
                this.store.history.begin('Draw ' + this.tool);
                let stroke = this.app.stroke === 'none' ? (typeof this.app.fill === 'string' && this.app.fill !== 'none' ? this.app.fill : '#EB713F') : this.app.stroke;
                n = V.node('path', { name: this.tool === 'brush' ? 'Brush stroke' : 'Pencil path', paths: [{ closed: false, points: [V.anchor(start.x, start.y)] }], fill: 'none', stroke, opacity: this.app.opacity, strokeWidth: this.tool === 'brush' ? Math.max(6, this.app.strokeWidth) : this.app.strokeWidth || 2 });
                this.store.add(n);
                this.store.select([n.id]);
                this.gesture = { kind: 'freehand', n, start, points: [start] };
            }
            else {
                this.store.history.begin('Draw ' + this.tool);
                n = V.node(this.tool, { w: 0, h: 0, matrix: V.translate(start.x, start.y), fill: V.clone(this.app.fill), stroke: this.app.stroke, opacity: this.app.opacity, strokeWidth: this.app.strokeWidth, radius: 0, sides: this.tool === 'polygon' ? 6 : 5, innerRatio: .45 });
                if (this.tool === 'line') {
                    n.fill = 'none';
                    n.stroke = this.app.stroke === 'none' ? (typeof this.app.fill === 'string' && this.app.fill !== 'none' ? this.app.fill : '#EB713F') : this.app.stroke;
                }
                this.store.add(n);
                this.store.select([n.id]);
                this.gesture = { kind: 'draw', n, start };
            }
            this.store.emit();
        }
        move(e) {
            const p = this.world(e), screen = this.local(e);
            this.pointer = p;
            let g = this.gesture;
            if (!g) {
                if (this.tool === 'select' || this.tool === 'direct') {
                    let n = this.hit(p);
                    if (this.hover?.id !== n?.id) {
                        this.hover = n;
                        this.app.invalidate();
                    }
                    let b = this.store.selectionBounds(), h = this.tool === 'select' && b ? this.hitHandle(p, b) : null;
                    this.canvas.style.cursor = this.space ? 'grab' : h ? (h.key === 'rotate' ? 'crosshair' : ({ nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }[h.key])) : 'default';
                }
                if (this.pen)
                    this.app.invalidate();
                return;
            }
            if (g.kind === 'pan') {
                this.cam.x = g.x + screen.x - g.screen.x;
                this.cam.y = g.y + screen.y - g.screen.y;
                this.app.invalidate();
                return;
            }
            if (g.kind === 'marquee') {
                g.end = p;
                this.app.invalidate();
                return;
            }
            if (g.kind === 'move') {
                let d = V.sub(p, g.start);
                if (e.shiftKey) {
                    if (Math.abs(d.x) > Math.abs(d.y))
                        d.y = 0;
                    else
                        d.x = 0;
                }
                if (!e.ctrlKey && !e.metaKey)
                    d = this.snapDelta(d, g.b, this.store.selection);
                for (let { n, m } of g.originals)
                    n.matrix = V.matrix(V.translate(d.x, d.y), m);
            }
            else if (g.kind === 'resize') {
                let q = e.ctrlKey ? p : this.snapPoint(p, this.store.selection), fixed = e.altKey ? g.center : g.handle.fixed, key = g.handle.key, sx = key === 'n' || key === 's' ? 1 : (q.x - fixed.x) / ((g.handle.p.x - fixed.x) || 1), sy = key === 'e' || key === 'w' ? 1 : (q.y - fixed.y) / ((g.handle.p.y - fixed.y) || 1);
                if ((e.shiftKey || this.app.constrain) && key.length === 2) {
                    let s = Math.abs(sx - 1) > Math.abs(sy - 1) ? Math.abs(sx) : Math.abs(sy);
                    sx = Math.sign(sx || 1) * s;
                    sy = Math.sign(sy || 1) * s;
                }
                if (Math.abs(sx) < .005)
                    sx = .005 * Math.sign(sx || 1);
                if (Math.abs(sy) < .005)
                    sy = .005 * Math.sign(sy || 1);
                let m = V.around(V.scale(sx, sy), fixed);
                for (let o of g.originals)
                    o.n.matrix = V.matrix(m, o.m);
            }
            else if (g.kind === 'rotate') {
                let angle = Math.atan2(p.y - g.center.y, p.x - g.center.x) - g.angle;
                if (e.shiftKey)
                    angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
                for (let o of g.originals)
                    o.n.matrix = V.matrix(V.around(V.rotate(angle), g.center), o.m);
            }
            else if (g.kind === 'draw') {
                let q = e.ctrlKey ? p : this.snapPoint(p, new Set([g.n.id])), dx = q.x - g.start.x, dy = q.y - g.start.y;
                if (g.n.type === 'line') {
                    if (e.shiftKey) {
                        let a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, l = Math.hypot(dx, dy);
                        dx = Math.cos(a) * l;
                        dy = Math.sin(a) * l;
                    }
                    g.n.w = dx;
                    g.n.h = dy;
                }
                else {
                    if (e.shiftKey) {
                        let size = Math.max(Math.abs(dx), Math.abs(dy));
                        dx = Math.sign(dx || 1) * size;
                        dy = Math.sign(dy || 1) * size;
                    }
                    g.n.w = Math.abs(dx);
                    g.n.h = Math.abs(dy);
                    g.n.matrix = V.translate(g.start.x + Math.min(0, dx), g.start.y + Math.min(0, dy));
                    if (e.altKey) {
                        g.n.matrix = V.translate(g.start.x - Math.abs(dx), g.start.y - Math.abs(dy));
                        g.n.w *= 2;
                        g.n.h *= 2;
                    }
                }
            }
            else if (g.kind === 'freehand') {
                if (g.points.length < 10000 && V.dist(g.points.at(-1), p) * this.cam.zoom > .9) {
                    g.points.push(p);
                    g.n.paths = [{ closed: false, points: g.points.map(p => V.anchor(p.x, p.y)) }];
                }
            }
            else if (g.kind === 'pen') {
                let a = g.n.paths[0].points[g.ai], d = V.sub(p, a);
                if (V.len(d) * this.cam.zoom > 2) {
                    if (e.shiftKey) {
                        let angle = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * Math.PI / 4, l = V.len(d);
                        d = V.pt(Math.cos(angle) * l, Math.sin(angle) * l);
                    }
                    a.out = V.add(a, d);
                    a.in = e.altKey ? null : V.sub(a, d);
                }
            }
            else if (g.kind === 'anchor') {
                let inv = V.inverse(g.n.matrix) || V.ident(), local = V.transform(inv, p), old = g.original, a = g.n.paths[g.pi].points[g.ai];
                let part = g.part;
                if (part === 'point') {
                    let start = V.transform(inv, g.start), d = V.sub(local, start);
                    if (e.shiftKey) {
                        if (Math.abs(d.x) > Math.abs(d.y))
                            d.y = 0;
                        else
                            d.x = 0;
                    }
                    a.x = old.x + d.x;
                    a.y = old.y + d.y;
                    a.in = old.in ? V.add(old.in, d) : null;
                    a.out = old.out ? V.add(old.out, d) : null;
                }
                else {
                    a[part] = local;
                    let other = part === 'in' ? 'out' : 'in';
                    if (!e.altKey && old[other])
                        a[other] = V.sub(V.mul(a, 2), local);
                }
            }
            else if (g.kind === 'gradient') {
                let q = V.transform(V.inverse(g.n.matrix) || V.ident(), p);
                g.n.fill.angle = Math.atan2(q.y - g.start.y, q.x - g.start.x) * 180 / Math.PI;
            }
            else if (g.kind === 'erase') {
                this.eraseAt(p);
                return;
            }
            else if (g.kind === 'guide') {
                g.guide.value = p[g.guide.axis];
            }
            else if (g.kind === 'boardmove') {
                let d = V.sub(p, g.start);
                g.b.x = g.x + d.x;
                g.b.y = g.y + d.y;
                for (let o of g.originals)
                    o.n.matrix = V.matrix(V.translate(d.x, d.y), o.m);
            }
            else if (g.kind === 'boarddraw') {
                g.b.x = Math.min(g.start.x, p.x);
                g.b.y = Math.min(g.start.y, p.y);
                g.b.w = Math.max(1, Math.abs(p.x - g.start.x));
                g.b.h = Math.max(1, Math.abs(p.y - g.start.y));
            }
            else if (g.kind === 'boardresize') {
                let f = g.handle.fixed, key = g.handle.key, old = g.original;
                if (key !== 'n' && key !== 's') {
                    g.b.x = Math.min(f.x, p.x);
                    g.b.w = Math.max(1, Math.abs(p.x - f.x));
                }
                else {
                    g.b.x = old.x;
                    g.b.w = old.w;
                }
                if (key !== 'e' && key !== 'w') {
                    g.b.y = Math.min(f.y, p.y);
                    g.b.h = Math.max(1, Math.abs(p.y - f.y));
                }
                else {
                    g.b.y = old.y;
                    g.b.h = old.h;
                }
            }
            this.store.emit('gesture');
        }
        up(e) {
            let g = this.gesture;
            if (!g)
                return;
            this.gesture = null;
            this.snapLines = [];
            if (g.kind === 'marquee') {
                let b = V.bounds([g.start, g.end]), items = this.store.index.query(b).filter(i => !this.store.isLocked(i.node)), ids = new Set(g.add ? this.store.selection : []);
                for (let i of items)
                    for (let id of this.idsFor(i.node))
                        ids.add(id);
                this.store.select([...ids]);
            }
            else if (g.kind === 'draw') {
                if (Math.abs(g.n.w) + Math.abs(g.n.h) < 3 / this.cam.zoom) {
                    g.n.w = 100;
                    g.n.h = g.n.type === 'line' ? 0 : 100;
                }
                this.store.emit();
            }
            else if (g.kind === 'freehand') {
                let ps = V.simplify(g.points, .8 / this.cam.zoom);
                if (ps.length < 2)
                    this.store.doc.nodes = this.store.doc.nodes.filter(n => n.id !== g.n.id);
                else
                    g.n.paths = [V.smoothPath(ps, false, this.tool === 'brush' ? .18 : .12)];
                this.store.cleanSelection();
                this.store.emit();
            }
            else if (g.kind === 'guide') {
                let p = this.local(e);
                if (p.x < 22 || p.y < 22)
                    this.store.doc.guides = this.store.doc.guides.filter(a => a !== g.guide);
                this.store.emit();
            }
            else if (g.kind === 'boarddraw' && g.b.w < 10 && g.b.h < 10) {
                g.b.w = 720;
                g.b.h = 840;
                this.store.emit();
            }
            if (g.kind !== 'pen' && g.kind !== 'pan')
                this.store.history.commit();
            this.app.refreshUI();
            this.updateCursor();
            this.app.invalidate();
        }
        penDown(e, p) { let n = this.pen, ps = n?.paths[0].points; if (n && ps.length >= 3 && V.dist(p, ps[0]) * this.cam.zoom < 9) {
            n.paths[0].closed = true;
            this.finishPen();
            return;
        } if (!n) {
            if (this.store.doc.layers.find(l => l.id === this.store.activeLayer)?.locked) {
                this.app.toast('Unlock the active layer before drawing.', true);
                return;
            }
            this.store.history.begin('Draw Bézier path');
            n = V.node('path', { name: 'Bézier path', paths: [{ closed: false, points: [] }], fill: V.clone(this.app.fill), stroke: this.app.stroke, opacity: this.app.opacity, strokeWidth: this.app.strokeWidth });
            this.store.add(n);
            this.pen = n;
            this.store.select([n.id]);
            ps = n.paths[0].points;
        } let q = this.snapPoint(p, new Set([n.id])); if (e.shiftKey && ps.length) {
            let last = ps.at(-1), d = V.sub(q, last), a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * Math.PI / 4;
            q = V.add(last, V.pt(Math.cos(a) * V.len(d), Math.sin(a) * V.len(d)));
        } ps.push(V.anchor(q.x, q.y)); this.gesture = { kind: 'pen', n, ai: ps.length - 1 }; this.store.emit(); }
        finishPen() { if (!this.pen)
            return; let n = this.pen, ps = n.paths[0].points; this.pen = null; this.gesture = null; if (ps.length < 2)
            this.store.doc.nodes = this.store.doc.nodes.filter(a => a.id !== n.id); if (!n.paths[0].closed && n.fill === 'none' && n.stroke === 'none')
            n.stroke = '#EB713F'; this.store.cleanSelection(); this.store.emit(); this.store.history.commit(); this.app.refreshUI(); this.app.invalidate(); }
        eraseAt(p) { let n = this.hit(p); if (n) {
            this.store.doc.nodes = this.store.doc.nodes.filter(a => a.id !== n.id);
            this.store.selection.delete(n.id);
            this.store.emit('gesture');
        } }
        doubleClick(e) { let p = this.world(e); if (this.pen) {
            let ps = this.pen.paths[0].points;
            if (ps.length > 1 && V.dist(ps.at(-1), ps.at(-2)) * this.cam.zoom < 3)
                ps.pop();
            this.finishPen();
            return;
        } let n = this.hit(p); if (n?.type === 'text') {
            this.store.select([n.id]);
            this.editText(n);
            return;
        } if (this.tool === 'direct' && n && !this.store.isLocked(n) && !['text', 'image'].includes(n.type))
            this.insertAnchor(n, p); }
        insertAnchor(n, p) { this.store.mutate('Edit path anchor', () => { if (n.type !== 'path') {
            n.paths = V.clone(V.shapePaths(n));
            n.type = 'path';
        } let inv = V.inverse(n.matrix); if (!inv)
            return; let q = V.transform(inv, p), hit = null, near = 8 / this.cam.zoom; for (let [pi, path] of n.paths.entries())
            for (let [ai, a] of path.points.entries()) {
                let d = V.dist(a, q);
                if (d < near) {
                    near = d;
                    hit = { pi, ai, a };
                }
            } if (hit) {
            let { a, ai, pi } = hit, path = n.paths[pi], ps = path.points;
            if (a.in || a.out) {
                a.in = null;
                a.out = null;
            }
            else {
                let prev = ps[(ai - 1 + ps.length) % ps.length], next = ps[(ai + 1) % ps.length], d = V.mul(V.sub(next, prev), .2);
                a.in = V.sub(a, d);
                a.out = V.add(a, d);
            }
            this.anchorSelection = { id: n.id, pi, ai };
            return;
        } let best = { d: Infinity }; for (let [pi, path] of n.paths.entries()) {
            let ps = path.points, count = path.closed ? ps.length : ps.length - 1;
            for (let i = 0; i < count; i++) {
                let a = ps[i], b = ps[(i + 1) % ps.length];
                for (let j = 1; j < 64; j++) {
                    let t = j / 64, v = V.cubic(a, a.out || a, b.in || b, b, t), d = V.dist(v, q);
                    if (d < best.d)
                        best = { d, pi, i, t, a, b };
                }
            }
        } if (!Number.isFinite(best.d))
            return; let { pi, i, t, a, b } = best, [l, r] = V.splitCubic(a, a.out || a, b.in || b, b, t); a.out = l[1]; b.in = r[2]; n.paths[pi].points.splice(i + 1, 0, V.anchor(l[3].x, l[3].y, l[2], r[1])); this.anchorSelection = { id: n.id, pi, ai: i + 1 }; }); }
        deleteSelection() { if (this.tool === 'direct' && this.anchorSelection) {
            let { id, pi, ai } = this.anchorSelection, n = this.store.doc.nodes.find(n => n.id === id);
            if (n?.type === 'path' && !this.store.isLocked(n)) {
                this.store.mutate('Delete anchor', () => { let p = n.paths[pi]; p.points.splice(ai, 1); n.paths = n.paths.filter(p => p.points.length >= 2); if (!n.paths.length)
                    this.store.doc.nodes = this.store.doc.nodes.filter(a => a.id !== id); });
                this.anchorSelection = null;
                return;
            }
        } this.store.delete(); }
        editText(n, existingTransaction = false) { if (this.textNode && this.textNode !== n)
            this.finishText(); if (!existingTransaction)
            this.store.history.begin('Edit text'); this.textNode = n; this.renderer.editingText = n.id; let te = this.app.dom.textEditor; te.value = n.text; te.hidden = false; this.positionText(); te.focus(); te.select(); this.app.invalidate(); }
        positionText() { if (!this.textNode)
            return; let n = this.textNode, m = V.matrix([this.cam.zoom, 0, 0, this.cam.zoom, this.cam.x, this.cam.y], n.matrix), te = this.app.dom.textEditor; te.style.left = '0px'; te.style.top = '0px'; te.style.width = (n.w + 35) + 'px'; te.style.height = (n.h + 14) + 'px'; te.style.transform = `matrix(${m.join(',')})`; te.style.font = `${n.fontStyle || 'normal'} ${n.fontWeight || 400} ${n.fontSize}px ${n.fontFamily || 'Arial'}`; te.style.lineHeight = n.lineHeight; te.style.letterSpacing = (n.letterSpacing || 0) + 'px'; te.style.color = typeof n.fill === 'object' ? n.fill.color0 : n.fill === 'none' ? '#111' : n.fill; }
        finishText(cancel = false) { if (!this.textNode)
            return; let n = this.textNode; this.textNode = null; this.renderer.editingText = null; this.app.dom.textEditor.hidden = true; if (cancel)
            this.store.history.cancel();
        else {
            n.text = this.app.dom.textEditor.value;
            if (!n.text.trim())
                this.store.doc.nodes = this.store.doc.nodes.filter(a => a.id !== n.id);
            V.measureText(n);
            this.store.cleanSelection();
            this.store.emit();
            this.store.history.commit();
        } this.app.refreshUI(); this.app.invalidate(); }
        cancel() { this.gesture = null; this.pen = null; this.snapLines = []; this.store.history.cancel(); this.updateCursor(); this.app.refreshUI(); this.app.invalidate(); }
        drawPath(ctx, n, color = '#80adff', dash = []) { ctx.save(); ctx.translate(this.cam.x, this.cam.y); ctx.scale(this.cam.zoom, this.cam.zoom); ctx.transform(...n.matrix); ctx.strokeStyle = color; let s = Math.max(.001, Math.max(Math.hypot(n.matrix[0], n.matrix[1]), Math.hypot(n.matrix[2], n.matrix[3]))); ctx.lineWidth = 1 / (this.cam.zoom * s); ctx.setLineDash(dash); if (n.type === 'text' || n.type === 'image') {
            let b = V.localBounds(n);
            ctx.strokeRect(b.x, b.y, b.w, b.h);
        }
        else
            ctx.stroke(new Path2D(V.pathsToD(V.shapePaths(n)))); ctx.restore(); }
        drawOverlay() {
            const c = this.canvas.getContext('2d'), cam = this.cam, dpr = this.renderer.dpr || devicePixelRatio, blue = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#79aafa';
            c.setTransform(dpr, 0, 0, dpr, 0, 0);
            c.clearRect(0, 0, cam.width, cam.height);
            c.save();
            c.beginPath();
            c.rect(22, 22, cam.width - 22, cam.height - 22);
            c.clip();
            if (this.app.showGuides)
                for (let g of this.store.doc.guides || [])
                    this.drawGuide(c, g, '#64b2bc', [4, 4]);
            for (let g of this.snapLines)
                this.drawGuide(c, g, '#dd83cc', [3, 3]);
            if (this.hover && !this.store.selection.has(this.hover.id) && !this.gesture)
                this.drawPath(c, this.hover, '#76a6fa');
            for (let n of this.store.selected)
                if (n.id !== this.renderer.editingText)
                    this.drawPath(c, n, blue);
            if (this.tool === 'direct' || this.pen) {
                for (let n of this.store.selected) {
                    if (['text', 'image'].includes(n.type))
                        continue;
                    V.shapePaths(n).forEach((path, pi) => path.points.forEach((a, ai) => { let p = cam.screen(V.transform(n.matrix, a)); c.strokeStyle = blue; c.fillStyle = '#fafafa'; c.lineWidth = 1; for (let kind of ['in', 'out'])
                        if (a[kind]) {
                            let h = cam.screen(V.transform(n.matrix, a[kind]));
                            c.beginPath();
                            c.moveTo(p.x, p.y);
                            c.lineTo(h.x, h.y);
                            c.stroke();
                            c.beginPath();
                            c.arc(h.x, h.y, 2.5, 0, Math.PI * 2);
                            c.fill();
                            c.stroke();
                        } let selected = this.anchorSelection?.id === n.id && this.anchorSelection.pi === pi && this.anchorSelection.ai === ai; c.fillStyle = selected ? blue : '#fafafa'; c.fillRect(p.x - 3, p.y - 3, 6, 6); c.strokeRect(p.x - 3, p.y - 3, 6, 6); }));
                }
            }
            let b = this.store.selectionBounds();
            if (b && !this.pen && !this.textNode && ['select', 'rotate'].includes(this.tool)) {
                this.drawBox(c, b, blue, true);
            }
            if (this.tool === 'artboard') {
                let b = this.store.activeBoard;
                this.drawBox(c, { x: b.x, y: b.y, x2: b.x + b.w, y2: b.y + b.h, w: b.w, h: b.h }, blue, false);
            }
            if (this.pen && this.pen.paths[0].points.length) {
                let last = this.pen.paths[0].points.at(-1), p = cam.screen(last), end = cam.screen(this.pointer);
                c.beginPath();
                c.moveTo(p.x, p.y);
                if (last.out) {
                    let h = cam.screen(last.out);
                    c.bezierCurveTo(h.x, h.y, end.x, end.y, end.x, end.y);
                }
                else
                    c.lineTo(end.x, end.y);
                c.strokeStyle = blue;
                c.setLineDash([4, 3]);
                c.stroke();
                c.setLineDash([]);
            }
            if (this.gesture?.kind === 'marquee') {
                let b = V.bounds([this.gesture.start, this.gesture.end]), p = cam.screen(b);
                c.fillStyle = '#79aafa15';
                c.strokeStyle = blue;
                c.lineWidth = 1;
                c.fillRect(p.x, p.y, b.w * cam.zoom, b.h * cam.zoom);
                c.setLineDash([4, 3]);
                c.strokeRect(p.x, p.y, b.w * cam.zoom, b.h * cam.zoom);
                c.setLineDash([]);
            }
            if (this.gesture?.kind === 'gradient') {
                let g = this.gesture, a = cam.screen(V.transform(g.n.matrix, g.start)), b = cam.screen(this.pointer);
                c.strokeStyle = '#eee';
                c.lineWidth = 2;
                c.beginPath();
                c.moveTo(a.x, a.y);
                c.lineTo(b.x, b.y);
                c.stroke();
                c.fillStyle = '#fff';
                c.strokeStyle = '#333';
                for (let p of [a, b]) {
                    c.beginPath();
                    c.arc(p.x, p.y, 4, 0, Math.PI * 2);
                    c.fill();
                    c.stroke();
                }
            }
            c.restore();
            this.drawRulers(c);
            this.positionText();
        }
        drawBox(c, b, color, rotation) { let p = this.cam.screen(V.pt(b.x, b.y)); c.strokeStyle = color; c.lineWidth = 1; c.strokeRect(p.x, p.y, b.w * this.cam.zoom, b.h * this.cam.zoom); if (rotation) {
            let x = (b.x + b.x2) / 2, a = this.cam.screen(V.pt(x, b.y)), z = this.cam.screen(V.pt(x, b.y - 25 / this.cam.zoom));
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(z.x, z.y);
            c.stroke();
            c.beginPath();
            c.arc(z.x, z.y, 3.5, 0, V.TAU);
            c.fillStyle = '#fff';
            c.fill();
            c.stroke();
        } for (let h of this.handles(b)) {
            let p = this.cam.screen(h.p);
            c.fillStyle = '#f6f6f6';
            c.fillRect(p.x - 3, p.y - 3, 6, 6);
            c.strokeRect(p.x - 3, p.y - 3, 6, 6);
        } }
        drawGuide(c, g, color, dash) { let p = this.cam.screen(g.axis === 'x' ? V.pt(g.value, 0) : V.pt(0, g.value)); c.save(); c.strokeStyle = color; c.lineWidth = 1; c.setLineDash(dash); c.beginPath(); if (g.axis === 'x') {
            c.moveTo(p.x, 22);
            c.lineTo(p.x, this.cam.height);
        }
        else {
            c.moveTo(22, p.y);
            c.lineTo(this.cam.width, p.y);
        } c.stroke(); c.restore(); }
        drawRulers(c) { const dark = document.documentElement.dataset.theme !== 'light', cam = this.cam; c.fillStyle = dark ? '#303133' : '#ececee'; c.fillRect(0, 0, cam.width, 22); c.fillRect(0, 0, 22, cam.height); c.strokeStyle = dark ? '#4b4c4e' : '#bfc1c5'; c.lineWidth = 1; c.beginPath(); c.moveTo(22, 22.5); c.lineTo(cam.width, 22.5); c.moveTo(22.5, 22); c.lineTo(22.5, cam.height); c.stroke(); let desired = 85 / cam.zoom, pow = Math.pow(10, Math.floor(Math.log10(desired))), step = [1, 2, 5, 10].map(x => x * pow).find(x => x >= desired) || pow * 10, minor = step / 5; c.font = '8px Arial'; c.fillStyle = dark ? '#97999e' : '#767a82'; c.strokeStyle = dark ? '#64666b' : '#acaeb4'; for (let axis of ['x', 'y']) {
            let pan = axis === 'x' ? cam.x : cam.y, size = axis === 'x' ? cam.width : cam.height, start = Math.floor((22 - pan) / cam.zoom / minor) * minor;
            for (let v = start; v < (size - pan) / cam.zoom; v += minor) {
                let screen = v * cam.zoom + pan;
                if (screen < 23)
                    continue;
                let major = Math.abs(v / step - Math.round(v / step)) < .0001;
                c.beginPath();
                if (axis === 'x') {
                    c.moveTo(Math.round(screen) + .5, major ? 13 : 18);
                    c.lineTo(Math.round(screen) + .5, 22);
                    if (major)
                        c.fillText(String(Math.round(v * 100) / 100), screen + 3, 10);
                }
                else {
                    c.moveTo(major ? 13 : 18, Math.round(screen) + .5);
                    c.lineTo(22, Math.round(screen) + .5);
                    if (major) {
                        c.save();
                        c.translate(9, screen + 3);
                        c.rotate(-Math.PI / 2);
                        c.fillText(String(Math.round(v * 100) / 100), 0, 0);
                        c.restore();
                    }
                }
                c.stroke();
            }
        } c.fillStyle = dark ? '#393a3c' : '#dedfe1'; c.fillRect(0, 0, 22, 22); c.strokeStyle = dark ? '#81848a' : '#8c9097'; c.beginPath(); c.moveTo(7, 15); c.lineTo(15, 7); c.moveTo(7, 7); c.lineTo(7, 15); c.lineTo(15, 15); c.stroke(); }
    }
    V.Editor = Editor;
    V.toolInfo = toolInfo;
})();
const VectoraEditor = globalThis.V;


return {VectoraEditor};
})();
const __meridian_20 = (() => {
/* Módulo oficial de Desenho Vetorial (Vectora) adaptado para a suíte Escola Office.
 * 100% em Português do Brasil, local-first, sem dependências externas. */
'use strict';

const { VectoraGeometry } = __meridian_4;
const { VectoraDocument } = __meridian_5;
const { VectoraRenderer } = __meridian_21;
const { VectoraIO } = __meridian_22;
const { VectoraIcons } = __meridian_23;
const { VectoraEditor } = __meridian_24;
const TOOLS = [
    ['select', 'select', 'V'],
    ['direct', 'direct', 'A'],
    ['pen', 'pen', 'P'],
    ['pencil', 'pencil', 'N'],
    ['text', 'type', 'T'],
    ['line', 'line', '\\'],
    ['rect', 'rect', 'M'],
    ['ellipse', 'ellipse', 'L'],
    ['polygon', 'polygon', ''],
    ['star', 'star', 'S'],
    ['brush', 'brush', 'B'],
    ['erase', 'erase', 'E'],
    ['gradient', 'gradient', 'G'],
    ['eyedropper', 'eyedropper', 'I'],
    ['artboard', 'artboard', 'O'],
    ['rotate', 'rotate', 'R'],
    ['hand', 'hand', 'H'],
    ['zoom', 'zoom', 'Z']
];

const SWATCHES = [
    '#F2EFE5', '#FFFFFF', '#D8DBD6', '#A7ACA5', '#73796F', '#344C3D', '#253C30', '#151C19',
    '#F7D6B5', '#F4A27B', '#8c3b1d', '#CE512E', '#B53C33', '#E9A9A9', '#D2A7CB', '#977DC0',
    '#5E5BAC', '#2F5475', '#5C88AF', '#9CC0D1', '#CEE7DD', '#94BCAD', '#5D9D81', '#397057',
    '#DDE0AB', '#B2C079', '#D8C566', '#EAAF43', '#BA8763', '#7B5745'
];

class Draw {
    constructor(app) {
        this.app = app;
        this.fill = '#8c3b1d';
        this.stroke = 'none';
        this.strokeWidth = 2;
        this.opacity = 1;
        this.smartGuides = true;
        this.gridSnap = false;
        this.showGuides = true;
        this.lockGuides = false;
        this.constrain = false;
        this.currentTab = 'properties';
        this.expanded = new Set(['artwork', 'type']);
        this.commands = new Map();
        this.raf = 0;
        this.uiQueued = false;
        this.events = new AbortController();

        // Recuperar documento anterior ou carregar demonstração pedagógica
        const initialDoc = this.getInitialDocument();
        this.camera = new V.Camera();
        this.store = new V.DocumentStore(initialDoc);

        this.syncWithGlobalStore();
    }

    getInitialDocument() {
        try {
            const existing = this.app.store?.state?.draw;
            if (existing && Array.isArray(existing.nodes) && existing.nodes.length > 0) {
                return V.validateDocument(existing);
            }
        } catch (e) {
            console.warn('Documento vetorial anterior não pôde ser recuperado. Usando modelo pedagógico.', e);
        }
        return V.demoDocument();
    }

    syncWithGlobalStore() {
        this.store.addEventListener('change', e => {
            if (this.app.store?.state) {
                this.app.store.state.draw = this.store.doc;
                this.app.store.revision++;
                this.app.setSaved?.(false);
            }
            this.invalidate();
            if (e.detail.kind !== 'gesture') this.requestUI();
            this.status();
        });
    }

    mount(root) {
        this.root = root;
        root.innerHTML = `
        <div class="draw-studio">
            <!-- Barra Lateral de Ferramentas -->
            <aside class="tools" aria-label="Ferramentas de Desenho">
                <div class="tool-grid" id="draw-tool-grid"></div>
                <div class="tool-rule"></div>
                <div class="paint-stack">
                    <button id="draw-tool-stroke" title="Cor do Contorno" class="stack-stroke"></button>
                    <button id="draw-tool-fill" title="Cor do Preenchimento" class="stack-fill"></button>
                    <button class="swap" data-draw-cmd="swap-paint" title="Alternar preenchimento e contorno (Shift+X)">${V.icon('swap')}</button>
                    <button class="defaults" data-draw-cmd="default-paint" title="Preenchimento e contorno padrão (D)">${V.icon('defaultPaint')}</button>
                </div>
                <div class="mini-paints">
                    <button data-draw-cmd="solid" title="Preenchimento sólido" class="solid-mini"></button>
                    <button data-draw-cmd="gradient" title="Gradiente linear" class="gradient-mini"></button>
                    <button data-draw-cmd="no-fill" title="Sem preenchimento" class="none-mini"></button>
                </div>
                <div class="tool-rule"></div>
                <button class="tool-button solo" data-draw-cmd="outline" title="Alternar modo contorno (Ctrl+Y)">${V.icon('outline')}</button>
                <button class="tool-button solo" data-draw-cmd="shortcuts" title="Atalhos do teclado">${V.icon('more')}</button>
            </aside>

            <!-- Área Central de Desenho -->
            <section class="document-area" aria-label="Área de Desenho">
                <div class="document-tabs">
                    <button class="document-tab active" id="draw-document-tab" title="Título da Prancheta">
                        <span class="tab-icon">${V.icon('file')}</span>
                        <span id="draw-document-title">${V.esc(this.store.doc.name || 'Desenho Vetorial')}</span>
                        <span id="draw-document-mode">@ 100% (Vetor)</span>
                    </button>
                    <button class="tab-new" data-draw-cmd="new-board" title="Nova Prancheta">${V.icon('plus')}</button>
                    <span class="menu-spacer"></span>
                    <button class="tab-fit" data-draw-cmd="fit-all" title="Ajustar todas as pranchetas (Ctrl+Alt+0)">${V.icon('fit')}</button>
                </div>
                <div id="draw-stage" class="stage">
                    <canvas id="draw-background" aria-hidden="true"></canvas>
                    <canvas id="draw-gpu" aria-hidden="true"></canvas>
                    <canvas id="draw-fallback" aria-hidden="true" hidden></canvas>
                    <canvas id="draw-overlay" tabindex="0" aria-label="Área de desenho vetorial. V para seleção, P para caneta bézier, M para retângulo, Espaço para navegar."></canvas>
                    <textarea id="draw-text-editor" spellcheck="false" aria-label="Editar texto no desenho" hidden></textarea>
                    
                    <div id="draw-selection-toolbar" class="selection-toolbar" hidden>
                        <span id="draw-selection-count">1 objeto</span>
                        <span class="divider"></span>
                        <button data-draw-cmd="group" title="Agrupar">${V.icon('group')}</button>
                        <button data-draw-cmd="duplicate" title="Duplicar">${V.icon('copy')}</button>
                        <button data-draw-cmd="front" title="Trazer para frente">${V.icon('front')}</button>
                        <button data-draw-cmd="delete" title="Excluir">${V.icon('trash')}</button>
                    </div>

                    <div class="canvas-hint" id="draw-canvas-hint">
                        <kbd>V</kbd> Selecionar <span>·</span> <kbd>P</kbd> Caneta <span>·</span> <kbd>Espaço</kbd> Mover tela
                    </div>

                    <div class="canvas-controls">
                        <button data-draw-cmd="zoom-out" title="Reduzir zoom">${V.icon('minus')}</button>
                        <button data-draw-cmd="fit-all" title="Enquadrar pranchetas">${V.icon('fit')}</button>
                        <button data-draw-cmd="zoom-in" title="Aumentar zoom">${V.icon('plus')}</button>
                    </div>
                </div>
            </section>

            <!-- Painel Lateral de Propriedades e Camadas -->
            <aside class="panel-rail" aria-label="Atalhos do Painel">
                <button data-draw-tab="properties" title="Propriedades" class="active">${V.icon('sliders')}</button>
                <button data-draw-tab="layers" title="Camadas">${V.icon('layers')}</button>
                <button data-draw-tab="history" title="Histórico">${V.icon('history')}</button>
            </aside>
            <aside class="inspector" aria-label="Inspetor de Propriedades">
                <div class="panel-tabs">
                    <button data-draw-tab="properties" class="active">Propriedades</button>
                    <button data-draw-tab="layers">Camadas</button>
                    <button data-draw-tab="history">Histórico</button>
                </div>
                <div id="draw-properties-panel" class="panel-content"></div>
                <div id="draw-layers-panel" class="panel-content" hidden>
                    <div class="layer-search">
                        <span>${V.icon('search')}</span>
                        <input id="draw-layer-search" placeholder="Buscar objeto…" aria-label="Pesquisar nas camadas">
                    </div>
                    <div id="draw-layers-tree"></div>
                    <div class="layer-actions">
                        <span id="draw-layer-count"></span>
                        <span class="menu-spacer"></span>
                        <button class="icon-button" data-draw-cmd="new-layer" title="Nova camada">${V.icon('plus')}</button>
                        <button class="icon-button" data-draw-cmd="delete" title="Excluir objetos selecionados">${V.icon('trash')}</button>
                    </div>
                </div>
                <div id="draw-history-panel" class="panel-content" hidden></div>
                <div class="inspector-footer">
                    <span class="private-icon">${V.icon('shield')}</span> Seus desenhos permanecem seguros neste dispositivo.
                </div>
            </aside>
        </div>

        <div id="draw-color-popover" class="color-popover" hidden></div>
        `;

        this.dom = {
            stage: root.querySelector('#draw-stage'),
            overlay: root.querySelector('#draw-overlay'),
            textEditor: root.querySelector('#draw-text-editor'),
            gpu: root.querySelector('#draw-gpu'),
            fallback: root.querySelector('#draw-fallback'),
            background: root.querySelector('#draw-background')
        };

        this.invalidate = () => {
            if (this.raf) return;
            this.raf = requestAnimationFrame(() => {
                this.raf = 0;
                this.frame();
            });
        };

        this.renderer = new V.Renderer({
            gpu: this.dom.gpu,
            fallback: this.dom.fallback,
            background: this.dom.background,
            store: this.store,
            camera: this.camera,
            invalidate: this.invalidate
        });

        this.editor = new V.Editor(this);

        this.registerCommands();
        this.buildTools();
        this.bindEvents();

        this.renderer.addEventListener('ready', () => {
            this.updateEngine();
            this.resize();
        });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.dom.stage);

        this.resize();
        setTimeout(() => {
            this.editor.fitAll();
            this.refreshUI();
            this.status();
        }, 50);
    }

    requestUI() {
        if (this.uiQueued) return;
        this.uiQueued = true;
        queueMicrotask(() => {
            this.uiQueued = false;
            this.refreshUI();
        });
    }

    resize() {
        if (!this.dom?.stage) return;
        const r = this.dom.stage.getBoundingClientRect();
        if (!r.width || !r.height) return;
        this.camera.width = r.width;
        this.camera.height = r.height;
        this.renderer.resize(r.width, r.height, devicePixelRatio || 1);
        let dpr = this.renderer.dpr || 1;
        this.dom.overlay.width = Math.round(r.width * dpr);
        this.dom.overlay.height = Math.round(r.height * dpr);
        this.dom.overlay.style.width = r.width + 'px';
        this.dom.overlay.style.height = r.height + 'px';
        this.invalidate();
    }

    frame() {
        if (!this.renderer) return;
        this.renderer.frame();
        this.editor.drawOverlay();
        const z = Number((this.camera.zoom * 100).toFixed(1));
        const modeEl = this.root.querySelector('#draw-document-mode');
        if (modeEl) {
            modeEl.textContent = `@ ${z}% (${this.renderer.outline ? 'Contorno' : this.renderer.clip ? 'Recorte' : 'Vetor'})`;
        }

        const selCount = this.store.selection.size;
        const toolbar = this.root.querySelector('#draw-selection-toolbar');
        const hint = this.root.querySelector('#draw-canvas-hint');
        const countLabel = this.root.querySelector('#draw-selection-count');
        
        if (toolbar) toolbar.hidden = !selCount || !!this.editor.textNode || !!this.editor.pen;
        if (hint) hint.hidden = !!selCount || !!this.editor.pen;
        if (countLabel) countLabel.textContent = selCount + ' ' + (selCount === 1 ? 'objeto selecionado' : 'objetos selecionados');
    }

    updateEngine() {
        const mode = this.renderer.outline ? 'Canvas 2D · Contorno' : this.renderer.mode;
        this.app.setEngine?.(mode === 'WebGPU' ? 'WebGPU Vetorial' : 'Canvas 2D de Alta Fidelidade');
    }

    status() {
        const stats = this.renderer?.stats;
        this.app.setStatus?.(`
            <span>${this.store.doc.nodes.length} objetos vetoriais</span>
            <span>${this.store.doc.artboards.length} prancheta(s)</span>
            <span>Zoom: <strong>${Math.round(this.camera.zoom * 100)}%</strong></span>
        `);
    }

    register(id, label, shortcut, icon, run, enabled = () => true) {
        this.commands.set(id, { id, label, shortcut, icon, run, enabled });
    }

    registerCommands() {
        const s = this.store, e = this.editor;
        const R = (id, label, key, icon, fn, enabled) => this.register(id, label, key, icon, fn, enabled);
        const selected = () => s.selected.some(n => !s.isLocked(n));

        R('undo', 'Desfazer', 'Ctrl+Z', 'undo', () => { if (e.pen) e.finishPen(); s.history.undo(); });
        R('redo', 'Refazer', 'Ctrl+Shift+Z', 'redo', () => s.history.redo());
        R('copy', 'Copiar', 'Ctrl+C', 'copy', () => this.copy());
        R('cut', 'Recortar', 'Ctrl+X', 'copy', () => { this.copy(); s.delete(); });
        R('paste', 'Colar', 'Ctrl+V', 'copy', () => this.paste());
        R('duplicate', 'Duplicar', 'Ctrl+D', 'copy', () => s.duplicate());
        R('delete', 'Excluir', 'Delete', 'trash', () => e.deleteSelection());
        R('group', 'Agrupar', 'Ctrl+G', 'group', () => s.group());
        R('ungroup', 'Desagrupar', 'Ctrl+Shift+G', 'group', () => s.ungroup());
        R('front', 'Trazer para Frente', 'Ctrl+Shift+]', 'front', () => s.arrange('front'));
        R('back', 'Enviar para Trás', 'Ctrl+Shift+[', 'back', () => s.arrange('back'));
        R('forward', 'Avançar Camada', 'Ctrl+]', 'front', () => s.arrange('forward'));
        R('backward', 'Recuar Camada', 'Ctrl+[', 'back', () => s.arrange('backward'));

        for (let [mode, ic, label] of [
            ['left', 'alignLeft', 'Alinhar à Esquerda'],
            ['center', 'alignCenter', 'Alinhar ao Centro'],
            ['right', 'alignRight', 'Alinhar à Direita'],
            ['top', 'alignTop', 'Alinhar ao Topo'],
            ['middle', 'alignMiddle', 'Alinhar ao Centro Vertical'],
            ['bottom', 'alignBottom', 'Alinhar à Base']
        ]) {
            R('align-' + mode, label, '', ic, () => s.align(mode));
        }

        R('distribute-x', 'Distribuir Horizontalmente', '', 'alignCenter', () => s.distribute('x'));
        R('distribute-y', 'Distribuir Verticalmente', '', 'alignMiddle', () => s.distribute('y'));

        for (let [op, label, icon] of [
            ['union', 'Unir Formas', 'union'],
            ['subtract', 'Recortar Formas', 'subtract'],
            ['intersect', 'Interseção', 'intersect'],
            ['xor', 'Excluir Sobreposição', 'xor']
        ]) {
            R('boolean-' + op, label, '', icon, () => s.boolean(op));
        }

        R('expand', 'Converter em Caminhos', '', 'path', () => s.convertToPath());
        R('flip-h', 'Espelhar Horizontalmente', '', 'flipH', () => this.flip('x'));
        R('flip-v', 'Espelhar Verticalmente', '', 'flipV', () => this.flip('y'));
        R('lock', 'Bloquear Seleção', 'Ctrl+2', 'lock', () => { s.mutate('Bloquear objetos', () => { for (let n of s.selected) n.locked = true; s.selection.clear(); }); });
        R('unlock-all', 'Desbloquear Tudo', '', 'unlock', () => s.mutate('Desbloquear tudo', () => { for (let n of s.doc.nodes) n.locked = false; for (let l of s.doc.layers) l.locked = false; }));
        R('select-all', 'Selecionar Tudo', 'Ctrl+A', 'select', () => s.select(s.visibleNodes.filter(n => !s.isLocked(n)).map(n => n.id)));
        R('deselect', 'Desmarcar', 'Esc', 'select', () => s.select([]));

        R('zoom-in', 'Aumentar Zoom', '+', 'zoom', () => { this.camera.zoomAt(1.25, V.pt(this.camera.width / 2, this.camera.height / 2)); this.invalidate(); });
        R('zoom-out', 'Reduzir Zoom', '−', 'zoom', () => { this.camera.zoomAt(0.8, V.pt(this.camera.width / 2, this.camera.height / 2)); this.invalidate(); });
        R('fit-all', 'Enquadrar Pranchetas', 'Ctrl+Alt+0', 'fit', () => e.fitAll());
        R('actual-size', 'Tamanho Real (100%)', 'Ctrl+1', 'zoom', () => { this.camera.zoomAt(1 / this.camera.zoom, V.pt(this.camera.width / 2, this.camera.height / 2)); this.invalidate(); });
        R('outline', 'Modo Contorno', 'Ctrl+Y', 'outline', () => { this.renderer.outline = !this.renderer.outline; this.updateEngine(); this.invalidate(); this.refreshUI(); });
        R('grid', 'Grade de Desenho', "Ctrl+'", 'grid', () => { this.renderer.grid = !this.renderer.grid; this.invalidate(); this.refreshUI(); });
        R('grid-snap', 'Magnetismo na Grade', '', 'grid', () => { this.gridSnap = !this.gridSnap; this.app.notify?.('Alinhamento à grade ' + (this.gridSnap ? 'ativado' : 'desativado') + '.'); this.refreshUI(); });
        R('smart-guides', 'Guias Magnéticas', 'Ctrl+U', 'magnet', () => { this.smartGuides = !this.smartGuides; this.app.notify?.('Guias inteligentes ' + (this.smartGuides ? 'ativadas' : 'desativadas') + '.'); this.refreshUI(); });

        R('new-board', 'Nova Prancheta', '', 'artboard', () => this.addBoard());
        R('new-layer', 'Nova Camada', '', 'plus', () => this.addLayer());

        R('swap-paint', 'Inverter Cores', 'Shift+X', 'swap', () => {
            const fill = typeof this.fill === 'object' ? this.fill.color0 : this.fill, stroke = this.stroke;
            this.fill = stroke;
            this.stroke = fill;
            s.mutate('Alternar preenchimento e contorno', () => {
                for (let n of s.selected) if (!s.isLocked(n)) {
                    let f = typeof n.fill === 'object' ? n.fill.color0 : n.fill;
                    n.fill = n.stroke;
                    n.stroke = f;
                }
            });
            this.refreshUI();
        });

        R('default-paint', 'Cores Padrão', 'D', 'defaultPaint', () => {
            this.fill = '#FFFFFF';
            this.stroke = '#2E2820';
            this.strokeWidth = 2;
            s.mutate('Aparência padrão', () => {
                for (let n of s.selected) if (!s.isLocked(n)) Object.assign(n, { fill: this.fill, stroke: this.stroke, strokeWidth: 2 });
            });
            this.refreshUI();
        });

        R('solid', 'Preenchimento Sólido', '', 'rect', () => this.applyPaint(typeof this.fill === 'string' && this.fill !== 'none' ? this.fill : '#8c3b1d'));
        R('no-fill', 'Sem Preenchimento', '/', 'erase', () => this.applyPaint('none'));
        R('gradient', 'Gradiente Linear', '', 'gradient', () => this.applyPaint({ type: 'linear', color0: typeof this.fill === 'string' && this.fill !== 'none' ? this.fill : '#F4A27B', color1: '#8c3b1d', angle: 45 }));

        R('export-svg', 'Exportar SVG Vetorial', '', 'export', () => this.exportSVG());
        R('export-png', 'Exportar Imagem PNG', '', 'export', () => this.exportPNG());

        for (let [id, icon, key] of TOOLS) {
            R('tool-' + id, V.toolInfo[id][0], key, icon, () => e.setTool(id));
        }
    }

    async run(id) {
        const c = this.commands.get(id);
        if (!c) return;
        try {
            await c.run();
        } catch (e) {
            console.error(e);
            this.app.notify?.(e.message || String(e), true);
        }
        this.updateToolUI();
        this.invalidate();
    }

    buildTools() {
        const grid = this.root.querySelector('#draw-tool-grid');
        if (!grid) return;
        grid.innerHTML = TOOLS.map(([id, ic, key]) => `
            <button class="tool-button ${id === this.editor.tool ? 'active' : ''}" data-tool="${id}" title="${V.esc(V.toolInfo[id][0])}${key ? ' (' + key + ')' : ''}" aria-label="${V.esc(V.toolInfo[id][0])}">
                ${V.icon(ic)}
            </button>
        `).join('');
    }

    updateToolUI() {
        this.root.querySelectorAll('[data-tool]').forEach(b => {
            const on = b.dataset.tool === this.editor.tool;
            b.classList.toggle('active', on);
        });
    }

    paintCSS(fill) {
        return fill === 'none' 
            ? 'linear-gradient(135deg,#fff 44%,#e95757 45%,#e95757 55%,#fff 56%)' 
            : typeof fill === 'object' 
            ? `linear-gradient(${(fill.angle || 0) + 90}deg,${fill.color0},${fill.color1})` 
            : fill;
    }

    paintChip(el, fill) {
        if (!el) return;
        el.style.background = this.paintCSS(fill);
        el.classList.toggle('no-paint', fill === 'none');
    }

    applyPaint(fill) {
        this.fill = fill;
        this.store.mutate('Definir preenchimento', () => {
            for (let n of this.store.selected) if (!this.store.isLocked(n)) n.fill = V.clone(fill);
        });
        this.refreshUI();
    }

    refreshUI() {
        if (!this.root) return;
        const nodes = this.store.selected, n = nodes[0];
        if (n) {
            this.fill = V.clone(n.fill);
            this.stroke = n.stroke;
            this.strokeWidth = n.strokeWidth;
        }

        this.paintChip(this.root.querySelector('#draw-tool-fill'), this.fill);
        this.paintChip(this.root.querySelector('#draw-tool-stroke'), this.stroke);

        const titleEl = this.root.querySelector('#draw-document-title');
        if (titleEl) titleEl.textContent = this.store.doc.name || 'Desenho Vetorial';

        if (this.currentTab === 'properties') this.renderProperties();
        else if (this.currentTab === 'layers') this.renderLayers();
        else if (this.currentTab === 'history') this.renderHistory();

        this.updateToolUI();
    }

    setTab(tab) {
        if (!['properties', 'layers', 'history'].includes(tab)) return;
        this.currentTab = tab;
        this.root.querySelector('#draw-properties-panel').hidden = tab !== 'properties';
        this.root.querySelector('#draw-layers-panel').hidden = tab !== 'layers';
        this.root.querySelector('#draw-history-panel').hidden = tab !== 'history';
        this.root.querySelectorAll('[data-draw-tab]').forEach(b => b.classList.toggle('active', b.dataset.drawTab === tab));
        this.refreshUI();
    }

    renderProperties() {
        const panel = this.root.querySelector('#draw-properties-panel');
        if (!panel) return;
        const s = this.store, n = s.selected[0], count = s.selection.size, b = s.selectionBounds(), board = s.activeBoard;
        let html = '';

        if (!n) {
            html += `
            <section class="panel-section">
                <div class="eyebrow">ESTÚDIO VETORIAL</div>
                <div class="document-heading">${V.esc(s.doc.name || 'Desenho Escolar')}</div>
                <div class="document-subtitle">${s.doc.artboards.length} prancheta(s) · ${s.doc.nodes.length} elementos vetoriais</div>
                <span class="document-tag">RGB / Alta Fidelidade</span>
            </section>
            <section class="panel-section">
                <h3 class="section-title">Prancheta Ativa</h3>
                <div class="field-grid">
                    <label><span>Largura (px)</span><input type="number" data-prop="board-width" value="${Math.round(board.w)}"></label>
                    <label><span>Altura (px)</span><input type="number" data-prop="board-height" value="${Math.round(board.h)}"></label>
                </div>
                <button class="section-action" data-draw-cmd="new-board">${V.icon('plus')} Adicionar Nova Prancheta</button>
            </section>`;
        } else {
            const angle = Math.round(Math.atan2(n.matrix[1], n.matrix[0]) * 180 / Math.PI);
            html += `
            <section class="panel-section">
                <div class="eyebrow">${count > 1 ? 'MÚLTIPLOS OBJETOS' : n.type.toUpperCase()}</div>
                <div class="document-heading" style="font-size:14px">${count > 1 ? count + ' objetos selecionados' : V.esc(n.name)}</div>
            </section>
            <section class="panel-section">
                <h3 class="section-title">Geometria e Posição</h3>
                <div class="field-grid">
                    <label><span>X</span><input type="number" data-prop="x" value="${Math.round(b.x)}"></label>
                    <label><span>Y</span><input type="number" data-prop="y" value="${Math.round(b.y)}"></label>
                    <label><span>Largura</span><input type="number" data-prop="width" value="${Math.round(b.w)}"></label>
                    <label><span>Altura</span><input type="number" data-prop="height" value="${Math.round(b.h)}"></label>
                </div>
                <div class="transform-bottom">
                    <label>${V.icon('rotate')} <input data-prop="rotation" type="number" value="${angle}" style="width:55px">°</label>
                    <span class="menu-spacer"></span>
                    <button data-draw-cmd="flip-h" title="Espelhar horizontalmente">${V.icon('flipH')}</button>
                    <button data-draw-cmd="flip-v" title="Espelhar verticalmente">${V.icon('flipV')}</button>
                </div>
                ${n.type === 'rect' ? `<div class="field-grid" style="margin-top:10px"><label><span>Raio dos cantos</span><input type="number" data-prop="radius" value="${n.radius || 0}"></label></div>` : ''}
            </section>`;
        }

        const fill = n?.fill ?? this.fill, stroke = n?.stroke ?? this.stroke, op = Math.round((n?.opacity ?? this.opacity) * 100);
        html += `
        <section class="panel-section">
            <h3 class="section-title">Cores & Traço</h3>
            <div class="appearance-row">
                <button class="paint-picker-button" data-paint="fill"><span class="paint-chip" style="background:${V.esc(this.paintCSS(fill))}"></span></button>
                <span>Preenchimento</span>
            </div>
            <div class="appearance-row">
                <button class="paint-picker-button" data-paint="stroke"><span class="paint-chip stroke-chip" style="background:${V.esc(this.paintCSS(stroke))}"></span></button>
                <span>Contorno</span>
                <span class="menu-spacer"></span>
                <input data-prop="strokeWidth" type="number" min="0" max="200" value="${n?.strokeWidth ?? this.strokeWidth}" style="width:50px"> px
            </div>
            ${n ? `<div class="opacity-row"><span>Opacidade</span><input data-live="opacity" type="range" min="0" max="100" value="${op}"><span style="width:36px;text-align:right">${op}%</span></div>` : ''}
            <div class="segmented">
                <button data-fill-mode="solid" class="${typeof fill === 'string' && fill !== 'none' ? 'active' : ''}">Sólido</button>
                <button data-fill-mode="gradient" class="${typeof fill === 'object' ? 'active' : ''}">Gradiente</button>
                <button data-fill-mode="none" class="${fill === 'none' ? 'active' : ''}">Nenhum</button>
            </div>
        </section>`;

        if (n) {
            html += `
            <section class="panel-section">
                <h3 class="section-title">Alinhamento</h3>
                <div class="align-buttons">
                    ${[['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight'], ['top', 'alignTop'], ['middle', 'alignMiddle'], ['bottom', 'alignBottom']].map(([v, ic]) => `
                        <button data-draw-cmd="align-${v}" title="Alinhar ${v}">${V.icon(ic)}</button>
                    `).join('')}
                </div>
            </section>
            <section class="panel-section">
                <h3 class="section-title">Pathfinder (Operações Booleanas)</h3>
                <div class="pathfinder-buttons">
                    ${[['union', 'Unir'], ['subtract', 'Recortar'], ['intersect', 'Interseção'], ['xor', 'Excluir']].map(([v, label]) => `
                        <button data-draw-cmd="boolean-${v}" ${count < 2 ? 'disabled' : ''} title="${label}">${V.icon(v)} <span>${label}</span></button>
                    `).join('')}
                </div>
            </section>`;
        }

        html += `
        <section class="panel-section">
            <h3 class="section-title">Paleta Escolar</h3>
            <div class="swatch-grid">
                ${SWATCHES.map(c => `
                    <button data-swatch="${c}" data-target="fill" title="${c}" style="background:${c}"></button>
                `).join('')}
            </div>
        </section>
        <section class="panel-section">
            <h3 class="section-title">Ações Rápidas</h3>
            <div class="quick-actions">
                <button data-draw-cmd="fit-all">Enquadrar pranchetas</button>
                <button data-draw-cmd="export-svg">Exportar SVG</button>
                <button data-draw-cmd="export-png">Exportar PNG</button>
                <button data-draw-cmd="grid">Grade: ${this.renderer?.grid ? 'Visível' : 'Oculta'}</button>
            </div>
        </section>`;

        const scroll = panel.scrollTop;
        panel.innerHTML = html;
        panel.scrollTop = scroll;
    }

    renderLayers() {
        const panel = this.root.querySelector('#draw-layers-tree');
        if (!panel) return;
        const s = this.store;
        let html = '';

        for (let layer of [...s.doc.layers].reverse()) {
            const ns = s.doc.nodes.filter(n => n.layerId === layer.id).reverse();
            const expanded = this.expanded.has(layer.id);
            html += `
            <div class="layer-row layer-header ${s.activeLayer === layer.id ? 'active-layer' : ''}" data-layer-id="${V.esc(layer.id)}">
                <button data-layer-eye="${V.esc(layer.id)}" class="${layer.visible === false ? 'visible-off' : ''}" title="Visibilidade">${V.icon('eye')}</button>
                <button data-layer-lock="${V.esc(layer.id)}" title="Bloquear/Desbloquear">${V.icon(layer.locked ? 'lock' : 'unlock')}</button>
                <button data-layer-collapse="${V.esc(layer.id)}">${V.icon(expanded ? 'chevronDown' : 'chevronRight')}</button>
                <span class="layer-color" style="background:${V.esc(layer.color)}"></span>
                <span class="layer-name">${V.esc(layer.name)}</span>
                <span class="layer-counter">${ns.length}</span>
            </div>`;

            if (expanded) {
                for (let n of ns) {
                    html += `
                    <div class="layer-row node-row ${s.selection.has(n.id) ? 'selected' : ''}" data-node-id="${V.esc(n.id)}">
                        <button data-node-eye="${V.esc(n.id)}" class="${n.visible === false ? 'visible-off' : ''}" title="Visibilidade">${V.icon('eye')}</button>
                        <button data-node-lock="${V.esc(n.id)}" class="${n.locked ? '' : 'visible-off'}" title="Bloquear">${V.icon(n.locked ? 'lock' : 'unlock')}</button>
                        <span class="layer-node-icon">${V.icon(n.type === 'text' ? 'type' : n.type === 'path' ? 'path' : n.type)}</span>
                        <span class="layer-name">${V.esc(n.name)}</span>
                        ${n.groupId ? '<span class="layer-counter">G</span>' : ''}
                    </div>`;
                }
            }
        }
        panel.innerHTML = html || '<div class="empty-panel">Nenhum objeto na camada.</div>';
        const count = this.root.querySelector('#draw-layer-count');
        if (count) count.textContent = `${s.doc.layers.length} camadas · ${s.doc.nodes.length} objetos`;
    }

    renderHistory() {
        const panel = this.root.querySelector('#draw-history-panel');
        if (!panel) return;
        const h = this.store.history;
        let html = `
        <div class="history-list">
            <div class="history-item ${h.index === 0 ? 'current' : ''}">Estado Inicial</div>
            ${h.entries.map((e, i) => `
                <div class="history-item ${i + 1 === h.index ? 'current' : ''}">${V.esc(e.label)}</div>
            `).join('')}
        </div>`;
        panel.innerHTML = html;
    }

    bindEvents() {
        const root = this.root;
        const sig = { signal: this.events.signal };

        root.addEventListener('click', e => {
            const toolBtn = e.target.closest('[data-tool]');
            if (toolBtn) {
                this.editor.setTool(toolBtn.dataset.tool);
                return;
            }

            const drawCmd = e.target.closest('[data-draw-cmd]');
            if (drawCmd) {
                e.preventDefault();
                this.command(drawCmd.dataset.drawCmd);
                return;
            }

            const tabBtn = e.target.closest('[data-draw-tab]');
            if (tabBtn) {
                this.setTab(tabBtn.dataset.drawTab);
                return;
            }

            const swatch = e.target.closest('[data-swatch]');
            if (swatch) {
                this.applyPaint(swatch.dataset.swatch);
                return;
            }

            const fillMode = e.target.closest('[data-fill-mode]');
            if (fillMode) {
                const mode = fillMode.dataset.fillMode;
                if (mode === 'none') this.applyPaint('none');
                else if (mode === 'solid') this.applyPaint(typeof this.fill === 'string' && this.fill !== 'none' ? this.fill : '#8c3b1d');
                else if (mode === 'gradient') this.applyPaint({ type: 'linear', color0: '#F4A27B', color1: '#8c3b1d', angle: 45 });
                return;
            }

            // Ações de camadas
            const layerCollapse = e.target.closest('[data-layer-collapse]');
            if (layerCollapse) {
                const id = layerCollapse.dataset.layerCollapse;
                if (this.expanded.has(id)) this.expanded.delete(id);
                else this.expanded.add(id);
                this.renderLayers();
                return;
            }

            const nodeRow = e.target.closest('[data-node-id]');
            if (nodeRow) {
                const id = nodeRow.dataset.nodeId;
                if (e.shiftKey) {
                    const sel = new Set(this.store.selection);
                    sel.has(id) ? sel.delete(id) : sel.add(id);
                    this.store.select([...sel]);
                } else {
                    this.store.select([id]);
                }
                return;
            }
        }, sig);

        // Entrada de propriedades numéricas
        root.addEventListener('change', e => {
            const prop = e.target.dataset.prop;
            if (!prop) return;
            const val = Number(e.target.value);
            const n = this.store.selected[0];

            if (prop === 'board-width' || prop === 'board-height') {
                const board = this.store.activeBoard;
                if (board) {
                    this.store.mutate('Redimensionar prancheta', () => {
                        if (prop === 'board-width') board.w = Math.max(50, val);
                        if (prop === 'board-height') board.h = Math.max(50, val);
                    });
                }
            } else if (n) {
                if (prop === 'strokeWidth') {
                    this.strokeWidth = Math.max(0, val);
                    this.store.mutate('Alterar espessura do contorno', () => {
                        for (let item of this.store.selected) item.strokeWidth = this.strokeWidth;
                    });
                } else if (prop === 'radius' && n.type === 'rect') {
                    this.store.mutate('Alterar raio dos cantos', () => {
                        n.radius = Math.max(0, val);
                    });
                }
            }
        }, sig);

        // Teclado
        window.addEventListener('keydown', e => {
            if (this.app.active !== 'draw') return;
            if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;

            const mod = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            if (mod) {
                if (key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) this.store.history.redo();
                    else this.store.history.undo();
                } else if (key === 'd') {
                    e.preventDefault();
                    this.store.duplicate();
                } else if (key === 'a') {
                    e.preventDefault();
                    this.store.select(this.store.visibleNodes.filter(n => !this.store.isLocked(n)).map(n => n.id));
                } else if (key === 'g') {
                    e.preventDefault();
                    if (e.shiftKey) this.store.ungroup();
                    else this.store.group();
                } else if (key === '0' && e.altKey) {
                    e.preventDefault();
                    this.editor.fitAll();
                }
                return;
            }

            if (e.code === 'Space') {
                this.editor.space = true;
                this.editor.updateCursor();
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.editor.deleteSelection();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.editor.pen) this.editor.finishPen();
                else this.store.select([]);
                return;
            }

            // Atalhos diretos de ferramentas (V, A, P, M, L, T, etc.)
            const toolMap = {
                v: 'select', a: 'direct', p: 'pen', n: 'pencil',
                m: 'rect', l: 'ellipse', t: 'text', s: 'star',
                b: 'brush', e: 'erase', g: 'gradient', i: 'eyedropper',
                h: 'hand', z: 'zoom'
            };
            if (toolMap[key]) {
                this.editor.setTool(toolMap[key]);
            }
        }, sig);

        window.addEventListener('keyup', e => {
            if (e.code === 'Space') {
                this.editor.space = false;
                this.editor.updateCursor();
            }
        }, sig);
    }

    addBoard() {
        const last = this.store.doc.artboards.at(-1) || { x: 0, y: 0, w: 1200, h: 800 };
        const newBoard = {
            id: 'board_' + (this.store.doc.artboards.length + 1),
            name: 'Prancheta ' + (this.store.doc.artboards.length + 1),
            x: last.x + last.w + 80,
            y: last.y,
            w: 840,
            h: 594,
            background: '#FFFFFF'
        };
        this.store.doc.artboards.push(newBoard);
        this.store.activeArtboard = newBoard.id;
        this.store.emit();
        this.editor.fitAll();
        this.app.notify?.('Nova prancheta adicionada.');
    }

    addLayer() {
        const count = this.store.doc.layers.length + 1;
        const newLayer = {
            id: 'layer_' + count,
            name: 'Camada ' + count,
            color: '#8c3b1d',
            visible: true,
            locked: false
        };
        this.store.doc.layers.push(newLayer);
        this.store.activeLayer = newLayer.id;
        this.store.emit();
        this.setTab('layers');
        this.app.notify?.('Nova camada criada.');
    }

    copy() {
        if (!this.store.selection.size) return;
        this.clipboard = this.store.selected.map(n => V.clone(n));
        this.app.notify?.('Objetos vetoriais copiados.');
    }

    paste() {
        if (!this.clipboard || !this.clipboard.length) return;
        this.store.mutate('Colar objetos', () => {
            const ids = [];
            for (let item of this.clipboard) {
                const c = V.clone(item);
                c.id = V.uid();
                c.matrix = V.matrix(V.translate(25, 25), c.matrix);
                this.store.add(c);
                ids.push(c.id);
            }
            this.store.select(ids);
        });
        this.app.notify?.('Objetos colados na prancheta.');
    }

    flip(axis) {
        const b = this.store.selectionBounds();
        if (!b) return;
        const cx = (b.x + b.x2) / 2, cy = (b.y + b.y2) / 2;
        const m = axis === 'x' ? V.around(V.scale(-1, 1), V.pt(cx, cy)) : V.around(V.scale(1, -1), V.pt(cx, cy));
        this.store.mutate('Espelhar seleção', () => {
            this.store.transformSelected(m);
        });
    }

    exportSVG() {
        const svgString = V.svgExport(this.store.doc, this.store.activeBoard);
        V.download(svgString, (this.store.doc.name || 'desenho-escolar') + '.svg', 'image/svg+xml');
        this.app.notify?.('Arquivo SVG exportado com sucesso.');
    }

    async exportPNG() {
        const board = this.store.activeBoard;
        const canvas = document.createElement('canvas');
        const scale = 2; // 2x para resolução nítida
        canvas.width = Math.round(board.w * scale);
        canvas.height = Math.round(board.h * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.translate(-board.x, -board.y);

        // Fundo da prancheta
        ctx.fillStyle = board.background || '#ffffff';
        ctx.fillRect(board.x, board.y, board.w, board.h);

        // Renderizar nós da prancheta via SVG temporário ou Canvas 2D
        const svgString = V.svgExport(this.store.doc, board);
        const img = new Image();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            ctx.drawImage(img, board.x, board.y, board.w, board.h);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => {
                V.download(b, (this.store.doc.name || 'desenho-escolar') + '.png', 'image/png');
                this.app.notify?.('Imagem PNG de alta resolução exportada.');
            });
        };
        img.src = url;
    }

    command(name, value) {
        if (this.commands.has(name)) {
            this.run(name);
            return;
        }

        switch (name) {
            case 'tool':
                this.editor.setTool(value);
                break;
            case 'toolSelect': this.editor.setTool('select'); break;
            case 'toolDirect': this.editor.setTool('direct'); break;
            case 'toolPen': this.editor.setTool('pen'); break;
            case 'toolBrush': this.editor.setTool('brush'); break;
            case 'toolRectangle': this.editor.setTool('rectangle'); break;
            case 'toolEllipse': this.editor.setTool('ellipse'); break;
            case 'toolStar': this.editor.setTool('star'); break;
            case 'toolPolygon': this.editor.setTool('polygon'); break;
            case 'toolLine': this.editor.setTool('line'); break;
            case 'toolSpiral': this.editor.setTool('spiral'); break;
            case 'toolText': this.editor.setTool('text'); break;
            case 'toolEraser': this.editor.setTool('eraser'); break;
            case 'fit':
            case 'fitAll':
                this.editor.fitAll();
                break;
            case 'color':
                if (value) {
                    this.stroke = value;
                    this.store.mutate('Alterar cor de contorno', () => {
                        for (let n of this.store.selected) n.stroke = value;
                    });
                    this.refreshUI();
                }
                break;
            case 'fill':
                if (value) {
                    this.applyPaint(value);
                }
                break;
            case 'alignLeft': this.store.align('left'); break;
            case 'alignCenter': this.store.align('center'); break;
            case 'alignRight': this.store.align('right'); break;
            case 'alignTop': this.store.align('top'); break;
            case 'alignBottom': this.store.align('bottom'); break;
            case 'selectAll': this.run('select-all'); break;
            case 'duplicate': this.store.duplicate(); break;
            case 'delete': this.editor.deleteSelection(); break;
            case 'group': this.store.group(); break;
            case 'ungroup': this.store.ungroup(); break;
            case 'front': this.store.arrange('front'); break;
            case 'back': this.store.arrange('back'); break;
            case 'exportSVG': this.exportSVG(); break;
            case 'exportPNG': this.exportPNG(); break;
            default:
                console.warn('Comando vetorial não mapeado:', name, value);
        }
    }

    setZoom(zoom) {
        const factor = (zoom || 100) / 100;
        this.camera.zoom = factor;
        this.invalidate();
    }

    commitEdit() {
        if (this.editor.textNode) this.editor.finishText();
        if (this.editor.pen) this.editor.finishPen();
    }

    dispose() {
        this.commitEdit();
        this.events.abort();
        this.resizeObserver?.disconnect();
        cancelAnimationFrame(this.raf);
        this.renderer?.dispose?.();
    }
}

return {Draw};
})();
const __meridian_26 = (() => {
'use strict';
/* Ícones vetoriais específicos do módulo Escola Forms */
(() => {
    const icons = {
        forms: '<path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2h-4M9 3a2 2 0 012-2h2a2 2 0 012 2M9 3v2h6V3M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        choice: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
        checkbox: '<rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        text: '<path d="M4 7V4h16v3M12 4v16M9 20h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        essay: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        scale: '<path d="M3 18h18M6 18v-4M10 18v-8M14 18v-12M18 18v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        grid: '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" fill="none" stroke="currentColor" stroke-width="2"/>',
        star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="currentColor" stroke-width="2"/>',
        check: '<path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        close: '<path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        trash: '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" fill="none" stroke="currentColor" stroke-width="2"/>',
        plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        up: '<path d="M18 15l-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        down: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
        chart: '<path d="M18 20V10M12 20V4M6 20v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        share: '<circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" fill="none" stroke="currentColor" stroke-width="2"/>',
        export: '<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        import: '<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        qr: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 12h3v-3h-3zm0-6h6v3h-6zm3 3h3v3h-3z" fill="currentColor"/>'
    };

    globalThis.FormsIcons = {
        getIcon: (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" style="width:1.2em;height:1.2em;vertical-align:middle;display:inline-block">${icons[name] || icons.forms}</svg>`
    };
})();
const FormsIcons = globalThis.FormsIcons;

return {FormsIcons};
})();
const __meridian_27 = (() => {
'use strict';
/* Motor Analítico do Escola Forms: Estatísticas, Gráficos e Exportação de Notas */

globalThis.FormsAnalytics = globalThis.FormsAnalytics || {};

(() => {
    function computeFormStats(form) {
        const responses = form.responses || [];
        const totalResponses = responses.length;

        if (!totalResponses) {
            return {
                totalResponses: 0,
                averageScore: 0,
                maxScore: form.questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0),
                passRate: 0,
                questionsStats: []
            };
        }

        const scores = responses.map(r => r.score || 0);
        const totalScoreSum = scores.reduce((a, b) => a + b, 0);
        const maxScorePossible = form.questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0) || 10;
        const averageScore = Math.round((totalScoreSum / totalResponses) * 10) / 10;
        const passingCount = scores.filter(s => (s / maxScorePossible) >= 0.6).length;
        const passRate = Math.round((passingCount / totalResponses) * 100);

        const questionsStats = form.questions.map(q => {
            let correctCount = 0;
            const optionCounts = {};

            if (q.options) {
                q.options.forEach(o => optionCounts[o.id] = 0);
            }

            responses.forEach(r => {
                const userAns = r.answers?.[q.id];
                if (q.type === 'choice') {
                    if (userAns && optionCounts[userAns] !== undefined) optionCounts[userAns]++;
                    if (userAns === q.correctAnswer) correctCount++;
                } else if (q.type === 'checkbox') {
                    if (Array.isArray(userAns)) {
                        userAns.forEach(optId => {
                            if (optionCounts[optId] !== undefined) optionCounts[optId]++;
                        });
                        const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
                        if (JSON.stringify([...userAns].sort()) === JSON.stringify([...correctArr].sort())) {
                            correctCount++;
                        }
                    }
                } else if (userAns) {
                    correctCount++;
                }
            });

            return {
                id: q.id,
                title: q.title,
                type: q.type,
                correctCount,
                accuracyRate: Math.round((correctCount / totalResponses) * 100),
                optionCounts
            };
        });

        return {
            totalResponses,
            averageScore,
            maxScore: maxScorePossible,
            passRate,
            questionsStats
        };
    }

    function renderAnalyticsHTML(form) {
        const stats = computeFormStats(form);
        const getIcon = globalThis.FormsIcons?.getIcon || (() => '');

        if (!stats.totalResponses) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">${getIcon('chart')}</div>
                    <h3>Nenhuma resposta registrada ainda</h3>
                    <p>Compartilhe o formulário ou exporte o arquivo offline para receber as avaliações dos estudantes.</p>
                </div>`;
        }

        return `
            <div class="analytics-dashboard">
                <div class="metrics-grid">
                    <div class="metric-card">
                        <span class="metric-number">${stats.totalResponses}</span>
                        <span class="metric-label">Respostas Recebidas</span>
                    </div>
                    <div class="metric-card highlight">
                        <span class="metric-number">${stats.averageScore.toFixed(1)} / ${stats.maxScore}</span>
                        <span class="metric-label">Média da Turma</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-number">${stats.passRate}%</span>
                        <span class="metric-label">Aproveitamento (≥ 60%)</span>
                    </div>
                </div>

                <div class="analytics-section">
                    <h4>Relação de Alunos e Notas</h4>
                    <table class="analytics-table">
                        <thead>
                            <tr>
                                <th>Estudante</th>
                                <th>Turma</th>
                                <th>Data/Hora</th>
                                <th>Nota Alcançada</th>
                                <th>Desempenho</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${form.responses.map(r => {
                                const pct = stats.maxScore ? Math.round((r.score / stats.maxScore) * 100) : 0;
                                const isPassed = pct >= 60;
                                return `
                                    <tr>
                                        <td><strong>${r.studentName || 'Estudante Anônimo'}</strong></td>
                                        <td>${r.studentClass || form.grade || '—'}</td>
                                        <td>${new Date(r.timestamp || Date.now()).toLocaleDateString('pt-BR')} ${new Date(r.timestamp || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                                        <td><strong style="color:${isPassed ? 'var(--brand)' : '#c53030'}">${r.score.toFixed(1)}</strong> / ${stats.maxScore}</td>
                                        <td><span class="badge ${isPassed ? 'success' : 'warning'}">${pct}% ${isPassed ? '✓ Aprovado' : '⚡ Recuperação'}</span></td>
                                    </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="analytics-section">
                    <h4>Análise por Questão</h4>
                    <div class="questions-analysis-list">
                        ${stats.questionsStats.map((qStat, idx) => `
                            <div class="question-stat-card">
                                <div class="stat-card-header">
                                    <span>Questão ${idx + 1}</span>
                                    <span class="badge ${qStat.accuracyRate >= 60 ? 'success' : 'warning'}">${qStat.accuracyRate}% de acerto</span>
                                </div>
                                <h5>${qStat.title}</h5>
                                <div class="progress-bar-bg">
                                    <div class="progress-bar-fill" style="width:${qStat.accuracyRate}%;background:${qStat.accuracyRate >= 60 ? '#2d6a4f' : '#b85d19'}"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
    }

    Object.assign(globalThis.FormsAnalytics, {
        computeFormStats,
        renderAnalyticsHTML
    });
})();

const FormsAnalytics = globalThis.FormsAnalytics;

return {FormsAnalytics};
})();
const __meridian_28 = (() => {
'use strict';
/* Editor Interativo do Construtor de Formulários e Gerador de Arquivo Autônomo Offline */

globalThis.FormsEditor = globalThis.FormsEditor || {};

(() => {
    const getIcon = name => globalThis.FormsIcons?.getIcon(name) || '';

    function generateStandaloneFormHTML(form) {
        const formJSON = JSON.stringify(form).replace(/</g, '\\u003c');

        return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${form.title} — Escola Forms</title>
<style>
:root{--brand:#8c3b1d;--bg:#f7f3eb;--card:#ffffff;--text:#2e241c;--muted:#7a6e60;--border:#e2d8c7;--success:#2d6a4f;}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:20px;line-height:1.5;}
.container{max-width:760px;margin:0 auto;}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.04);}
.header-card{border-top:6px solid var(--brand);}
h1{font-family:'Cinzel',serif;color:var(--brand);margin:0 0 8px 0;font-size:24px;}
.subtitle{color:var(--muted);font-size:14px;margin-bottom:16px;}
.field{margin-bottom:16px;}
label{display:block;font-weight:600;margin-bottom:6px;font-size:14px;}
input[type="text"],textarea{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:6px;font-size:15px;box-sizing:border-box;}
.q-card{position:relative;}
.q-title{font-weight:600;font-size:16px;margin-bottom:12px;color:var(--text);}
.option{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;cursor:pointer;transition:background 0.15s;}
.option:hover{background:#f5ebe1;}
.option input{margin:0;}
.btn{background:var(--brand);color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:16px;cursor:pointer;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;}
.btn:hover{opacity:0.9;}
.score-banner{background:#e8f5e9;border:1px solid #c8e6c9;color:#2e7d32;padding:16px;border-radius:8px;text-align:center;font-size:18px;font-weight:700;margin-bottom:16px;}
.feedback{background:#fff8e1;border-left:4px solid #ffb300;padding:10px 14px;margin-top:8px;font-size:14px;border-radius:4px;}
</style>
</head>
<body>
<div class="container">
    <div class="card header-card">
        <h1>${form.title}</h1>
        <div class="subtitle">
            <strong>${form.school}</strong> · ${form.teacher} (${form.subject})<br>
            Turma: ${form.grade}
        </div>
        <p>${form.description}</p>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">
        <div class="field">
            <label>Seu Nome Completo *</label>
            <input type="text" id="student-name" placeholder="Digite seu nome para identificação" required>
        </div>
    </div>

    <form id="quiz-form">
        ${form.questions.map((q, idx) => `
            <div class="card q-card">
                <div class="q-title">${idx + 1}. ${q.title} <span style="font-size:12px;color:var(--muted)">(${q.points} pt)</span></div>
                ${q.type === 'choice' ? q.options.map(o => `
                    <label class="option">
                        <input type="radio" name="${q.id}" value="${o.id}" ${q.required ? 'required' : ''}>
                        <span>${o.text}</span>
                    </label>
                `).join('') : ''}
                ${q.type === 'checkbox' ? q.options.map(o => `
                    <label class="option">
                        <input type="checkbox" name="${q.id}" value="${o.id}">
                        <span>${o.text}</span>
                    </label>
                `).join('') : ''}
                ${q.type === 'scale' ? `
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
                        <small>${q.minLabel || '1'}</small>
                        <div style="display:flex;gap:12px">
                            ${[1,2,3,4,5].map(v => `<label style="display:flex;flex-direction:column;align-items:center;gap:4px"><input type="radio" name="${q.id}" value="${v}"><span>${v}</span></label>`).join('')}
                        </div>
                        <small>${q.maxLabel || '5'}</small>
                    </div>
                ` : ''}
                ${q.type === 'essay' || q.type === 'text' ? `
                    <textarea name="${q.id}" rows="3" placeholder="${q.placeholder || 'Digite sua resposta...'}" ${q.required ? 'required' : ''}></textarea>
                ` : ''}
                <div id="feedback-${q.id}" class="feedback" style="display:none"></div>
            </div>
        `).join('')}

        <button type="submit" class="btn">Concluir e Enviar Resposta</button>
    </form>

    <div id="result-box" style="display:none" class="card">
        <div class="score-banner" id="score-banner"></div>
        <p>Sua resposta foi registrada com sucesso! Mostre esta tela ao professor ou envie pelo WhatsApp.</p>
        <button class="btn" style="background:#25D366" id="whatsapp-btn">Enviar Nota pelo WhatsApp do Professor</button>
    </div>
</div>

<script>
const formData = ${formJSON};
document.getElementById('quiz-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('student-name').value.trim();
    if (!name) return alert('Por favor, informe seu nome antes de enviar.');

    const answers = {};
    formData.questions.forEach(q => {
        if (q.type === 'choice' || q.type === 'scale') {
            const sel = document.querySelector('input[name="' + q.id + '"]:checked');
            if (sel) answers[q.id] = sel.value;
        } else if (q.type === 'checkbox') {
            answers[q.id] = Array.from(document.querySelectorAll('input[name="' + q.id + '"]:checked')).map(cb => cb.value);
        } else if (q.type === 'text' || q.type === 'essay') {
            const txt = document.querySelector('textarea[name="' + q.id + '"],input[name="' + q.id + '"]');
            if (txt) answers[q.id] = txt.value;
        }
    });

    let score = 0, maxScore = 0;
    formData.questions.forEach(q => {
        const pts = Number(q.points) || 0;
        maxScore += pts;
        const ans = answers[q.id];
        const fbNode = document.getElementById('feedback-' + q.id);
        if (q.type === 'choice' && ans === q.correctAnswer) score += pts;
        if (q.type === 'checkbox') {
            const userArr = (ans || []).sort();
            const correctArr = (q.correctAnswer || []).sort();
            if (JSON.stringify(userArr) === JSON.stringify(correctArr)) score += pts;
        }
        if (q.type === 'scale' || q.type === 'essay' || q.type === 'text') {
            if (ans) score += pts;
        }
        if (fbNode && q.feedback) {
            fbNode.style.display = 'block';
            fbNode.innerHTML = '<strong>Feedback:</strong> ' + q.feedback;
        }
    });

    document.getElementById('quiz-form').style.display = 'none';
    const resultBox = document.getElementById('result-box');
    resultBox.style.display = 'block';
    document.getElementById('score-banner').innerText = 'Parabéns, ' + name + '! Sua Nota: ' + score.toFixed(1) + ' / ' + maxScore.toFixed(1);

    document.getElementById('whatsapp-btn').onclick = function() {
        const text = encodeURIComponent('Olá Prof. ' + formData.teacher + '! Concluí a atividade "' + formData.title + '".\\nNome: ' + name + '\\nNota: ' + score.toFixed(1) + ' / ' + maxScore.toFixed(1));
        window.open('https://api.whatsapp.com/send?text=' + text, '_blank');
    };
});
<\/script>
</body>
</html>`;
    }

    Object.assign(globalThis.FormsEditor, {
        generateStandaloneFormHTML
    });
})();

const FormsEditor = globalThis.FormsEditor;

return {FormsEditor};
})();
const __meridian_25 = (() => {
'use strict';
/* Módulo Oficial de Formulários & Avaliações (Escola Forms) — 5º Aplicativo da Suíte */

const { FormsIcons } = __meridian_26;
const { FormsDoc } = __meridian_6;
const { FormsAnalytics } = __meridian_27;
const { FormsEditor } = __meridian_28;
class FormsApp {
    constructor(app) {
        this.app = app;
        this.store = app.store;
        this.activeTab = 'editor'; // 'editor' | 'preview' | 'analytics'
    }

    get model() {
        if (!this.store.state.forms) {
            this.store.state.forms = FormsDoc.demoForm();
        }
        return this.store.state.forms;
    }

    mount(root) {
        this.root = root;
        this.render();
        this.status();
    }

    render() {
        if (!this.root) return;
        const form = this.model;
        const getIcon = name => FormsIcons.getIcon(name);

        this.root.innerHTML = `
            <div class="forms-studio">
                <div class="forms-container">
                    <div class="forms-card forms-header-card">
                        <div class="form-header-meta">
                            <span class="badge brand-badge">Escola Forms</span>
                            <span class="badge info-badge">${form.subject || 'Geral'}</span>
                        </div>
                        <input class="forms-title-input" value="${form.title}" placeholder="Título da Avaliação..." data-field="title">
                        <div class="forms-row">
                            <input class="forms-meta-input" value="${form.school}" placeholder="Nome da Escola..." data-field="school">
                            <input class="forms-meta-input" value="${form.teacher}" placeholder="Professor(a)..." data-field="teacher">
                            <input class="forms-meta-input" value="${form.grade}" placeholder="Turma..." data-field="grade">
                        </div>
                        <textarea class="forms-desc-input" placeholder="Orientações e instruções didáticas da avaliação..." data-field="description">${form.description || ''}</textarea>
                    </div>

                    ${this.activeTab === 'analytics' ? FormsAnalytics.renderAnalyticsHTML(form) : `
                        <div class="questions-list">
                            ${form.questions.map((q, idx) => `
                                <div class="forms-card question-card" data-qid="${q.id}">
                                    <div class="q-header">
                                        <span class="q-number">Questão ${idx + 1}</span>
                                        <select class="forms-select q-type-select" data-qid="${q.id}">
                                            <option value="choice" ${q.type === 'choice' ? 'selected' : ''}>🔘 Múltipla Escolha</option>
                                            <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>☑️ Caixas de Seleção</option>
                                            <option value="scale" ${q.type === 'scale' ? 'selected' : ''}>📏 Escala Linear (1 a 5)</option>
                                            <option value="essay" ${q.type === 'essay' ? 'selected' : ''}>✍️ Resposta Dissertativa</option>
                                        </select>
                                        <div class="q-points-box">
                                            <input type="number" class="forms-number-input q-points" value="${q.points || 1}" step="0.5" min="0" data-qid="${q.id}">
                                            <small>pontos</small>
                                        </div>
                                        <button class="icon-btn danger delete-q-btn" data-qid="${q.id}" title="Excluir questão">${getIcon('trash')}</button>
                                    </div>

                                    <input class="forms-question-title" value="${q.title}" placeholder="Digite o enunciado da questão..." data-qid="${q.id}">

                                    ${(q.type === 'choice' || q.type === 'checkbox') ? `
                                        <div class="options-builder">
                                            ${(q.options || []).map(opt => `
                                                <div class="option-row">
                                                    <input type="${q.type === 'choice' ? 'radio' : 'checkbox'}" ${q.type === 'choice' ? (q.correctAnswer === opt.id ? 'checked' : '') : (Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt.id) ? 'checked' : '')} name="correct_${q.id}" data-qid="${q.id}" data-optid="${opt.id}" class="set-correct-radio" title="Marcar como alternativa correta (Gabarito)">
                                                    <input class="forms-option-input" value="${opt.text}" placeholder="Alternativa..." data-qid="${q.id}" data-optid="${opt.id}">
                                                    <button class="icon-btn delete-opt-btn" data-qid="${q.id}" data-optid="${opt.id}" title="Excluir alternativa">${getIcon('close')}</button>
                                                </div>
                                            `).join('')}
                                            <button class="btn secondary add-opt-btn" data-qid="${q.id}">${getIcon('plus')} Adicionar Alternativa</button>
                                        </div>
                                    ` : ''}

                                    <div class="feedback-builder">
                                        <label class="forms-label">${getIcon('star')} Gabarito & Feedback Pedagógico (Orientação ao Aluno):</label>
                                        <input class="forms-feedback-input" value="${q.feedback || ''}" placeholder="Explique o motivo do acerto ou orientação para estudo..." data-qid="${q.id}">
                                    </div>
                                </div>
                            `).join('')}

                            <div class="add-question-bar">
                                <button class="btn primary add-q-btn">${getIcon('plus')} Adicionar Nova Questão</button>
                            </div>
                        </div>
                    `}
                </div>
            </div>`;

        this.bindEvents();
    }

    bindEvents() {
        if (!this.root) return;

        // Atualizar campos do cabeçalho
        this.root.querySelectorAll('[data-field]').forEach(input => {
            input.onchange = e => {
                const field = e.target.dataset.field;
                const val = e.target.value;
                this.app.store.transact('Atualizar cabeçalho do formulário', s => {
                    if (!s.forms) s.forms = FormsDoc.demoForm();
                    s.forms[field] = val;
                });
            };
        });

        // Título da questão
        this.root.querySelectorAll('.forms-question-title').forEach(input => {
            input.onchange = e => {
                const qid = e.target.dataset.qid;
                const val = e.target.value;
                this.app.store.transact('Editar enunciado da questão', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    if (q) q.title = val;
                });
            };
        });

        // Tipo da questão
        this.root.querySelectorAll('.q-type-select').forEach(select => {
            select.onchange = e => {
                const qid = e.target.dataset.qid;
                const type = e.target.value;
                this.app.store.transact('Alterar tipo de questão', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    if (q) {
                        q.type = type;
                        if ((type === 'choice' || type === 'checkbox') && (!q.options || !q.options.length)) {
                            q.options = [
                                { id: 'opt_1', text: 'Opção 1' },
                                { id: 'opt_2', text: 'Opção 2' }
                            ];
                            q.correctAnswer = 'opt_1';
                        }
                    }
                });
                this.render();
            };
        });

        // Pontos
        this.root.querySelectorAll('.q-points').forEach(input => {
            input.onchange = e => {
                const qid = e.target.dataset.qid;
                const val = Number(e.target.value) || 0;
                this.app.store.transact('Alterar pontuação da questão', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    if (q) q.points = val;
                });
                this.status();
            };
        });

        // Excluir questão
        this.root.querySelectorAll('.delete-q-btn').forEach(btn => {
            btn.onclick = e => {
                const qid = e.target.closest('.delete-q-btn').dataset.qid;
                this.app.store.transact('Excluir questão', s => {
                    s.forms.questions = s.forms.questions.filter(x => x.id !== qid);
                });
                this.render();
                this.status();
            };
        });

        // Adicionar questão
        const addQBtn = this.root.querySelector('.add-q-btn');
        if (addQBtn) {
            addQBtn.onclick = () => {
                this.app.store.transact('Adicionar questão', s => {
                    if (!s.forms) s.forms = FormsDoc.demoForm();
                    s.forms.questions.push({
                        id: 'q_' + FormsDoc.uid(),
                        type: 'choice',
                        title: 'Nova Questão Sem Título',
                        points: 1.0,
                        required: true,
                        options: [
                            { id: 'opt_1', text: 'Alternativa A' },
                            { id: 'opt_2', text: 'Alternativa B' }
                        ],
                        correctAnswer: 'opt_1',
                        feedback: ''
                    });
                });
                this.render();
                this.status();
            };
        }

        // Alternativas e Gabarito
        this.root.querySelectorAll('.forms-option-input').forEach(input => {
            input.onchange = e => {
                const qid = e.target.dataset.qid;
                const optid = e.target.dataset.optid;
                const val = e.target.value;
                this.app.store.transact('Editar alternativa', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    const opt = q?.options?.find(o => o.id === optid);
                    if (opt) opt.text = val;
                });
            };
        });

        this.root.querySelectorAll('.set-correct-radio').forEach(radio => {
            radio.onchange = e => {
                const qid = e.target.dataset.qid;
                const optid = e.target.dataset.optid;
                this.app.store.transact('Definir gabarito da questão', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    if (q) {
                        if (q.type === 'choice') {
                            q.correctAnswer = optid;
                        } else if (q.type === 'checkbox') {
                            if (!Array.isArray(q.correctAnswer)) q.correctAnswer = [];
                            if (e.target.checked) {
                                if (!q.correctAnswer.includes(optid)) q.correctAnswer.push(optid);
                            } else {
                                q.correctAnswer = q.correctAnswer.filter(x => x !== optid);
                            }
                        }
                    }
                });
            };
        });

        this.root.querySelectorAll('.add-opt-btn').forEach(btn => {
            btn.onclick = e => {
                const qid = e.target.closest('.add-opt-btn').dataset.qid;
                this.app.store.transact('Adicionar alternativa', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    if (q && q.options) {
                        q.options.push({
                            id: 'opt_' + FormsDoc.uid(),
                            text: 'Nova Alternativa ' + (q.options.length + 1)
                        });
                    }
                });
                this.render();
            };
        });

        this.root.querySelectorAll('.delete-opt-btn').forEach(btn => {
            btn.onclick = e => {
                const qid = e.target.closest('.delete-opt-btn').dataset.qid;
                const optid = e.target.closest('.delete-opt-btn').dataset.optid;
                this.app.store.transact('Excluir alternativa', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    if (q && q.options) {
                        q.options = q.options.filter(o => o.id !== optid);
                    }
                });
                this.render();
            };
        });

        // Feedback pedagógico
        this.root.querySelectorAll('.forms-feedback-input').forEach(input => {
            input.onchange = e => {
                const qid = e.target.dataset.qid;
                const val = e.target.value;
                this.app.store.transact('Editar feedback pedagógico', s => {
                    const q = s.forms.questions.find(x => x.id === qid);
                    if (q) q.feedback = val;
                });
            };
        });
    }

    command(name, value) {
        switch (name) {
            case 'addQuestion':
                this.app.store.transact('Adicionar questão', s => {
                    if (!s.forms) s.forms = FormsDoc.demoForm();
                    s.forms.questions.push({
                        id: 'q_' + FormsDoc.uid(),
                        type: 'choice',
                        title: 'Nova Questão Sem Título',
                        points: 1.0,
                        required: true,
                        options: [
                            { id: 'opt_1', text: 'Opção 1' },
                            { id: 'opt_2', text: 'Opção 2' }
                        ],
                        correctAnswer: 'opt_1',
                        feedback: ''
                    });
                });
                this.render();
                this.status();
                break;
            case 'exportFormsHTML':
                this.exportStandaloneHTML();
                break;
            case 'showAnalytics':
                this.activeTab = 'analytics';
                this.render();
                break;
            case 'showEditor':
                this.activeTab = 'editor';
                this.render();
                break;
        }
    }

    exportStandaloneHTML() {
        const htmlContent = FormsEditor.generateStandaloneFormHTML(this.model);
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (this.model.title || 'formulario').replace(/\s+/g, '_') + '_Offline.html';
        a.click();
        URL.revokeObjectURL(url);
        this.app.notify('Formulário offline gerado e baixado com sucesso!');
    }

    status() {
        const qCount = this.model.questions.length;
        const totalPts = this.model.questions.reduce((acc, q) => acc + (Number(q.points) || 0), 0);
        const rCount = this.model.responses.length;
        this.app.setStatus(`
            <span>${qCount} questão(ões)</span>
            <span>Total: <strong>${totalPts.toFixed(1)} pontos</strong></span>
            <span>${rCount} resposta(s) recebida(s)</span>
        `);
    }

    setZoom(z) {}
    dispose() {}
}

return {FormsApp};
})();
const __meridian_0 = (() => {
const { Store, Persistence, uid, clone, escapeHTML, debounce, download, validateProject, sanitizeHTML } = __meridian_1;
const { icon } = __meridian_2;
const { makeSample } = __meridian_3;
const { Writer } = __meridian_7;
const { Grid } = __meridian_8;
const { Deck } = __meridian_11;
const { exportDOCX, exportXLSX, exportPPTX, writerHTML, workbookCSV, slideSVG, presentationHTML, exportTVPackage, importDOCX, importXLSX, importPPTX, importCSV } = __meridian_12;
const { generateExamHTML, EXAM_TYPES } = __meridian_14;
const { generateRubricHTML, RUBRIC_TEMPLATES } = __meridian_15;
const { analyzeRecovery, applyRecoveryToSheet, formatRecoveryReport } = __meridian_16;
const { openWhatsAppDialog } = __meridian_17;
const { openGoogleDriveDialog } = __meridian_18;
const { BasketManager, openBasketDialog, putCurrentProjectInBasket, putSnippetInBasket } = __meridian_19;
const { Draw } = __meridian_20;
const { FormsApp } = __meridian_25;
const APPS = {
    writer: { label: 'Escrita', icon: 'write', letter: 'E', ctor: Writer },
    grid: { label: 'Planilha', icon: 'grid', letter: 'P', ctor: Grid },
    deck: { label: 'Apresentação', icon: 'present', letter: 'A', ctor: Deck },
    draw: { label: 'Desenho', icon: 'draw', letter: 'D', ctor: Draw },
    forms: { label: 'Formulário', icon: 'forms', letter: 'F', ctor: FormsApp }
};

const commandNames = {
    'switch-forms': 'Mudar para Formulários & Avaliações (Escola Forms)',
    new: 'Novo projeto escolar',
    open: 'Abrir arquivo existente',
    save: 'Salvar no navegador',
    selectAll: 'Selecionar tudo (Ctrl+A)',
    tvExport: 'Exportar para TV (Pen Drive com imagens numeradas)',
    deletePage: 'Excluir página atual do documento',
    clearAllWriter: 'Limpar todo o texto (página em branco)',
    clearSelection: 'Limpar células selecionadas',
    clearSheet: 'Limpar toda a planilha',
    clearSlide: 'Limpar slide atual',
    clearAllDeck: 'Limpar toda a apresentação',
    deleteElement: 'Excluir elementos selecionados',
    basket: 'Cestinha Pedagógica (Arquivos e Peças)',
    basketAdd: 'Colocar trabalho atual na Cestinha',
    paperSaver: 'Modo Economia de Papel (provas e folhas)',
    orientation: 'Orientação da página (Retrato ou Paisagem)',
    margins: 'Margens da página (Estreita, Moderada, Normal)',
    pageWidth: 'Largura da folha (Compacta, Normal, Ampla)',
    columns: 'Colunas de texto (1 ou 2 colunas)',
    export: 'Exportar arquivos (Word, Excel, PPT)',
    googleDrive: 'Exportar para o Google Drive (Docs, Sheets, Slides)',
    profile: 'Perfil do Educador (Identificação e Foto)',
    whatsapp: 'Enviar para WhatsApp (Coordenador)',
    exam: 'Gerar Folha de Prova / Atividades',
    rubric: 'Gerar Rubrica de Avaliação',
    insertHeader: 'Inserir ou editar cabeçalho da página',
    insertFooter: 'Inserir ou editar rodapé da página',
    insertPageNumber: 'Inserir ou configurar numeração de páginas',
    recovery: 'Calculadora de Recuperação da Turma',
    undo: 'Desfazer ação',
    redo: 'Refazer ação',
    print: 'Imprimir documento',
    theme: 'Alternar tema claro/escuro',
    help: 'Atalhos de teclado',
    find: 'Localizar no documento',
    replace: 'Localizar e substituir',
    comment: 'Adicionar comentário pedagógico',
    table: 'Inserir tabela',
    image: 'Inserir imagem',
    pageBreak: 'Adicionar nova página',
    chart: 'Criar gráfico de colunas',
    sum: 'Autossoma (Σ)',
    sheetNew: 'Nova aba de planilha',
    sheetRename: 'Renomear aba da planilha',
    sheetDuplicate: 'Duplicar aba da planilha',
    sheetDelete: 'Excluir aba da planilha',
    fillDown: 'Preencher fórmula para baixo',
    sort: 'Ordenar de A a Z',
    sortDesc: 'Ordenar de Z a A',
    addSlide: 'Novo slide',
    duplicateSlide: 'Duplicar slide',
    deleteSlide: 'Excluir slide',
    text: 'Inserir caixa de texto',
    rectangle: 'Inserir retângulo',
    circle: 'Inserir círculo / elipse',
    present: 'Apresentar em tela cheia (F5)',
    'switch-writer': 'Mudar para Escrita (Texto)',
    'switch-grid': 'Mudar para Planilha (Notas e Cálculos)',
    'switch-deck': 'Mudar para Apresentação (Slides)',
    'switch-draw': 'Mudar para Desenho Vetorial (Vectora)',
    focus: 'Modo Foco / Tela limpa',
    about: 'Sobre o Escola Office'
};

class EscolaOfficeApp {
    constructor() {
        this.active = 'writer';
        this.tab = 'Início';
        this.selectionText = '';
        this.zoom = 100;
        this.modalCleanup = null;
        this.saveScheduled = debounce(() => {
            this.flushEdits();
            this.persist();
        }, 450);
        this.engineMode = 'Texto nativo (Garamond)';
        this.lastPersistedRevision = -1;
        this.lastSavedTime = '';
        this.currentColorText = '#000000';
        this.currentColorFill = '#ffe066';
        this.basket = new BasketManager(this);
    }

    async start() {
        let state = null;
        this.persistence = new Persistence('escola-office-v1');
        try {
            await this.persistence.open();
            state = await this.persistence.load();
            if (state) {
                state = validateProject(state);
                if (state.title === 'Escola Office · Projeto Pedagógico 2026' || state.title === 'Projeto Pedagógico 2026') {
                    state.title = 'Caderno de Estudos';
                }
            }
        } catch (error) {
            console.warn('Recuperação de projeto local:', error.message);
            this.storageWarning = error.message;
        }

        this.store = new Store(state || makeSample());

        try {
            document.documentElement.dataset.theme = localStorage.getItem('escola-theme') || 'light';
        } catch { }

        this.mount();
        this.basket.init();

        this.store.on('change', event => {
            this.setSaved(false);
            this.saveScheduled();
            this.updateHistory();
            const title = document.querySelector('.project-title');
            if (document.activeElement !== title) title.textContent = this.store.state.title;
            if (this.active === 'writer') {
                const chromeTitle = document.querySelector('.document-chrome span');
                if (chromeTitle && document.activeElement !== chromeTitle) {
                    chromeTitle.textContent = this.store.state.writer?.title || this.store.state.title;
                }
                this.editor?.refreshPageFooters?.();
            }
            if (event.replace) this.renderEditor();
        });

        this.bind();
        this.renderEditor();
        this.updateHistory();
        this.startAutoSave();

        if (this.storageWarning) {
            this.setSaved(false, true);
            this.notify('Armazenamento do navegador restrito. Exporte uma cópia para guardar seu trabalho.', true);
        } else {
            this.persist();
        }

        window.meridian = this;
        window.escolaOffice = this;
        window.app = this;
    }

    mount() {
        document.querySelector('#app').innerHTML = `
        <div class="shell">
            <nav class="rail" aria-label="Aplicativos da Suíte">
                <button class="brand-mark" data-action="about" title="Escola Office — Suíte Educacional Livre">E</button>
                ${Object.entries(APPS).map(([key, a], index) => `
                    <button class="rail-btn ${key === this.active ? 'active' : ''}" data-action="switch-${key}" aria-label="${a.label}" title="${a.label} · Alt+${index + 1}">
                        <span class="app-icon ${a.icon}">${a.letter}</span>
                        <span>${a.label}</span>
                    </button>
                `).join('')}
                <div class="spacer"></div>
                <button class="round-icon" data-action="theme" aria-label="Alternar tema claro ou escuro" title="Tema e Aparência">${icon('moon')}</button>
                <button class="round-icon" data-action="help" aria-label="Atalhos do teclado" title="Atalhos e Ajuda">${icon('help')}</button>
                <button class="avatar profile-btn" data-action="profile" title="Meu Perfil Docente (Identificação Escolar)" aria-label="Perfil do Educador">${this.renderAvatarHTML()}</button>
            </nav>
            <header class="topbar">
                <div class="suite-name">Escola <span>Office</span></div>
                <div class="top-divider"></div>
                <div class="title-area">
                    <div class="project-title" contenteditable="plaintext-only" role="textbox" aria-label="Título do Projeto" spellcheck="false">${escapeHTML(this.store.state.title)}</div>
                    <span class="save-state">${icon('check')} <span>Salvo automaticamente</span></span>
                </div>
                <div class="top-actions">
                    <button class="btn outlined" data-action="palette" title="Buscar ferramentas ou comandos (Ctrl+K)" aria-label="Buscar comandos">
                        ${icon('search')} Buscar
                    </button>
                    <button class="btn outlined comments-toggle" data-action="toggle-comments">${icon('comment')} Comentários</button>
                    <button class="btn outlined basket-btn" data-action="basket" title="Cestinha Pedagógica (guardar e abrir arquivos ou peças depois)">${icon('basket')} <span>Cestinha</span><span class="basket-badge" style="display:none;background:var(--brand);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:3px">0</span></button>
                    <button class="btn whatsapp-top-btn" data-action="whatsapp" title="Exportar e enviar para o WhatsApp (Coordenador, Turma, etc.)">${icon('whatsapp')} <span>WhatsApp</span></button>
                    <button class="btn drive-top-btn" data-action="googleDrive" title="Exportar para o Google Drive (Docs, Sheets, Slides)">${icon('drive')} <span>Drive</span></button>
                    <button class="btn primary" data-action="export">${icon('export')} Exportar ${icon('chevron', 'chevron')}</button>
                    <button class="avatar profile-btn" data-action="profile" title="Meu Perfil Docente (Identificação Escolar)" aria-label="Perfil do Educador">${this.renderAvatarHTML()}</button>
                </div>
            </header>
            <nav class="tabbar" aria-label="Abas da Faixa de Opções"></nav>
            <div class="ribbon" role="toolbar" aria-label="Barra de Ferramentas"></div>
            <main class="workspace" id="workspace"></main>
            <footer class="statusbar">
                <div id="status-left" style="display:flex;gap:17px;align-items:center;flex-shrink:0"></div>
                <div class="status-center" style="margin:0 auto;text-align:center;font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 12px;opacity:0.85" title="Escola Office — Versão educacional customizada por Prof. Sérgio Araújo, baseada no projeto de código aberto Meridian Office (sob Licença MIT)">
                    Escola Office — Versão educacional customizada por Prof. Sérgio Araújo, baseada no projeto de código aberto Meridian Office (sob Licença MIT)
                </div>
                <div class="right" style="flex-shrink:0">
                    <button class="status-button engine-status" data-action="diagnostics" title="Diagnóstico de Renderização">
                        <span class="engine-dot"></span>
                        <span id="engine-label">Garamond & Cinzel</span>
                    </button>
                    <button class="status-button" data-action="focus" title="Modo Foco">${icon('page')}</button>
                    <div class="zoom-control">
                        <button data-action="zoomOut" aria-label="Reduzir zoom">−</button>
                        <input type="range" id="zoom-range" min="50" max="160" step="5" value="100" aria-label="Controle de Zoom">
                        <button data-action="zoomIn" aria-label="Aumentar zoom">+</button>
                        <span id="zoom-label">100%</span>
                    </div>
                </div>
            </footer>
        </div>`;
        this.renderRibbon();
    }

    bind() {
        document.addEventListener('click', event => {
            const action = event.target.closest('[data-action]');
            if (action) {
                event.preventDefault();
                this.execute(action.dataset.action, action.dataset.value);
            }
            const close = event.target.closest('[data-close]');
            if (close) this.closeModal();
        });

        document.querySelector('.ribbon').addEventListener('mousedown', event => {
            if (event.target.closest('button') || event.target.closest('.color-picker-group') || event.target.closest('.color-label')) {
                if (this.editor?.saveRange) this.editor.saveRange();
            }
            if (event.target.closest('button')) event.preventDefault();
        });

        const handleColorInput = event => {
            const command = event.target.dataset.command;
            if (command === 'color' || command === 'fill') {
                const val = event.target.value;
                if (command === 'color') this.currentColorText = val;
                if (command === 'fill') this.currentColorFill = val;
                const ind = document.querySelector(`#indicator-${command}`);
                if (ind) ind.style.backgroundColor = val;
                this.execute(command, val);
            }
        };

        document.addEventListener('input', event => {
            if (event.target.type === 'color' && event.target.dataset.command) {
                handleColorInput(event);
            }
        });

        document.addEventListener('change', event => {
            const command = event.target.dataset.command;
            if (command) {
                if (event.target.type === 'color') {
                    handleColorInput(event);
                } else {
                    this.execute(command, event.target.value);
                }
            }
        });

        const titleNode = document.querySelector('.project-title');
        titleNode.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
            }
        });
        titleNode.addEventListener('blur', e => {
            const title = e.target.textContent.trim().slice(0, 200) || 'Caderno de Estudos';
            this.store.transact('Renomear projeto', s => {
                s.title = title;
                if (s.writer) s.writer.title = title;
                if (s.workbook) s.workbook.title = title;
            });
            e.target.textContent = title;
            if (this.active === 'writer') {
                const chromeTitle = document.querySelector('.document-chrome span');
                if (chromeTitle) chromeTitle.textContent = title;
                this.editor?.refreshPageFooters?.();
            }
        });

        document.querySelector('#zoom-range').addEventListener('input', e => this.setZoom(Number(e.target.value)));
        document.querySelector('#file-input').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) await this.openFile(file);
        });

        document.addEventListener('keydown', e => this.keydown(e));
        window.addEventListener('pagehide', () => this.persistence.save(this.store.state).catch(() => { }));
    }

    renderRibbon() {
        const tabs = this.active === 'grid' 
            ? ['Início', 'Inserir', 'Fórmulas', 'Dados', 'Exibir']
            : this.active === 'deck' 
            ? ['Início', 'Inserir', 'Design', 'Apresentar', 'Exibir'] 
            : this.active === 'draw'
            ? ['Início', 'Formas', 'Caminho', 'Objeto', 'Exibir']
            : this.active === 'forms'
            ? ['Início', 'Questões', 'Gabarito', 'Respostas', 'Exibir']
            : ['Início', 'Inserir', 'Layout', 'Revisão', 'Exibir'];

        if (!tabs.includes(this.tab)) this.tab = 'Início';

        document.querySelector('.tabbar').innerHTML = `
            <button class="ribbon-tab file" data-action="file">Arquivo</button>
            ${tabs.map(tab => `<button class="ribbon-tab ${tab === this.tab ? 'active' : ''}" data-tab="${tab}">${tab}</button>`).join('')}
            <span class="tab-spacer"></span>
            <div class="quick-actions">
                <button class="icon-btn undo-button" data-action="undo" aria-label="Desfazer" title="Desfazer (Ctrl+Z)">${icon('undo')}</button>
                <button class="icon-btn redo-button" data-action="redo" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">${icon('redo')}</button>
                <button class="icon-btn" data-action="save" aria-label="Salvar localmente" title="Salvar no navegador">${icon('save')}</button>
            </div>`;

        document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
            this.tab = b.dataset.tab;
            this.renderRibbon();
        });

        const big = (action, label, ico = action) => `<button class="ribbon-big" data-action="${action}" title="${label}">${icon(ico)}<span>${label}</span></button>`;
        const small = (action, label, ico = action) => `<button class="ribbon-small" data-action="${action}" title="${label}">${icon(ico)}${label}</button>`;
        const ib = (action, ico = action, label = action) => `<button class="icon-btn" data-action="${action}" title="${label}" aria-label="${label}">${icon(ico)}</button>`;
        const group = (label, content) => `<div class="ribbon-group">${content}<div class="group-label">${label}</div></div>`;
        const color = (command, title) => {
            const isFill = command === 'fill';
            const defaultVal = isFill ? (this.currentColorFill || '#ffe066') : (this.currentColorText || '#000000');
            return `
                <div class="color-picker-group" title="${title}">
                    <button type="button" class="color-btn ${isFill ? 'fill' : ''}" data-action="${command}" title="${title} (clique para aplicar a cor atual)">
                        <span>${isFill ? '▧' : 'A'}</span>
                        <span class="color-indicator" id="indicator-${command}" style="background-color: ${defaultVal}"></span>
                    </button>
                    <label class="color-picker-toggle" title="Escolher cor (${title})">
                        <span class="dropdown-arrow">▾</span>
                        <input type="color" id="input-${command}" value="${defaultVal}" data-command="${command}" aria-label="${title}">
                    </label>
                </div>`;
        };

        const font = () => group('Fonte', `
            <div class="ribbon-row">
                ${this.active === 'writer' ? `
                    <select class="ribbon-select font" data-command="font" aria-label="Família da Fonte">
                        <option value="Cormorant Garamond">Garamond</option>
                        <option value="Cinzel">Cinzel</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Verdana">Verdana</option>
                    </select>` : '<span class="ribbon-label" style="width:105px;font-weight:600">Padrão Sistema</span>'}
                <select class="ribbon-select size" data-command="size" aria-label="Tamanho da Fonte">
                    ${[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72].map(n => `<option ${n === (this.active === 'deck' ? 24 : 14) ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
            </div>
            <div class="ribbon-row">
                ${ib('bold', 'bold', 'Negrito')}
                ${this.active === 'deck' ? '' : ib('italic', 'italic', 'Itálico') + ib('underline', 'underline', 'Sublinhado')}
                ${this.active === 'writer' ? ib('strike', 'strikethrough', 'Tachado') : ''}
                ${color('color', 'Cor do texto')}
                ${this.active === 'deck' ? '' : color('fill', 'Cor de fundo ou destaque')}
                ${this.active === 'writer' ? ib('clear', 'clear', 'Limpar formatação') : ''}
            </div>`);

        const clipboard = () => group('Transferência', `
            <div style="display:flex;gap:5px;align-items:center">
                ${big('paste', 'Colar', 'paste')}
                <div style="display:flex;flex-direction:column;gap:2px">
                    ${small('copy', 'Copiar', 'copy')}
                    ${small('cut', 'Recortar', 'cut')}
                </div>
                ${big('selectAll', 'Sel. Tudo', 'selectAll')}
            </div>`);

        const paragraph = () => group(this.active === 'writer' ? 'Parágrafo' : 'Alinhamento', `
            <div class="ribbon-row">
                ${this.active === 'writer' 
                    ? ib('bullets', 'list', 'Marcadores') + ib('numbered', 'numbered', 'Numeração') + ib('indent', 'indent', 'Aumentar recuo')
                    : small('alignLeft', 'Esquerda', 'alignLeft') + small('alignCenter', 'Centro', 'alignCenter')}
            </div>
            <div class="ribbon-row">
                ${ib('alignLeft', 'alignLeft', 'Alinhar à esquerda')}
                ${ib('alignCenter', 'alignCenter', 'Centralizar')}
                ${ib('alignRight', 'alignRight', 'Alinhar à direita')}
                ${this.active === 'writer' ? ib('justify', 'justify', 'Justificar') + ib('lineHeight', 'lineHeight', 'Espaçamento duplo') : ''}
            </div>`);

        let html = '';
        if (this.tab === 'Início') {
            html = clipboard() + font() + paragraph();
            if (this.active === 'writer') {
                html += group('Estilos', `<div class="ribbon-styles">${[['p', 'Normal', ''], ['h1', 'Título 1', 'h1'], ['h2', 'Título 2', 'h2']].map(([tag, label, cls]) => `<button class="style-tile ${cls} ${tag === 'p' ? 'selected' : ''}" data-action="heading" data-value="${tag}"><span class="sample">AaBb</span><span class="label">${label}</span></button>`).join('')}</div>`) 
                     + group('Edição', `<div>${small('find', 'Localizar', 'search')}</div><div>${small('replace', 'Substituir', 'replace')}</div>`) 
                     + group('Excluir', `<div style="display:flex">${big('deletePage', 'Excluir pág.', 'trash')}${big('clearAllWriter', 'Limpar tudo', 'clear')}</div>`)
                     + group('Revisão', big('comment', 'Comentar', 'comment'))
                     + group('Enviar', big('whatsapp', 'WhatsApp', 'whatsapp'))
                     + group('Cestinha', `<div style="display:flex">${big('basket', 'Cestinha', 'basket')}${small('basketAdd', 'Guardar', 'plus')}</div>`);
            } else if (this.active === 'grid') {
                html += group('Número', `
                    <div class="ribbon-row">
                        <select class="ribbon-select format" data-command="numberFormat" aria-label="Formato numérico">
                            <option value="general">Geral</option>
                            <option value="number">Número (2 casas)</option>
                            <option value="currency">Moeda (R$)</option>
                            <option value="percent">Porcentagem (%)</option>
                        </select>
                    </div>
                    <div class="ribbon-row">
                        <button class="icon-btn" data-action="currency" title="Moeda">R$</button>
                        <button class="icon-btn" data-action="percent" title="Porcentagem">%</button>
                        ${ib('clear', 'clear', 'Limpar conteúdo')}
                    </div>`) 
                     + group('Estilos', `<div class="ribbon-styles"><button class="style-tile selected" data-action="cellStyle" data-value="header"><span class="sample" style="font-size:13px;color:var(--brand);font-weight:700">Cabeçalho</span><span class="label">Coluna</span></button><button class="style-tile" data-action="cellStyle" data-value="total"><span class="sample" style="font-size:13px;font-weight:700">Total</span><span class="label">Resumo</span></button></div>`) 
                     + group('Operações', `<div class="ribbon-row">${small('sum', 'Autossoma', 'sigma')}</div><div class="ribbon-row">${small('sort', 'Ordem A–Z', 'sort')}${small('fillDown', 'Preencher', 'download')}</div>`)
                     + group('Excluir', `<div style="display:flex">${big('clearSelection', 'Limpar cél.', 'trash')}${big('clearSheet', 'Limpar aba', 'clear')}</div>`)
                     + group('Pedagógico', `<div style="display:flex">${big('recovery', 'Recuperação', 'sparkle')}${big('whatsapp', 'WhatsApp', 'whatsapp')}</div>`)
                     + group('Cestinha', `<div style="display:flex">${big('basket', 'Cestinha', 'basket')}${small('basketAdd', 'Guardar', 'plus')}</div>`);
            } else if (this.active === 'draw') {
                html += group('Ferramentas', `<div style="display:flex">${big('toolSelect', 'Seleção', 'select')}${big('toolPen', 'Caneta Bézier', 'pen')}${big('toolBrush', 'Pincel', 'brush')}</div>`)
                     + group('Formas', `<div style="display:flex">${big('toolRectangle', 'Retângulo', 'rectangle')}${big('toolEllipse', 'Elipse', 'circle')}${big('toolStar', 'Estrela', 'star')}</div>`)
                     + group('Organizar', `<div>${small('front', 'Para a frente', 'front')}</div><div>${small('back', 'Para trás', 'back')}</div>`)
                     + group('Exportar', `<div style="display:flex">${big('exportSVG', 'Exportar SVG', 'export')}${big('exportPNG', 'Exportar PNG', 'image')}</div>`)
                     + group('Enviar', big('whatsapp', 'WhatsApp', 'whatsapp'))
                     + group('Cestinha', `<div style="display:flex">${big('basket', 'Cestinha', 'basket')}${small('basketAdd', 'Guardar', 'plus')}</div>`);
            } else if (this.active === 'forms') {
                html += group('Questões', `<div style="display:flex">${big('addQuestion', 'Nova Questão', 'plus')}${big('showEditor', 'Modo Construtor', 'edit')}</div>`)
                     + group('Relatórios', `<div style="display:flex">${big('showAnalytics', 'Estatísticas', 'chart')}</div>`)
                     + group('Exportação Offline', `<div style="display:flex">${big('exportFormsHTML', 'Gerar HTML Offline', 'export')}</div>`)
                     + group('Enviar', big('whatsapp', 'WhatsApp', 'whatsapp'))
                     + group('Cestinha', `<div style="display:flex">${big('basket', 'Cestinha', 'basket')}${small('basketAdd', 'Guardar', 'plus')}</div>`);
            } else {
                html += group('Slides', `<div style="display:flex">${big('addSlide', 'Novo slide', 'slide')}${big('duplicateSlide', 'Duplicar', 'copy')}${big('deleteSlide', 'Excluir', 'trash')}</div>`) 
                     + group('Limpar', `<div style="display:flex">${big('clearSlide', 'Limpar slide', 'clear')}${big('clearAllDeck', 'Limpar tudo', 'trash')}</div>`)
                     + group('Apresentar', `<div style="display:flex">${big('tvExport', 'Para TV (USB)', 'tv')}${big('present', 'Apresentar', 'play')}</div>`)
                     + group('Inserir', `<div style="display:flex">${big('text', 'Caixa de texto', 'text')}${big('rectangle', 'Forma', 'rectangle')}${big('image', 'Imagem', 'image')}</div>`) 
                     + group('Organizar', `<div>${small('front', 'Para a frente', 'front')}</div><div>${small('back', 'Para trás', 'back')}</div>`)
                     + group('Enviar', big('whatsapp', 'WhatsApp', 'whatsapp'))
                     + group('Cestinha', `<div style="display:flex">${big('basket', 'Cestinha', 'basket')}${small('basketAdd', 'Guardar', 'plus')}</div>`);
            }
        } else if (this.tab === 'Inserir') {
            if (this.active === 'writer') {
                html = group('Pedagógico', `<div style="display:flex">${big('exam', 'Gerar Prova', 'file')}${big('rubric', 'Rubrica', 'table')}</div>`)
                     + group('Páginas', big('pageBreak', 'Nova página', 'break')) 
                     + group('Cabeçalho & Rodapé', `<div style="display:flex">${big('insertHeader', 'Cabeçalho', 'header')}${big('insertFooter', 'Rodapé', 'footer')}${big('insertPageNumber', 'Numeração', 'numbered')}</div>`)
                     + group('Tabelas', big('table', 'Tabela', 'table')) 
                     + group('Ilustrações', big('image', 'Imagem', 'image')) 
                     + group('Links', big('link', 'Hiperlink', 'link')) 
                     + group('Comentários', big('comment', 'Comentário', 'comment')) 
                     + group('Títulos', `<div class="ribbon-styles"><button class="style-tile h1" data-action="heading" data-value="h1"><span class="sample">AaBb</span><span class="label">Título 1</span></button><button class="style-tile h2" data-action="heading" data-value="h2"><span class="sample">AaBb</span><span class="label">Título 2</span></button></div>`);
            } else if (this.active === 'grid') {
                html = group('Planilha', big('sheetNew', 'Nova aba', 'table')) 
                     + group('Gráficos', big('chart', 'Gráfico coluna', 'chart')) 
                     + group('Fórmulas', big('sum', 'Autossoma', 'sigma')) 
                     + group('Pedagógico', big('recovery', 'Recuperação', 'sparkle'))
                     + group('Dados', big('open', 'Importar CSV/XLSX', 'folder'));
            } else {
                html = group('Slides', `<div style="display:flex">${big('addSlide', 'Novo slide', 'slide')}${big('duplicateSlide', 'Duplicar', 'copy')}</div>`) 
                     + group('Texto', big('text', 'Caixa de texto', 'text')) 
                     + group('Formas', `<div style="display:flex">${big('rectangle', 'Retângulo', 'rectangle')}${big('circle', 'Círculo', 'circle')}</div>`) 
                     + group('Mídia', big('image', 'Imagem', 'image'));
            }
        } else if (this.tab === 'Layout') {
            const currentOrientation = this.store.state.writer?.orientation || 'portrait';
            const currentMargin = this.store.state.writer?.margins || 'normal';
            const currentWidth = this.store.state.writer?.pageWidth || 'normal';
            const currentCols = this.store.state.writer?.columns || 1;
            const isSaving = currentMargin === 'narrow' && currentWidth === 'wide';

            html = group('Orientação', `
                    <div class="ribbon-row">
                        <label class="ribbon-label">Página</label>
                        <select class="ribbon-select" data-command="orientation" aria-label="Orientação da página">
                            <option value="portrait" ${currentOrientation === 'portrait' ? 'selected' : ''}>Retrato (Vertical)</option>
                            <option value="landscape" ${currentOrientation === 'landscape' ? 'selected' : ''}>Paisagem (Horizontal)</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:3px;margin-top:2px">
                        <button class="ribbon-btn ${currentOrientation === 'portrait' ? 'active' : ''}" data-action="orientation" data-value="portrait" title="Orientação Retrato (Vertical)">
                            ${icon('portrait')} Retrato
                        </button>
                        <button class="ribbon-btn ${currentOrientation === 'landscape' ? 'active' : ''}" data-action="orientation" data-value="landscape" title="Orientação Paisagem (Horizontal)">
                            ${icon('landscape')} Paisagem
                        </button>
                    </div>
                 `)
                 + group('Economia de Papel', `
                    <div style="display:flex;align-items:center;gap:6px">
                        ${big('paperSaver', isSaving ? 'Econômico ✓' : 'Economizar Papel', 'sparkle')}
                    </div>
                 `)
                 + group('Margens', `
                    <div class="ribbon-row">
                        <label class="ribbon-label">Margem</label>
                        <select class="ribbon-select" data-command="margins" aria-label="Margens da página">
                            <option value="narrow" ${currentMargin === 'narrow' ? 'selected' : ''}>Estreita (10mm - Folha Útil)</option>
                            <option value="moderate" ${currentMargin === 'moderate' ? 'selected' : ''}>Moderada (15mm)</option>
                            <option value="normal" ${currentMargin === 'normal' ? 'selected' : ''}>Normal (20mm)</option>
                            <option value="wide" ${currentMargin === 'wide' ? 'selected' : ''}>Larga (25mm)</option>
                        </select>
                    </div>
                    <div class="ribbon-row">
                        <label class="ribbon-label">Largura</label>
                        <select class="ribbon-select" data-command="pageWidth" aria-label="Largura da página">
                            <option value="compact" ${currentWidth === 'compact' ? 'selected' : ''}>Compacta (660px)</option>
                            <option value="normal" ${currentWidth === 'normal' ? 'selected' : ''}>A4 Padrão (744px)</option>
                            <option value="wide" ${currentWidth === 'wide' ? 'selected' : ''}>Ampla (840px - Mais texto)</option>
                            <option value="full" ${currentWidth === 'full' ? 'selected' : ''}>Livre / Tela Toda</option>
                        </select>
                    </div>
                 `)
                 + group('Colunas', `
                    <div class="ribbon-row">
                        <label class="ribbon-label">Colunas</label>
                        <select class="ribbon-select" data-command="columns" aria-label="Número de colunas">
                            <option value="1" ${currentCols === 1 ? 'selected' : ''}>1 Coluna (Normal)</option>
                            <option value="2" ${currentCols === 2 ? 'selected' : ''}>2 Colunas (Estilo Prova)</option>
                        </select>
                    </div>
                 `)
                 + group('Espaçamento', `
                    <div class="ribbon-row">
                        <label class="ribbon-label">Entrelinhas</label>
                        <select class="ribbon-select" data-command="lineHeight" aria-label="Espaçamento entre linhas">
                            <option value="1">Simples (1.0 - Econômico)</option>
                            <option value="1.2">Compacto (1.2 - Provas)</option>
                            <option value="1.5">1.5 linhas</option>
                            <option value="1.85" selected>Editorial (1.85)</option>
                            <option value="2">Duplo (2.0)</option>
                        </select>
                    </div>
                    <div class="ribbon-row">${small('indent', 'Recuo de parágrafo', 'indent')}</div>
                 `) 
                 + group('Páginas', `<div style="display:flex">${big('pageBreak', 'Nova página', 'break')}${big('deletePage', 'Excluir pág.', 'trash')}</div>`) 
                 + group('Impressão', big('print', 'Imprimir / PDF', 'print'));
        } else if (this.tab === 'Revisão') {
            html = group('Anotações', `<div style="display:flex">${big('comment', 'Comentar', 'comment')}${big('toggle-comments', 'Ver painel', 'panel')}</div>`) 
                 + group('Pesquisa', `<div style="display:flex">${big('find', 'Localizar', 'search')}${big('replace', 'Substituir', 'replace')}</div>`) 
                 + group('Contagem', big('documentStats', 'Estatísticas', 'file'));
        } else if (this.tab === 'Fórmulas') {
            html = group('Cálculos', `<div style="display:flex">${big('sum', 'Autossoma', 'sigma')}${big('formulaHelp', 'Guia fórmulas', 'file')}</div>`) 
                 + group('Pedagógico', big('recovery', 'Recuperação', 'sparkle'))
                 + group('Atualização', `<div style="display:flex">${big('recalculate', 'Recalcular', 'redo')}${big('fillDown', 'Preencher', 'download')}</div>`) 
                 + group('Navegação', big('find', 'Ir para célula', 'search'));
        } else if (this.tab === 'Dados') {
            html = group('Importar', big('open', 'Carregar arquivo', 'folder')) 
                 + group('Classificar', `<div style="display:flex">${big('sort', 'Crescente (A-Z)', 'sort')}${big('sortDesc', 'Decrescente (Z-A)', 'sort')}</div>`) 
                 + group('Abas', `<div style="display:flex">${big('sheetNew', 'Nova aba', 'table')}${big('sheetRename', 'Renomear', 'text')}${big('sheetDuplicate', 'Duplicar', 'copy')}${big('sheetDelete', 'Excluir aba', 'trash')}${big('clearSheet', 'Limpar dados', 'clear')}</div>`) 
                 + group('Gráficos', big('chart', 'Gerar gráfico', 'chart'))
                 + group('Pedagógico', big('recovery', 'Recuperação', 'sparkle'));
        } else if (this.tab === 'Design') {
            html = group('Fundo do Slide', `<div class="swatches" style="padding:13px 0">${['#f7f3eb', '#ffffff', '#2e241c', '#f5ebe1', '#e8dfd1', '#deb49a'].map(c => `<button class="swatch" data-action="slideBackground" data-value="${c}" style="background:${c}" aria-label="Definir cor ${c}"></button>`).join('')}</div>`) 
                 + group('Elementos', `<div style="display:flex">${big('text', 'Caixa texto', 'text')}${big('rectangle', 'Retângulo', 'rectangle')}${big('circle', 'Círculo', 'circle')}</div>`) 
                 + group('Posição', `<div style="display:flex">${big('front', 'Trazer à frente', 'front')}${big('back', 'Enviar ao fundo', 'back')}</div>`) 
                 + group('Excluir', big('deleteSlide', 'Excluir slide', 'trash'));
        } else if (this.tab === 'Apresentar') {
            html = group('Apresentação na TV', `<div style="display:flex">${big('tvExport', 'Para TV (USB)', 'tv')}${big('present', 'Iniciar (F5)', 'play')}</div>`) 
                 + group('Slides', `<div style="display:flex">${big('addSlide', 'Novo slide', 'slide')}${big('duplicateSlide', 'Duplicar', 'copy')}</div>`) 
                 + group('Exportar', `<div style="display:flex">${big('export', 'Exportar', 'export')}${big('whatsapp', 'WhatsApp', 'whatsapp')}</div>`);
        } else if (this.tab === 'Formas') {
            html = group('Formas Básicas', `<div style="display:flex">${big('toolRectangle', 'Retângulo', 'rectangle')}${big('toolEllipse', 'Elipse', 'circle')}${big('toolLine', 'Linha', 'line')}</div>`)
                 + group('Formas Especiais', `<div style="display:flex">${big('toolPolygon', 'Polígono', 'polygon')}${big('toolStar', 'Estrela', 'star')}${big('toolSpiral', 'Espiral', 'spiral')}</div>`)
                 + group('Desenho Livre', `<div style="display:flex">${big('toolBrush', 'Pincel', 'brush')}${big('toolPen', 'Caneta Bézier', 'pen')}</div>`);
        } else if (this.tab === 'Caminho') {
            html = group('Edição de Vetores', `<div style="display:flex">${big('toolDirect', 'Editar Nós', 'direct')}${big('toolPen', 'Caneta Bézier', 'pen')}</div>`)
                 + group('Organização', `<div style="display:flex">${big('group', 'Agrupar', 'combine')}${big('ungroup', 'Desagrupar', 'crop')}</div>`);
        } else if (this.tab === 'Objeto') {
            html = group('Ordem Visual', `<div style="display:flex">${big('front', 'Trazer p/ Frente', 'front')}${big('back', 'Enviar p/ Fundo', 'back')}</div>`)
                 + group('Alinhamento', `<div class="ribbon-row">${small('alignLeft', 'Esquerda', 'alignLeft')}${small('alignCenter', 'Centro', 'alignCenter')}${small('alignRight', 'Direita', 'alignRight')}</div>`)
                 + group('Exportação', `<div style="display:flex">${big('exportSVG', 'Exportar SVG', 'export')}${big('exportPNG', 'Exportar PNG', 'image')}</div>`);
        } else if (this.tab === 'Questões') {
            html = group('Questões', `<div style="display:flex">${big('addQuestion', 'Nova Questão', 'plus')}${big('showEditor', 'Modo Construtor', 'edit')}</div>`);
        } else if (this.tab === 'Gabarito') {
            html = group('Configurar Gabarito', `<div style="display:flex">${big('showEditor', 'Editar Respostas', 'check')}</div>`);
        } else if (this.tab === 'Respostas') {
            html = group('Estatísticas da Turma', `<div style="display:flex">${big('showAnalytics', 'Ver Relatório', 'chart')}</div>`)
                 + group('Exportação Offline', `<div style="display:flex">${big('exportFormsHTML', 'Gerar HTML Offline', 'export')}</div>`);
        } else if (this.tab === 'Exibir') {
            html = group('Visualização', `<div style="display:flex">${big('focus', 'Modo Foco', 'eye')}${big('theme', 'Tema Claro/Escuro', 'moon')}</div>`) 
                 + group('Zoom', `<div class="ribbon-row" style="height:57px">${[75, 100, 125].map(z => `<button class="style-tile" data-action="zoom" data-value="${z}"><span class="sample" style="font-size:18px">${z}%</span><span class="label">${z === 100 ? 'Normal' : z < 100 ? 'Reduzir' : 'Ampliar'}</span></button>`).join('')}</div>`) 
                 + group('Ajuda', `<div style="display:flex">${big('help', 'Atalhos', 'help')}${big('diagnostics', 'Informações', 'settings')}</div>`);
        }

        document.querySelector('.ribbon').innerHTML = html;
        this.updateHistory();
    }

    renderEditor() {
        this.editor?.dispose();
        const Ctor = APPS[this.active].ctor;
        this.editor = new Ctor(this);
        this.editor.mount(document.querySelector('#workspace'));
        this.editor.setZoom(this.zoom);
        document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.action === `switch-${this.active}`));
        const button = document.querySelector('.comments-toggle');
        button.style.display = this.active === 'writer' ? '' : 'none';
        this.renderRibbon();
    }

    switchApp(name) {
        if (!APPS[name] || name === this.active) return;
        this.flushEdits();
        this.active = name;
        this.tab = 'Início';
        this.zoom = 100;
        this.renderEditor();
        this.setZoom(100);
    }

    flushEdits() {
        this.editor?.commitEdit?.();
        this.editor?.commitText?.();
    }

    setStatus(html) {
        document.querySelector('#status-left').innerHTML = html;
    }

    setEngine(mode) {
        this.engineMode = mode;
        document.querySelector('#engine-label').textContent = mode === 'DOM text · native layout' ? 'Garamond & Cinzel' : mode;
    }

    setZoom(value) {
        this.zoom = Math.max(50, Math.min(160, Number(value) || 100));
        this.editor?.setZoom(this.zoom);
        document.querySelector('#zoom-range').value = this.zoom;
        document.querySelector('#zoom-label').textContent = `${this.zoom}%`;
    }

    updateHistory() {
        document.querySelectorAll('.undo-button').forEach(b => {
            b.disabled = !this.store?.past.length;
            b.title = this.store?.past.length ? `Desfazer: ${this.store.past.at(-1).label}` : 'Nada para desfazer';
        });
        document.querySelectorAll('.redo-button').forEach(b => b.disabled = !this.store?.future.length);
    }

    setSaved(saved, error = false) {
        const node = document.querySelector('.save-state');
        if (node) {
            let label = 'Salvando alterações…';
            let ico = 'save';
            if (error) {
                label = 'Armazenamento restrito · Exporte para salvar';
                ico = 'help';
            } else if (saved) {
                const timeInfo = this.lastSavedTime ? ` às ${this.lastSavedTime}` : '';
                label = `Salvo automaticamente${timeInfo}`;
                ico = 'check';
            }
            node.innerHTML = `${icon(ico)}<span>${label}</span>`;
        }
    }

    startAutoSave() {
        if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = setInterval(() => {
            this.flushEdits();
            if (this.store && this.store.revision !== this.lastPersistedRevision) {
                this.persist();
            }
        }, 3500);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.flushEdits();
                this.persist();
            }
        });

        window.addEventListener('beforeunload', () => {
            this.flushEdits();
            this.persist();
        });

        window.addEventListener('blur', () => {
            this.flushEdits();
            if (this.store && this.store.revision !== this.lastPersistedRevision) {
                this.persist();
            }
        });
    }

    async persist() {
        const revision = this.store.revision;
        try {
            await this.persistence.save(this.store.state);
            this.lastPersistedRevision = revision;
            const now = new Date();
            this.lastSavedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            if (revision === this.store.revision) this.setSaved(true);
            return true;
        } catch (error) {
            this.setSaved(false, true);
            return false;
        }
    }

    notify(message, error = false) {
        const toast = document.createElement('div');
        toast.className = `toast ${error ? 'error' : ''}`;
        toast.textContent = message;
        document.querySelector('#toast-host').append(toast);
        setTimeout(() => toast.remove(), error ? 6500 : 3700);
    }

    modal(title, body, setup, kind = '', cleanup = null) {
        this.closeModal();
        this.modalCleanup = cleanup;
        const host = document.querySelector('#modal-host');
        host.innerHTML = `
            <div class="modal-backdrop">
                <section class="modal ${kind}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
                    <div class="modal-head">
                        <h2>${escapeHTML(title)}</h2>
                        <button class="icon-btn" data-close aria-label="Fechar janela">${icon('close')}</button>
                    </div>
                    ${body}
                </section>
            </div>`;
        const modal = host.querySelector('.modal');
        host.querySelector('.modal-backdrop').addEventListener('pointerdown', e => {
            if (e.target.classList.contains('modal-backdrop')) this.closeModal();
        });
        setup?.(modal);
        modal.addEventListener('keydown', e => {
            if (e.key !== 'Tab') return;
            const items = [...modal.querySelectorAll('button,input,textarea,select,[tabindex]')].filter(n => !n.disabled && n.offsetParent !== null);
            const first = items[0], last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
        if (!modal.contains(document.activeElement)) modal.querySelector('input,textarea,button')?.focus();
    }

    closeModal() {
        this.modalCleanup?.();
        this.modalCleanup = null;
        document.querySelector('#modal-host').replaceChildren();
    }

    async execute(action, value) {
        try {
            if (action.startsWith('switch-')) {
                this.switchApp(action.slice(7));
                return;
            }
            switch (action) {
                case 'undo':
                    this.flushEdits();
                    this.store.undo();
                    return;
                case 'redo':
                    this.flushEdits();
                    this.store.redo();
                    return;
                case 'save':
                    this.flushEdits();
                    this.notify(await this.persist() ? 'Projeto salvo com sucesso no navegador.' : 'Armazenamento indisponível. Exporte uma cópia.', !this.persistence.db);
                    return;
                case 'export':
                    this.exportDialog();
                    return;
                case 'file':
                    this.fileDialog();
                    return;
                case 'open':
                    this.closeModal();
                    document.querySelector('#file-input').click();
                    return;
                case 'new':
                    this.newDialog();
                    return;
                case 'exam':
                    this.examDialog();
                    return;
                case 'rubric':
                    this.rubricDialog();
                    return;
                case 'insertHeader':
                    if (this.active !== 'writer') this.switchApp('writer');
                    this.editor?.insertHeaderDialog?.();
                    return;
                case 'insertFooter':
                    if (this.active !== 'writer') this.switchApp('writer');
                    this.editor?.insertFooterDialog?.();
                    return;
                case 'insertPageNumber':
                    if (this.active !== 'writer') this.switchApp('writer');
                    this.editor?.insertPageNumberDialog?.();
                    return;
                case 'recovery':
                    this.recoveryDialog();
                    return;
                case 'whatsapp':
                    this.whatsappDialog();
                    return;
                case 'googleDrive':
                    this.googleDriveDialog();
                    return;
                case 'profile':
                    this.profileDialog();
                    return;
                case 'orientation':
                    if (this.active !== 'writer') this.switchApp('writer');
                    this.editor?.command?.('orientation', value);
                    this.renderRibbon();
                    return;
                case 'tvExport':
                    await this.exportTV();
                    return;
                case 'basket':
                    openBasketDialog(this);
                    return;
                case 'basketAdd':
                    putCurrentProjectInBasket(this);
                    return;
                case 'print':
                    this.flushEdits();
                    window.print();
                    return;
                case 'theme': {
                    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
                    document.documentElement.dataset.theme = theme;
                    try {
                        localStorage.setItem('escola-theme', theme);
                    } catch { }
                    this.editor?.schedule?.();
                    this.notify(theme === 'dark' ? 'Tema escuro ativado.' : 'Tema pergaminho suave ativado.');
                    return;
                }
                case 'focus': {
                    const active = document.querySelector('.shell').classList.toggle('focus-mode');
                    document.querySelectorAll('.sidepanel,.review-panel,.slide-sidebar,.inspector').forEach(p => p.style.display = active ? 'none' : '');
                    this.notify(active ? 'Modo foco ativado. Clique no ícone de página para restaurar os painéis.' : 'Painéis restaurados.');
                    return;
                }
                case 'toggle-comments':
                    if (this.active !== 'writer') this.switchApp('writer');
                    {
                        const panel = document.querySelector('.review-panel');
                        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                    }
                    return;
                case 'zoom':
                    this.setZoom(value);
                    return;
                case 'zoomIn':
                    this.setZoom(this.zoom + 10);
                    return;
                case 'zoomOut':
                    this.setZoom(this.zoom - 10);
                    return;
                case 'palette':
                    this.palette();
                    return;
                case 'help':
                    this.help();
                    return;
                case 'about':
                    this.about();
                    return;
                case 'diagnostics':
                    this.diagnostics();
                    return;
                case 'formulaHelp':
                    this.formulaHelp();
                    return;
                case 'recalculate':
                    this.editor.engine?.reset();
                    this.editor.schedule?.();
                    this.notify('Fórmulas recalculadas e atualizadas.');
                    return;
                case 'cellStyle':
                    this.editor.format?.(value === 'header' 
                        ? { b: true, fill: '#f5ebe1', color: '#592c19' } 
                        : { b: true, fill: '#eedfd0', color: '#8c3b1d', fmt: 'number' });
                    return;
                case 'slideBackground':
                    this.store.transact('Fundo do slide', s => s.deck.slides[s.deck.activeSlide].background = value);
                    this.editor.inspector?.();
                    return;
                case 'documentStats': {
                    const text = this.store.state.writer.pages.map(p => new DOMParser().parseFromString(p.html, 'text/html').body.textContent).join(' ');
                    const words = text.trim().split(/\s+/).filter(Boolean).length;
                    this.modal('Estatísticas do Documento', `
                        <div class="export-grid">
                            <div class="export-card"><strong style="font-size:28px;color:var(--brand)">${words}</strong><small>Palavras redigidas</small></div>
                            <div class="export-card"><strong style="font-size:28px;color:var(--brand)">${text.length.toLocaleString()}</strong><small>Caracteres totais</small></div>
                            <div class="export-card"><strong style="font-size:28px;color:var(--brand)">${this.store.state.writer.pages.length}</strong><small>Páginas no texto</small></div>
                            <div class="export-card"><strong style="font-size:28px;color:var(--brand)">${Math.ceil(words / 200)} min</strong><small>Tempo estimado de leitura</small></div>
                        </div>`);
                    return;
                }
                case 'color': {
                    const val = value || this.currentColorText || '#000000';
                    this.currentColorText = val;
                    const ind = document.querySelector('#indicator-color');
                    if (ind) ind.style.backgroundColor = val;
                    const inp = document.querySelector('#input-color');
                    if (inp && inp.value !== val) inp.value = val;
                    this.editor?.command('color', val);
                    return;
                }
                case 'fill': {
                    const val = value || this.currentColorFill || '#ffe066';
                    this.currentColorFill = val;
                    const ind = document.querySelector('#indicator-fill');
                    if (ind) ind.style.backgroundColor = val;
                    const inp = document.querySelector('#input-fill');
                    if (inp && inp.value !== val) inp.value = val;
                    this.editor?.command('fill', val);
                    return;
                }
                default: 
                    this.editor?.command(action, value);
            }
        } catch (error) {
            console.error(error);
            this.notify(error.message || 'O comando não pôde ser executado.', true);
        }
    }

    keydown(e) {
        if (e.isComposing) return;
        const mod = e.ctrlKey || e.metaKey;
        if (document.querySelector('.modal')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeModal();
            }
            return;
        }
        if (e.altKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
            e.preventDefault();
            this.switchApp(Object.keys(APPS)[Number(e.key) - 1]);
            return;
        }
        if (mod) {
            const key = e.key.toLowerCase();
            const map = { s: e.shiftKey ? 'export' : 'save', o: 'open', z: e.shiftKey ? 'redo' : 'undo', y: 'redo', k: 'palette', b: 'bold', i: 'italic', u: 'underline', f: 'find', a: 'selectAll' };
            if (map[key]) {
                if (e.target.closest('.slide-text-edit,.cell-editor') && ['z', 'y', 'b', 'i', 'u', 'a'].includes(key)) return;
                e.preventDefault();
                this.execute(map[key]);
            }
        }
        if (e.key === 'F5' && this.active === 'deck') {
            e.preventDefault();
            this.execute('present');
        }
    }

    palette() {
        const commands = Object.entries(commandNames).filter(([key]) => {
            if (this.active === 'writer') {
                return !['chart', 'sum', 'sheetNew', 'sheetRename', 'sheetDuplicate', 'sheetDelete', 'fillDown', 'sort', 'sortDesc', 'addSlide', 'duplicateSlide', 'deleteSlide', 'text', 'rectangle', 'circle', 'present'].includes(key);
            }
            if (this.active === 'grid') {
                return !['replace', 'comment', 'table', 'image', 'pageBreak', 'addSlide', 'duplicateSlide', 'deleteSlide', 'text', 'rectangle', 'circle', 'present'].includes(key);
            }
            return !['replace', 'comment', 'table', 'pageBreak', 'chart', 'sum', 'sheetNew', 'sheetRename', 'sheetDuplicate', 'sheetDelete', 'fillDown', 'sort', 'sortDesc', 'find'].includes(key);
        });

        this.modal('O que você gostaria de fazer?', `
            <input class="command-input" id="command-search" placeholder="Digite para buscar ferramentas…" aria-label="Buscar comandos">
            <div class="command-list"></div>
        `, modal => {
            const render = () => {
                const term = modal.querySelector('input').value.toLowerCase();
                const list = modal.querySelector('.command-list');
                list.innerHTML = commands
                    .filter(([, label]) => label.toLowerCase().includes(term))
                    .map(([key, label]) => `
                        <button class="command-item" data-run="${key}">
                            ${icon(key === 'new' ? 'plus' : key)}
                            ${label}
                            <small>${key.startsWith('switch-') ? 'Módulo' : 'Ação'}</small>
                        </button>
                    `).join('');
                list.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
                    this.closeModal();
                    this.execute(b.dataset.run);
                });
            };
            const input = modal.querySelector('input');
            input.addEventListener('input', render);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    modal.querySelector('.command-item')?.click();
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    modal.querySelector('.command-item')?.focus();
                }
            });
            render();
            input.focus();
        });
    }

    fileDialog() {
        this.modal('Seus projetos escolares em um só lugar.', `
            <p>Texto editorial, planilha de notas e apresentações visuais integradas. Tudo 100% offline, sem cadastro e sem nuvem.</p>
            <div class="export-grid">
                <button class="export-card" data-action="new">
                    ${icon('plus')}
                    <strong>Novo Espaço / Modelos</strong>
                    <small>Escolha entre os modelos pedagógicos ou comece em branco.</small>
                </button>
                <button class="export-card" data-action="exam">
                    ${icon('file')}
                    <strong>Gerar Prova / Atividades</strong>
                    <small>Avaliações bimestrais, folhas de redação e estudos dirigidos com cabeçalho.</small>
                </button>
                <button class="export-card" data-action="rubric">
                    ${icon('table')}
                    <strong>Gerar Rubrica Formativa</strong>
                    <small>Matrizes de critérios para seminários, redações e projetos.</small>
                </button>
                <button class="export-card" data-action="recovery">
                    ${icon('sparkle')}
                    <strong>Cálculo de Recuperação</strong>
                    <small>Análise da turma, cálculo de notas da prova final e convocação.</small>
                </button>
                <button class="export-card" data-action="open">
                    ${icon('folder')}
                    <strong>Abrir Arquivo</strong>
                    <small>Carregue .meridian, DOCX, XLSX, PPTX, HTML, texto ou CSV.</small>
                </button>
                <button class="export-card" data-action="basket" style="border: 1.5px solid var(--brand); background: rgba(140,59,29,0.06)">
                    ${icon('basket')}
                    <strong style="color:var(--brand)">🧺 Cestinha Pedagógica</strong>
                    <small>Guarde ou resgate seus trabalhos e peças do navegador (offline).</small>
                </button>
                <button class="export-card" data-action="whatsapp" style="border: 1.5px solid #25d366; background: rgba(37,211,102,0.06)">
                    ${icon('whatsapp')}
                    <strong style="color:#128c7e">Enviar para WhatsApp</strong>
                    <small>Compartilhe o arquivo (.docx, .xlsx ou .pptx) com o coordenador sem perder o formato.</small>
                </button>
                <button class="export-card" data-action="export">
                    ${icon('download')}
                    <strong>Exportar e Baixar</strong>
                    <small>Gere arquivos compatíveis com Word, Excel, PowerPoint e Web.</small>
                </button>
                <button class="export-card" data-action="print">
                    ${icon('print')}
                    <strong>Imprimir / Gerar PDF</strong>
                    <small>Utilize o diálogo de impressão do próprio navegador.</small>
                </button>
            </div>
            <p style="font-size:11px;color:var(--muted);margin-top:16px">Arquivos .meridian mantêm todas as abas, comentários pedagógicos e notas preservados.</p>
        `);
    }

    newDialog() {
        this.modal('Iniciar um Novo Projeto Escolar', `
            <p>Selecione um modelo pedagógico, inicie uma avaliação oficial ou crie um espaço em branco. Se quiser manter o trabalho atual, faça uma exportação antes.</p>
            <label class="field">Título do Projeto Escolar
                <input id="new-title" value="Caderno de Estudos" placeholder="Ex: Caderno de Estudos">
            </label>
            <div class="modal-footer" style="flex-wrap:wrap;gap:8px">
                <button class="btn" data-close>Cancelar</button>
                <button class="btn outlined" id="new-exam">${icon('file')} Gerar Prova</button>
                <button class="btn outlined" id="new-rubric">${icon('table')} Gerar Rubrica</button>
                <button class="btn outlined" id="load-sample">Carregar Modelo Completo</button>
                <button class="btn primary" id="new-project">Criar em Branco</button>
            </div>
        `, modal => {
            const create = sample => {
                const state = makeSample();
                if (!sample) {
                    state.title = modal.querySelector('#new-title').value.trim() || 'Caderno de Estudos';
                    state.writer = { title: 'Redação Escolar', pages: [{ id: uid(), html: '<p><br></p>' }], comments: [] };
                    state.workbook = { title: 'Planilha Escolar', activeSheet: 'folha1', sheets: [{ id: 'folha1', name: 'Planilha 1', rows: 10000, cols: 64, widths: {}, cells: {} }] };
                    state.deck = { title: 'Apresentação Escolar', activeSlide: 0, slides: [{ id: uid(), background: '#f7f3eb', elements: [], notes: '' }] };
                }
                this.closeModal();
                this.store.replace(state);
                this.notify(sample ? 'Modelo pedagógico completo carregado com sucesso.' : 'Novo projeto escolar criado.');
            };
            modal.querySelector('#new-project').onclick = () => create(false);
            modal.querySelector('#load-sample').onclick = () => create(true);
            modal.querySelector('#new-exam').onclick = () => {
                this.closeModal();
                this.examDialog();
            };
            modal.querySelector('#new-rubric').onclick = () => {
                this.closeModal();
                this.rubricDialog();
            };
        });
    }

    examDialog() {
        const prof = this.getProfile();
        this.modal('Gerador de Folha de Provas & Atividades', `
            <p style="font-size:12px;color:var(--muted);margin-bottom:14px">
                Gere avaliações oficiais padronizadas com cabeçalho escolar oficial, campos para identificação, notas e pautas prontas para impressão ou edição.
            </p>
            <div class="field-grid">
                <label>Nome da Unidade Escolar
                    <input id="ex-escola" value="${escapeHTML(prof.school || 'Escola Municipal de Ensino Fundamental')}" placeholder="Nome da Escola">
                </label>
                <label>Componente Curricular / Disciplina
                    <input id="ex-disciplina" value="${escapeHTML(prof.subject || 'História')}" placeholder="Ex: História, Geografia, Português...">
                </label>
                <label>Ano e Turma
                    <input id="ex-turma" value="9º Ano — Turma A" placeholder="Ex: 9º Ano A">
                </label>
                <label>Docente / Professor(a)
                    <input id="ex-professor" value="${escapeHTML(prof.name || 'Prof. Sérgio Araújo')}" placeholder="Nome do Professor">
                </label>
                <label>Bimestre / Unidade Letiva
                    <input id="ex-periodo" value="${escapeHTML(prof.unit || '1º Bimestre')} — Ano Letivo ${escapeHTML(prof.year || '2026')}" placeholder="Ex: 1º Bimestre">
                </label>
                <label>Pontuação / Valor da Avaliação
                    <input id="ex-valor" value="Valor: 10,0 pontos" placeholder="Ex: Valor: 10,0 pontos">
                </label>
            </div>

            <label class="field" style="margin-top:12px">Título Principal da Prova
                <input id="ex-titulo" value="AVALIAÇÃO DE APRENDIZAGEM" placeholder="Ex: AVALIAÇÃO BIMESTRAL DE HISTÓRIA">
            </label>

            <label class="field">Formato e Estrutura Pedagógica
                <select id="ex-tipo">
                    ${EXAM_TYPES.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                </select>
            </label>

            <label class="field">Destino da Folha
                <select id="ex-destino">
                    <option value="novo">Criar como Novo Documento de Prova</option>
                    <option value="inserir">Inserir como Nova Página no Documento Atual</option>
                </select>
            </label>

            <label class="field">Orientações aos Estudantes
                <textarea id="ex-instrucoes" style="min-height:55px">Leia com atenção cada questão. Utilize caneta esferográfica azul ou preta. Escreva com letra legível e fundamente suas respostas.</textarea>
            </label>

            <div class="modal-footer">
                <button class="btn" data-close>Cancelar</button>
                <button class="btn primary" id="btn-gerar-prova">${icon('sparkle')} Gerar Folha de Avaliação</button>
            </div>
        `, modal => {
            modal.querySelector('#btn-gerar-prova').onclick = () => {
                const options = {
                    escola: modal.querySelector('#ex-escola').value.trim(),
                    disciplina: modal.querySelector('#ex-disciplina').value.trim(),
                    turma: modal.querySelector('#ex-turma').value.trim(),
                    professor: modal.querySelector('#ex-professor').value.trim(),
                    periodo: modal.querySelector('#ex-periodo').value.trim(),
                    valor: modal.querySelector('#ex-valor').value.trim(),
                    titulo: modal.querySelector('#ex-titulo').value.trim(),
                    tipo: modal.querySelector('#ex-tipo').value,
                    instrucoes: modal.querySelector('#ex-instrucoes').value.trim()
                };
                const destino = modal.querySelector('#ex-destino').value;
                const html = generateExamHTML(options);
                const docTitle = `${options.titulo} — ${options.disciplina} (${options.turma})`;

                this.closeModal();

                if (destino === 'novo') {
                    this.store.transact('Gerar Folha de Avaliação', s => {
                        s.title = docTitle;
                        s.writer = {
                            title: docTitle,
                            pages: [{ id: uid(), html }],
                            comments: []
                        };
                    });
                } else {
                    this.store.transact('Inserir Página de Avaliação', s => {
                        s.writer.pages.push({ id: uid(), html });
                    });
                }

                if (this.active !== 'writer') {
                    this.switchApp('writer');
                } else {
                    this.renderEditor();
                }

                this.notify('Folha de avaliação pedagógica gerada com sucesso! Você pode editar as questões e imprimir (Ctrl+P).');
            };
        });
    }

    rubricDialog() {
        this.modal('Gerador de Rubricas de Avaliação Formativa', `
            <p style="font-size:12px;color:var(--muted);margin-bottom:14px">
                Crie matrizes de rubrica claras com níveis de proficiência (Inicial, Em Desenvolvimento, Proficiente e Avançado), descritores observáveis e espaço para feedback formativo do professor.
            </p>
            <div class="field-grid">
                <label>Nome da Unidade Escolar
                    <input id="rb-escola" value="Escola Municipal de Ensino Fundamental" placeholder="Nome da Escola">
                </label>
                <label>Componente Curricular / Disciplina
                    <input id="rb-disciplina" value="História" placeholder="Ex: História, Redação, Ciências...">
                </label>
                <label>Ano e Turma
                    <input id="rb-turma" value="9º Ano — Turma A" placeholder="Ex: 9º Ano A">
                </label>
                <label>Docente / Professor(a)
                    <input id="rb-professor" value="Prof. Sérgio Araújo" placeholder="Nome do Professor">
                </label>
                <label>Bimestre / Unidade Letiva
                    <input id="rb-periodo" value="1º Bimestre — Ano Letivo 2026" placeholder="Ex: 1º Bimestre">
                </label>
                <label>Atividade ou Objeto Avaliado
                    <input id="rb-atividade" value="Seminário Temático: Memória e Território" placeholder="Ex: Seminário, Produção Textual, etc.">
                </label>
            </div>

            <label class="field" style="margin-top:12px">Modelo de Rubrica Pedagógica
                <select id="rb-tipo">
                    ${RUBRIC_TEMPLATES.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                </select>
            </label>

            <label class="field">Destino da Rubrica
                <select id="rb-destino">
                    <option value="novo">Criar como Novo Documento de Rubrica</option>
                    <option value="inserir">Inserir como Nova Página no Documento Atual</option>
                </select>
            </label>

            <div class="modal-footer">
                <button class="btn" data-close>Cancelar</button>
                <button class="btn primary" id="btn-gerar-rubrica">${icon('sparkle')} Gerar Rubrica de Avaliação</button>
            </div>
        `, modal => {
            modal.querySelector('#btn-gerar-rubrica').onclick = () => {
                const options = {
                    escola: modal.querySelector('#rb-escola').value.trim(),
                    disciplina: modal.querySelector('#rb-disciplina').value.trim(),
                    turma: modal.querySelector('#rb-turma').value.trim(),
                    professor: modal.querySelector('#rb-professor').value.trim(),
                    periodo: modal.querySelector('#rb-periodo').value.trim(),
                    atividade: modal.querySelector('#rb-atividade').value.trim(),
                    tipo: modal.querySelector('#rb-tipo').value
                };
                const destino = modal.querySelector('#rb-destino').value;
                const html = generateRubricHTML(options);
                const docTitle = `Rubrica: ${options.atividade} — ${options.disciplina}`;

                this.closeModal();

                if (destino === 'novo') {
                    this.store.transact('Gerar Rubrica de Avaliação', s => {
                        s.title = docTitle;
                        s.writer = {
                            title: docTitle,
                            pages: [{ id: uid(), html }],
                            comments: []
                        };
                    });
                } else {
                    this.store.transact('Inserir Página de Rubrica', s => {
                        s.writer.pages.push({ id: uid(), html });
                    });
                }

                if (this.active !== 'writer') {
                    this.switchApp('writer');
                } else {
                    this.renderEditor();
                }

                this.notify('Rubrica de avaliação formativa gerada com sucesso! Você pode editar os critérios e imprimir (Ctrl+P).');
            };
        });
    }

    recoveryDialog() {
        if (this.active !== 'grid') {
            this.switchApp('grid');
        }

        const currentWorkbook = this.store.state.workbook;
        const currentSheetId = currentWorkbook.activeSheet;
        const initialAnalysis = analyzeRecovery(currentWorkbook, currentSheetId, { mediaCorte: 6.0, mediaFinalMin: 5.0 });

        const renderContent = (analysis) => {
            const hasRecup = analysis.recuperacao.length > 0;
            const recupListHTML = hasRecup
                ? analysis.recuperacao.map((s, idx) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${idx % 2 === 0 ? 'var(--panel)' : 'transparent'};border-bottom:1px solid var(--line);font-size:12px">
                        <div>
                            <strong>${escapeHTML(s.nome)}</strong>
                            <div style="font-size:11px;color:var(--muted)">Linha ${s.row} · Média Atual: <strong>${s.media.toFixed(1)}</strong></div>
                        </div>
                        <div style="text-align:right">
                            <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#fce8e6;color:#8c3b1d">
                                ${s.viavel ? `Precisa de ${s.notaNecessaria.toFixed(1)}` : 'Situação Crítica (>10)'}
                            </span>
                        </div>
                    </div>
                `).join('')
                : `<div style="padding:16px;text-align:center;color:#15803d;font-size:13px">
                    ${icon('check')} <strong>Nenhum estudante em recuperação!</strong> Todos os alunos atingiram a meta mínima.
                   </div>`;

            return `
                <p style="font-size:12px;color:var(--muted);margin-bottom:14px">
                    Analisa as notas da turma na aba ativa (<strong>${escapeHTML(this.store.state.workbook.sheets.find(s => s.id === currentSheetId)?.name || 'Planilha')}</strong>), identifica automaticamente quem precisa de Prova Final e calcula a pontuação exata para aprovação.
                </p>

                <div class="export-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:16px">
                    <div class="export-card" style="cursor:default">
                        <strong style="font-size:24px;color:var(--ink)">${analysis.total}</strong>
                        <small>Total Estudantes</small>
                    </div>
                    <div class="export-card" style="cursor:default">
                        <strong style="font-size:24px;color:#15803d">${analysis.aprovados.length} (${analysis.taxaAprovacao}%)</strong>
                        <small>Aprovados Direto</small>
                    </div>
                    <div class="export-card" style="cursor:default">
                        <strong style="font-size:24px;color:#8c3b1d">${analysis.recuperacao.length} (${100 - analysis.taxaAprovacao}%)</strong>
                        <small>Em Recuperação</small>
                    </div>
                </div>

                <div class="field-grid" style="margin-bottom:14px">
                    <label>Média Mínima para Aprovação Direta
                        <input id="rec-corte" type="number" step="0.1" value="${analysis.mediaCorte}" min="0" max="10">
                    </label>
                    <label>Média Mínima Final (com a Prova de Recup.)
                        <input id="rec-final" type="number" step="0.1" value="${analysis.mediaFinalMin}" min="0" max="10">
                    </label>
                </div>

                <div id="rec-list-container" style="border:1px solid var(--line);border-radius:6px;max-height:210px;overflow-y:auto;margin-bottom:16px">
                    <div style="padding:8px 12px;background:var(--panel2);border-bottom:1px solid var(--line);font-size:11px;font-weight:700;color:var(--muted);letter-spacing:0.5px">
                        RELAÇÃO DE ESTUDANTES E NOTAS NECESSÁRIAS
                    </div>
                    ${recupListHTML}
                </div>

                <div class="modal-footer" style="flex-wrap:wrap;gap:8px">
                    <button class="btn" data-close>Fechar</button>
                    <button class="btn outlined" id="btn-copiar-convocacao">${icon('copy')} Copiar Convocação (WhatsApp/Avisos)</button>
                    <button class="btn primary" id="btn-aplicar-planilha">${icon('sparkle')} Aplicar Fórmulas na Planilha</button>
                </div>
            `;
        };

        this.modal('Calculadora Inteligente de Recuperação da Turma', renderContent(initialAnalysis), modal => {
            let currentAnalysis = initialAnalysis;

            const updateAnalysis = () => {
                const c = Number(modal.querySelector('#rec-corte').value) || 6.0;
                const f = Number(modal.querySelector('#rec-final').value) || 5.0;
                currentAnalysis = analyzeRecovery(this.store.state.workbook, currentSheetId, { mediaCorte: c, mediaFinalMin: f });
                
                modal.querySelector('.export-grid').children[0].querySelector('strong').textContent = currentAnalysis.total;
                modal.querySelector('.export-grid').children[1].querySelector('strong').textContent = `${currentAnalysis.aprovados.length} (${currentAnalysis.taxaAprovacao}%)`;
                modal.querySelector('.export-grid').children[2].querySelector('strong').textContent = `${currentAnalysis.recuperacao.length} (${100 - currentAnalysis.taxaAprovacao}%)`;
                
                const recupContainer = modal.querySelector('#rec-list-container');
                if (recupContainer) {
                    const hasRec = currentAnalysis.recuperacao.length > 0;
                    const listHTML = hasRec
                        ? currentAnalysis.recuperacao.map((s, idx) => `
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${idx % 2 === 0 ? 'var(--panel)' : 'transparent'};border-bottom:1px solid var(--line);font-size:12px">
                                <div>
                                    <strong>${escapeHTML(s.nome)}</strong>
                                    <div style="font-size:11px;color:var(--muted)">Linha ${s.row} · Média Atual: <strong>${s.media.toFixed(1)}</strong></div>
                                </div>
                                <div style="text-align:right">
                                    <span style="display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#fce8e6;color:#8c3b1d">
                                        ${s.viavel ? `Precisa de ${s.notaNecessaria.toFixed(1)}` : 'Situação Crítica (>10)'}
                                    </span>
                                </div>
                            </div>
                        `).join('')
                        : `<div style="padding:16px;text-align:center;color:#15803d;font-size:13px">
                            ${icon('check')} <strong>Nenhum estudante em recuperação!</strong> Todos os alunos atingiram a meta mínima.
                           </div>`;
                    recupContainer.innerHTML = `
                        <div style="padding:8px 12px;background:var(--panel2);border-bottom:1px solid var(--line);font-size:11px;font-weight:700;color:var(--muted);letter-spacing:0.5px">
                            RELAÇÃO DE ESTUDANTES E NOTAS NECESSÁRIAS
                        </div>
                        ${listHTML}
                    `;
                }
            };

            modal.querySelector('#rec-corte').addEventListener('input', updateAnalysis);
            modal.querySelector('#rec-final').addEventListener('input', updateAnalysis);

            modal.querySelector('#btn-copiar-convocacao').onclick = () => {
                const sheet = this.store.state.workbook.sheets.find(s => s.id === currentSheetId);
                const txt = formatRecoveryReport(currentAnalysis, {
                    escola: 'Escola Municipal de Ensino Fundamental',
                    disciplina: 'História / Componente Curricular',
                    turma: sheet?.name || '9º Ano',
                    professor: 'Prof. Sérgio Araújo'
                });
                navigator.clipboard?.writeText(txt).then(() => {
                    this.notify('Lista de convocação de recuperação copiada para a área de transferência!');
                }).catch(() => {
                    this.notify('Texto gerado e pronto para envio.');
                });
            };

            modal.querySelector('#btn-aplicar-planilha').onclick = () => {
                this.store.transact('Calcular Recuperação Final', s => {
                    const sheet = s.workbook.sheets.find(x => x.id === currentSheetId);
                    if (sheet) {
                        applyRecoveryToSheet(sheet, currentAnalysis, { mediaFinalMin: currentAnalysis.mediaFinalMin });
                    }
                });
                this.closeModal();
                this.editor.engine?.reset();
                this.editor.schedule?.();
                this.notify('Colunas de Prova Final e Nota Necessária aplicadas com fórmulas vivas na planilha!');
            };
        });
    }

    whatsappDialog() {
        this.flushEdits();
        openWhatsAppDialog(this);
    }

    googleDriveDialog() {
        this.flushEdits();
        openGoogleDriveDialog(this);
    }

    getProfile() {
        try {
            const stored = localStorage.getItem('escola-perfil');
            if (stored) {
                return Object.assign({
                    name: 'Prof. Sérgio Araújo',
                    school: 'Escola Municipal de Ensino Fundamental',
                    subject: 'História',
                    year: '2026',
                    unit: 'I Unidade',
                    avatar: ''
                }, JSON.parse(stored));
            }
        } catch { }
        return {
            name: 'Prof. Sérgio Araújo',
            school: 'Escola Municipal de Ensino Fundamental',
            subject: 'História',
            year: '2026',
            unit: 'I Unidade',
            avatar: ''
        };
    }

    saveProfile(data) {
        try {
            localStorage.setItem('escola-perfil', JSON.stringify(data));
        } catch { }
        this.updateAvatarUI();
        this.notify('Perfil do Educador atualizado com sucesso!');
    }

    renderAvatarHTML() {
        const profile = this.getProfile();
        if (profile.avatar) {
            return `<img src="${escapeHTML(profile.avatar)}" alt="${escapeHTML(profile.name)}" style="width:100%;height:100%;aspect-ratio:1/1;object-fit:cover;object-position:center;border-radius:50%;display:block;padding:0;margin:0">`;
        }
        const initials = (profile.name || 'EO')
            .split(' ')
            .filter(Boolean)
            .map(w => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'EO';
        return escapeHTML(initials);
    }

    updateAvatarUI() {
        const html = this.renderAvatarHTML();
        document.querySelectorAll('.avatar.profile-btn, nav.rail .avatar, header.topbar .avatar').forEach(el => {
            el.innerHTML = html;
        });
    }

    profileDialog() {
        const profile = this.getProfile();
        const modalHTML = `
            <div class="profile-dialog" style="display:flex;flex-direction:column;gap:16px">
                <!-- Cabeçalho do Perfil com Avatar -->
                <div style="display:flex;align-items:center;gap:18px;padding:14px;background:var(--panel2);border:1px solid var(--line);border-radius:10px">
                    <div class="profile-avatar-preview" id="profile-avatar-display">
                        ${this.renderAvatarHTML()}
                    </div>
                    <div style="flex:1">
                        <strong style="font-size:16px;display:block;color:var(--text)">${escapeHTML(profile.name || 'Professor(a)')}</strong>
                        <div style="font-size:12px;color:var(--muted);margin-top:2px">${escapeHTML(profile.subject || 'Componente Curricular')} · ${escapeHTML(profile.school || 'Escola')}</div>
                        <div style="display:flex;gap:8px;margin-top:8px">
                            <button type="button" class="btn outlined" id="btn-upload-avatar" style="font-size:11px;padding:4px 10px">
                                ${icon('image')} Alterar Foto
                            </button>
                            <button type="button" class="btn" id="btn-remove-avatar" style="font-size:11px;padding:4px 8px;color:#c01c28">
                                Remover Foto
                            </button>
                            <input type="file" id="input-avatar-file" accept="image/*" style="display:none">
                        </div>
                    </div>
                </div>

                <!-- Formulário de Campos -->
                <div class="field-grid">
                    <label>Nome Completo do Educador(a)
                        <input id="prof-name" value="${escapeHTML(profile.name || '')}" placeholder="Ex: Prof. Sérgio Araújo">
                    </label>
                    <label>Nome da Unidade Escolar
                        <input id="prof-school" value="${escapeHTML(profile.school || '')}" placeholder="Ex: Escola Municipal de Ensino Fundamental">
                    </label>
                    <label>Componente Curricular / Disciplina
                        <input id="prof-subject" value="${escapeHTML(profile.subject || '')}" placeholder="Ex: História, Geografia, etc.">
                    </label>
                    <label>Ano Letivo
                        <input id="prof-year" value="${escapeHTML(profile.year || '2026')}" placeholder="Ex: 2026">
                    </label>
                    <label>Unidade / Bimestre Vigente
                        <select id="prof-unit">
                            <option value="I Unidade" ${profile.unit === 'I Unidade' ? 'selected' : ''}>I Unidade</option>
                            <option value="II Unidade" ${profile.unit === 'II Unidade' ? 'selected' : ''}>II Unidade</option>
                            <option value="III Unidade" ${profile.unit === 'III Unidade' ? 'selected' : ''}>III Unidade</option>
                            <option value="IV Unidade" ${profile.unit === 'IV Unidade' ? 'selected' : ''}>IV Unidade</option>
                            <option value="1º Bimestre" ${profile.unit === '1º Bimestre' ? 'selected' : ''}>1º Bimestre</option>
                            <option value="2º Bimestre" ${profile.unit === '2º Bimestre' ? 'selected' : ''}>2º Bimestre</option>
                            <option value="3º Bimestre" ${profile.unit === '3º Bimestre' ? 'selected' : ''}>3º Bimestre</option>
                            <option value="4º Bimestre" ${profile.unit === '4º Bimestre' ? 'selected' : ''}>4º Bimestre</option>
                        </select>
                    </label>
                </div>

                <div style="background:rgba(140,59,29,0.06);border:1px solid rgba(140,59,29,0.18);border-radius:8px;padding:10px 12px;font-size:11.5px;color:var(--text);line-height:1.5">
                    <strong>💡 Preenchimento Inteligente:</strong> Ao salvar o seu perfil, esses dados serão usados automaticamente no gerador de <em>Folha de Provas</em>, nos <em>Cabeçalhos Escolares</em> e nas <em>Rubricas de Avaliação</em>, poupando seu tempo na sala de aula.
                </div>

                <div class="modal-footer" style="margin-top:10px">
                    <button class="btn" data-close>Cancelar</button>
                    <button class="btn primary" id="btn-save-profile">${icon('check')} Salvar Perfil</button>
                </div>
            </div>
        `;

        this.modal('Perfil do Educador', modalHTML, modal => {
            let currentAvatarData = profile.avatar || '';

            const fileInput = modal.querySelector('#input-avatar-file');
            const btnUpload = modal.querySelector('#btn-upload-avatar');
            const btnRemove = modal.querySelector('#btn-remove-avatar');
            const preview = modal.querySelector('#profile-avatar-display');

            btnUpload.onclick = () => fileInput.click();

            fileInput.onchange = e => {
                const file = e.target.files?.[0];
                if (file) {
                    if (file.size > 3 * 1024 * 1024) {
                        this.notify('A imagem deve ter no máximo 3 MB.', true);
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = ev => {
                        currentAvatarData = ev.target.result;
                        preview.innerHTML = `<img src="${currentAvatarData}" alt="Avatar" style="width:100%;height:100%;aspect-ratio:1/1;object-fit:cover;object-position:center;border-radius:50%;display:block;padding:0;margin:0">`;
                    };
                    reader.readAsDataURL(file);
                }
            };

            btnRemove.onclick = () => {
                currentAvatarData = '';
                const name = modal.querySelector('#prof-name').value.trim() || 'EO';
                const initials = name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'EO';
                preview.innerHTML = escapeHTML(initials);
            };

            modal.querySelector('#btn-save-profile').onclick = () => {
                const updated = {
                    name: modal.querySelector('#prof-name').value.trim() || 'Prof. Sérgio Araújo',
                    school: modal.querySelector('#prof-school').value.trim() || 'Escola Municipal de Ensino Fundamental',
                    subject: modal.querySelector('#prof-subject').value.trim() || 'História',
                    year: modal.querySelector('#prof-year').value.trim() || '2026',
                    unit: modal.querySelector('#prof-unit').value,
                    avatar: currentAvatarData
                };
                this.saveProfile(updated);
                this.closeModal();
            };
        });
    }

    exportDialog() {
        this.flushEdits();
        const active = this.active;
        const formats = active === 'writer'
            ? [
                ['docx', 'Documento Word (.docx)', 'Parágrafos, tabelas, imagens e estilos de texto formatados.'],
                ['html', 'Página Web Estilizada (.html)', 'Documento portável com visual clássico pronto para publicar.'],
                ['txt', 'Texto Puro (.txt)', 'Apenas o conteúdo textual, sem formatação gráfica.']
              ]
            : active === 'grid'
            ? [
                ['xlsx', 'Planilha Excel (.xlsx)', 'Abas completas, valores numéricos, formatação e fórmulas vivas.'],
                ['csv', 'Dados em Tabela (.csv)', 'Valores calculados da aba ativa separados por vírgula.']
              ]
            : [
                ['tv', '📺 Pacote para TV (Pen Drive)', 'Slides em Full HD estritamente numerados (001, 002...) para passar no controle da TV da escola.'],
                ['pptx', 'Apresentação PowerPoint (.pptx)', 'Slides com formas, imagens e caixas de texto editáveis.'],
                ['slides-html', 'Apresentador Web Portátil (.html)', 'Apresentação interativa que roda em qualquer computador ou navegador de Smart TV.'],
                ['svg', 'Slide Vetorial (.svg)', 'Vetor gráfico em alta definição do slide atual.']
              ];

        this.modal('Exportar Documentos Escolares', `
            <p>Exporte o módulo atual (<strong>${escapeHTML(APPS[active].label)}</strong>) ou envie diretamente para o WhatsApp do coordenador ou grupo.</p>
            <div class="export-grid">
                <button class="export-card whatsapp-highlight" data-action="whatsapp" style="grid-column: 1 / -1; border: 1.5px solid #25d366; background: rgba(37,211,102,0.06); text-align:left">
                    ${icon('whatsapp')}
                    <strong style="color:#128c7e">📱 Enviar Diretamente pelo WhatsApp (Sem perder o formato)</strong>
                    <small>Gera o arquivo oficial (.docx, .xlsx ou .pptx) e abre o WhatsApp para enviar ao coordenador com 1 clique.</small>
                </button>
                <button class="export-card drive-highlight" data-action="googleDrive" style="grid-column: 1 / -1; border: 1.5px solid #1a73e8; background: rgba(26,115,232,0.06); text-align:left">
                    ${icon('drive')}
                    <strong style="color:#1a73e8">☁️ Exportar para o Google Drive (Docs / Sheets / Slides)</strong>
                    <small>Gera o arquivo compatível com a suíte Google, baixa e abre a sua nuvem do Google Drive.</small>
                </button>
                <button class="export-card" data-export="project">
                    ${icon('save')}
                    <strong>Projeto Escola Office (.meridian)</strong>
                    <small>Arquivo mestre: reúne Escrita, Planilhas, Slides, notas e comentários em um único pacote.</small>
                </button>
                ${formats.map(([key, label, detail]) => `
                    <button class="export-card" data-export="${key}" ${key === 'tv' ? 'style="border:1.5px solid var(--brand);background:rgba(140,59,29,0.06)"' : ''}>
                        ${icon(key === 'xlsx' ? 'table' : key === 'pptx' ? 'slide' : key === 'tv' ? 'tv' : 'file')}
                        <strong>${label}</strong>
                        <small>${detail}</small>
                    </button>
                `).join('')}
            </div>
            <p style="font-size:11px;color:var(--muted);margin-top:16px">Os arquivos exportados abrem perfeitamente no Microsoft Office, Google Docs/Sheets e LibreOffice.</p>
        `, modal => modal.querySelectorAll('[data-export]').forEach(b => b.onclick = async () => {
            try {
                if (b.dataset.export === 'tv') {
                    this.closeModal();
                    await this.exportTV();
                    return;
                }
                this.exportFile(b.dataset.export);
                this.notify('Arquivo pronto e baixado com sucesso!');
            } catch (error) {
                console.error(error);
                this.notify(`Falha na exportação: ${error.message}`, true);
            }
        }));
    }

    async exportTV() {
        this.flushEdits();
        const deck = this.store.state.deck;
        if (!deck.slides?.length) {
            this.notify('A apresentação não possui slides para exportar.', true);
            return;
        }
        this.notify('⏳ Gerando pacote para TV... Convertendo slides em Full HD numerados (001, 002...).');
        try {
            const zipBytes = await exportTVPackage(deck, (cur, tot) => {
                this.notify(`⏳ Renderizando slide ${cur} de ${tot} para a TV...`);
            });
            const safeTitle = (deck.title || 'Apresentacao').replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Apresentacao';
            download(`${safeTitle}_Para_TV_PenDrive.zip`, zipBytes, 'application/zip');
            this.notify(`📺 Pacote para TV gerado com sucesso! Salve no Pen Drive e passe com o controle da TV.`);
        } catch (err) {
            console.error(err);
            this.notify(`Falha ao gerar pacote para TV: ${err.message}`, true);
        }
    }

    exportFile(format) {
        this.flushEdits();
        const state = this.store.state;
        const base = state.title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'Caderno de Estudos';

        switch (format) {
            case 'project':
                download(`${base}.meridian`, JSON.stringify(state, null, 2), 'application/json');
                break;
            case 'docx':
                download(`${state.writer.title}.docx`, exportDOCX(state.writer), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                break;
            case 'xlsx':
                download(`${state.workbook.title}.xlsx`, exportXLSX(state.workbook), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                break;
            case 'pptx':
                download(`${state.deck.title}.pptx`, exportPPTX(state.deck), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
                break;
            case 'html':
                download(`${state.writer.title}.html`, writerHTML(state.writer), 'text/html');
                break;
            case 'txt':
                download(`${state.writer.title}.txt`, state.writer.pages.map(p => new DOMParser().parseFromString(p.html, 'text/html').body.innerText).join('\n\n'), 'text/plain');
                break;
            case 'csv':
                download(`${state.workbook.title}.csv`, workbookCSV(state.workbook), 'text/csv');
                break;
            case 'svg':
                download(`Slide-${state.deck.activeSlide + 1}.svg`, slideSVG(state.deck.slides[state.deck.activeSlide]), 'image/svg+xml');
                break;
            case 'slides-html':
                download(`${state.deck.title}.html`, presentationHTML(state.deck), 'text/html');
                break;
        }
    }

    async openFile(file) {
        if (file.size > 25 * 1024 * 1024) {
            this.notify('Limite de tamanho de arquivo: 25 MB.', true);
            return;
        }
        this.flushEdits();
        try {
            const ext = file.name.split('.').at(-1).toLowerCase();
            const title = file.name.replace(/\.[^.]+$/, '');
            let state = clone(this.store.state);
            let active = this.active;

            if (['meridian', 'json'].includes(ext)) {
                state = validateProject(JSON.parse(await file.text()));
            } else if (ext === 'docx') {
                state.writer = await importDOCX(await file.arrayBuffer(), title);
                active = 'writer';
            } else if (ext === 'xlsx') {
                state.workbook = await importXLSX(await file.arrayBuffer(), title);
                active = 'grid';
            } else if (ext === 'pptx') {
                state.deck = await importPPTX(await file.arrayBuffer(), title);
                active = 'deck';
            } else if (['csv', 'tsv'].includes(ext)) {
                state.workbook = importCSV(await file.text(), title);
                active = 'grid';
            } else if (['html', 'htm', 'txt'].includes(ext)) {
                const text = await file.text();
                state.writer = {
                    title,
                    pages: [{ id: uid(), html: ext === 'txt' ? `<p>${escapeHTML(text).replace(/\n/g, '<br>')}</p>` : sanitizeHTML(text) }],
                    comments: []
                };
                active = 'writer';
            } else {
                throw new Error('Formato não suportado. Abra arquivos .meridian, DOCX, XLSX, PPTX, CSV, HTML ou TXT.');
            }

            state = validateProject(state);
            this.active = active;
            this.tab = 'Início';
            this.closeModal();
            this.store.replace(state);
            this.notify(`Arquivo "${file.name}" aberto com sucesso!`);
        } catch (error) {
            console.error(error);
            this.notify(`Não foi possível abrir o arquivo: ${error.message}`, true);
        }
    }

    chooseImage(callback) {
        const input = document.querySelector('#image-input');
        input.value = '';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 12 * 1024 * 1024) {
                this.notify('Limite para imagens: 12 MB.', true);
                return;
            }
            try {
                const bitmap = await createImageBitmap(file);
                const scale = Math.min(1, 2048 / bitmap.width, 2048 / bitmap.height);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
                callback(canvas.toDataURL('image/png'));
            } catch (error) {
                this.notify('Não foi possível processar esta imagem.', true);
            }
        };
        input.click();
    }

    help() {
        this.modal('Atalhos de Teclado e Produtividade', `
            <p>Utilize Ctrl no Linux/Windows ou ⌘ no macOS.</p>
            <div class="keyboard-grid">
                <span>Buscar ferramentas / Comandos</span><kbd>Ctrl + K</kbd>
                <span>Salvar no navegador</span><kbd>Ctrl + S</kbd>
                <span>Exportar arquivos</span><kbd>Ctrl + Shift + S</kbd>
                <span>Abrir arquivo</span><kbd>Ctrl + O</kbd>
                <span>Desfazer / Refazer</span><kbd>Ctrl + Z / Ctrl + Y</kbd>
                <span>Negrito, Itálico, Sublinhado</span><kbd>Ctrl + B / I / U</kbd>
                <span>Alternar Escrita / Planilha / Slides</span><kbd>Alt + 1 / 2 / 3</kbd>
                <span>Editar célula ou texto do slide</span><kbd>Enter ou duplo-clique</kbd>
                <span>Estender seleção na planilha</span><kbd>Shift + Setas</kbd>
                <span>Preencher para baixo / Duplicar</span><kbd>Ctrl + D</kbd>
                <span>Mover elemento milimetricamente</span><kbd>Setas (Shift para 10px)</kbd>
                <span>Iniciar apresentação em tela cheia</span><kbd>F5 / Esc</kbd>
            </div>
            <div class="onboarding">
                ${icon('lock')}
                <p>Seus arquivos permanecem exclusivamente no seu computador. Para transportar seus trabalhos para outro PC ou pendrive, use <strong>Exportar → Projeto Escola Office</strong>.</p>
            </div>
        `);
    }

    about() {
        this.modal('Sobre o Escola Office', `
            <div style="display:flex;align-items:center;gap:15px;margin:22px 0">
                <div class="brand-mark" style="width:50px;height:50px;font-size:32px">E</div>
                <div>
                    <strong style="font-size:22px;font-family:var(--font-cinzel);color:var(--brand)">Escola Office</strong>
                    <div style="font-size:12px;color:var(--muted);margin-top:4px">Escrever. Calcular. Apresentar. Conhecer.</div>
                </div>
            </div>
            <p style="font-size:13.5px;line-height:1.6;margin-bottom:14px;padding:12px 14px;background:var(--panel);border-left:3px solid var(--brand);border-radius:4px">
                <strong>Escola Office — Versão educacional customizada por Prof. Sérgio Araújo, baseada no projeto de código aberto Meridian Office (sob Licença MIT).</strong>
            </p>
            <p>Suíte educacional leve, moderna e local-first, desenvolvida para proporcionar autonomia a professores e estudantes. Criada com HTML, CSS e JavaScript puro, sem dependências externas, telemetria ou necessidade de acesso à internet.</p>
            <p>Inspirada na nobreza da tipografia clássica (Cormorant Garamond e Cinzel) e na agilidade do Vibe Coding.</p>
            <div class="onboarding">
                ${icon('lock')}
                <p>Privacidade total: nenhum dado é enviado para a nuvem. Todo o conteúdo é processado e salvo no IndexedDB local do seu navegador.</p>
            </div>
            <div class="modal-footer">
                <button class="btn primary" data-close>Voltar ao Espaço de Trabalho</button>
            </div>
        `);
    }

    diagnostics() {
        const r = this.editor?.renderer;
        this.modal('Informações Técnicas do Sistema', `
            <div class="keyboard-grid">
                <span>Módulo Ativo</span><strong>${APPS[this.active].label}</strong>
                <span>Motor de Renderização</span><strong>${escapeHTML(this.engineMode)}</strong>
                <span>API WebGPU Disponível</span><strong>${navigator.gpu ? 'Sim' : 'Não (Fallback Canvas 2D)'}</strong>
                <span>Contexto Seguro (HTTPS / Localhost)</span><strong>${isSecureContext ? 'Sim' : 'Não'}</strong>
                <span>Chamadas por Quadro GPU</span><strong>${r?.mode === 'WebGPU' ? '1 passe instanciado' : 'Modo nativo / Canvas'}</strong>
                <span>Histórico de Desfazer</span><strong>${this.store.past.length} / ${this.store.limit} níveis</strong>
                <span>Dependências Externas em Runtime</span><strong>0 (Zero)</strong>
                <span>Persistência Local</span><strong>${this.persistence.db ? 'IndexedDB Ativo' : 'Indisponível'}</strong>
            </div>
            <p style="font-size:10px;color:var(--muted);margin-top:16px">O módulo de Escrita utiliza o DOM nativo para edição tipográfica rica; Planilha e Apresentação utilizam renderização acelerada por GPU/Canvas.</p>
        `);
    }

    formulaHelp() {
        this.modal('Biblioteca de Fórmulas e Cálculos', `
            <p>Inicie a célula digitando <strong>=</strong>. As fórmulas são interpretadas nativamente com controle estrito de dependências.</p>
            <div class="keyboard-grid">
                <span>Média de Notas</span><code>=AVERAGE(B5:E5)</code>
                <span>Somatório</span><code>=SUM(B5:B12)</code>
                <span>Condicional Aprovado/Recuperação</span><code>=IF(F5&gt;=6,"Aprovado","Recuperação")</code>
                <span>Tratamento de Erros</span><code>=IFERROR(A1/B1, 0)</code>
                <span>Referência Entre Abas</span><code>='Diário de Notas'!F12</code>
                <span>Arredondamento</span><code>=ROUND(AVERAGE(B5:E5), 1)</code>
                <span>Maior e Menor Valor</span><code>=MAX(F5:F12) &nbsp;/&nbsp; =MIN(F5:F12)</code>
                <span>Contagem de Alunos</span><code>=COUNTA(A5:A20)</code>
            </div>
            <p style="margin-top:16px"><strong>Funções Suportadas:</strong><br>
            SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, IFERROR, AND, OR, NOT, ROUND, ABS, SQRT, POWER, LEN, LEFT, RIGHT, UPPER, LOWER, CONCAT, CONCATENATE.</p>
        `);
    }
}

new EscolaOfficeApp().start().catch(error => {
    console.error(error);
    document.querySelector('#app').innerHTML = `
        <section class="error-screen">
            <h1 style="color:#8c3b1d;font-family:'Cinzel',serif">O Escola Office não pôde iniciar.</h1>
            <p>${escapeHTML(error.message)}</p>
            <p>Abra o aplicativo em um navegador moderno com suporte a JavaScript e IndexedDB.</p>
            <button class="btn primary" onclick="location.reload()">Tentar novamente</button>
        </section>`;
});

return {};
})();
