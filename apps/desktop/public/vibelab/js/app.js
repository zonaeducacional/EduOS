import { FileSystemClient } from './fs-client.js';
import { createFileCard, renderBreadcrumb } from './ui-components.js';
// app.js - Main logic and state management

let state = {
  currentPath: '',
  homeDir: '',
  selectedFiles: new Set()
};

// DOM Elements
const fileGrid = document.getElementById('file-grid');
const breadcrumb = document.getElementById('breadcrumb');
const sidebarLinks = document.querySelectorAll('.nav-links li');
const radialMenu = document.getElementById('radial-menu');
const status = document.getElementById('file-status');
const btnBack = document.getElementById('btn-back');
const searchInput = document.getElementById('search-input');

async function runAction(action) {
  try {
    status.textContent = '';
    await action();
  } catch (error) {
    status.textContent = String(error);
  }
}

// History
let historyStack = [];

btnBack.addEventListener('click', () => {
  if (historyStack.length > 1) {
    historyStack.pop(); // remove current
    const prev = historyStack.pop();
    loadDirectory(prev);
  }
});

// Window Controls
document.getElementById('btn-close').addEventListener('click', () => FileSystemClient.invoke('vibelab_window', { action: 'close' }));
document.getElementById('btn-minimize').addEventListener('click', () => FileSystemClient.invoke('vibelab_window', { action: 'minimize' }));
document.getElementById('btn-maximize').addEventListener('click', () => FileSystemClient.invoke('vibelab_window', { action: 'toggle_maximize' }));

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  if (document.body.classList.contains('dark-mode')) {
    themeToggle.textContent = '☀️';
  } else {
    themeToggle.textContent = '🌙';
  }
});

// Zoom Controls
const zoomSlider = document.getElementById('zoom-slider');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');

function setZoom(val) {
  const value = Math.max(0.6, Math.min(2.0, parseFloat(val)));
  zoomSlider.value = value;
  document.documentElement.style.setProperty('--zoom-level', value);
}

zoomSlider.addEventListener('input', (e) => setZoom(e.target.value));
btnZoomIn.addEventListener('click', () => setZoom(parseFloat(zoomSlider.value) + 0.1));
btnZoomOut.addEventListener('click', () => setZoom(parseFloat(zoomSlider.value) - 0.1));

let clipboardPath = null;

async function init() {
  try {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.toggle('dark-mode', isDark);
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    searchInput.placeholder = 'Pesquisar nesta pasta';
    searchInput.addEventListener('input', () => {
      for (const card of fileGrid.querySelectorAll('.file-card')) {
        card.hidden = !card.querySelector('.file-name').textContent.toLocaleLowerCase('pt-BR')
          .includes(searchInput.value.toLocaleLowerCase('pt-BR'));
      }
    });

    // 4. View Mode Toggles
    const btnGrid = document.getElementById('btn-view-grid');
    const btnCompact = document.getElementById('btn-view-compact');
    
    btnGrid.addEventListener('click', () => {
      fileGrid.classList.remove('compact-view');
      btnGrid.style.opacity = '1';
      btnCompact.style.opacity = '0.5';
    });
    
    btnCompact.addEventListener('click', () => {
      fileGrid.classList.add('compact-view');
      btnGrid.style.opacity = '0.5';
      btnCompact.style.opacity = '1';
    });
    btnCompact.style.opacity = '0.5'; // Default state

    // 5. Load Directory
    state.homeDir = '~';
    await loadDirectory(state.homeDir);
    setupEventListeners();
  } catch (err) {
    status.textContent = String(err);
  }
}

async function loadDirectory(targetPath) {
  try {
    const files = await FileSystemClient.readDirectory(targetPath);
    state.currentPath = targetPath;
    state.selectedFiles.clear();
    searchInput.value = '';
    if (historyStack.at(-1) !== targetPath) historyStack.push(targetPath);
    document.getElementById('btn-restore').hidden = targetPath !== '~/.lixeira';
    
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        renderFiles(files);
        updateUI();
      });
    } else {
      renderFiles(files);
      updateUI();
    }
  } catch (err) {
    status.textContent = String(err);
  }
}

function renderFiles(files) {
  if (files.length === 0) {
    fileGrid.innerHTML = `<div style="color: var(--text-secondary); width: 100%; text-align: center; margin-top: 40px;">Pasta vazia</div>`;
    return;
  }
  
  fileGrid.innerHTML = files.map(f => createFileCard(f)).join('');
  
  // Attach event listeners to new cards
  document.querySelectorAll('.file-card').forEach(card => {
    // Selection
    card.addEventListener('click', (e) => {
      const path = card.dataset.path;
      if (!e.ctrlKey && !e.shiftKey) {
        state.selectedFiles.clear();
        document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
      }
      state.selectedFiles.add(path);
      card.classList.add('selected');
    });

    // Double click to enter folder or open file
    card.addEventListener('dblclick', async () => {
      if (card.dataset.isdir === 'true') {
        loadDirectory(card.dataset.path);
      } else {
        await runAction(() => FileSystemClient.transfer(card.dataset.path, { type: 'open' }));
      }
    });

    // Spotlight Hover Effect (Aceternity Style)
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
    });
  });
}

function updateUI() {
  breadcrumb.innerHTML = renderBreadcrumb(state.currentPath, state.homeDir);
  
  // Bind breadcrumb clicks
  breadcrumb.querySelectorAll('span[data-path]').forEach(el => {
    el.addEventListener('click', () => loadDirectory(el.dataset.path));
  });

  // Hide radial menu if open
  radialMenu.classList.remove('active');
}

function setupEventListeners() {
  // Sidebar navigation
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (link.dataset.path === '~/.lixeira') {
        runAction(async () => {
          await FileSystemClient.transfer('~', { type: 'prepare_trash' });
          await loadDirectory(link.dataset.path);
        });
      } else {
        runAction(() => loadDirectory(link.dataset.path));
      }
    });
  });

  // Global Context Menu
  let targetPathForMenu = null;
  
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const clickedCard = e.target.closest('.file-card');
    
    if (clickedCard) {
      if (!state.selectedFiles.has(clickedCard.dataset.path)) {
         state.selectedFiles.clear();
         document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
         state.selectedFiles.add(clickedCard.dataset.path);
         clickedCard.classList.add('selected');
      }
      targetPathForMenu = clickedCard.dataset.path;
    } else {
      // Right click on empty space
      targetPathForMenu = state.currentPath; // Prepare for paste
    }

    // Position and show radial menu
    radialMenu.style.left = `${e.clientX}px`;
    radialMenu.style.top = `${e.clientY}px`;
    radialMenu.classList.add('active');
  });

  // Radial Menu Actions
  document.querySelector('.radial-btn.copy').addEventListener('click', () => {
    if (targetPathForMenu && targetPathForMenu !== state.currentPath) {
      clipboardPath = targetPathForMenu;
      status.textContent = 'Item copiado.';
    }
  });

  document.querySelector('.radial-btn.paste').addEventListener('click', () => runAction(async () => {
    if (!clipboardPath) return;
    await FileSystemClient.transfer(clipboardPath, { type: 'copy', destination: FileSystemClient.parts(state.currentPath) });
    await loadDirectory(state.currentPath);
  }));
  document.querySelector('.radial-btn.delete').addEventListener('click', () => runAction(async () => {
    if (!targetPathForMenu || targetPathForMenu === state.currentPath) return;
    await FileSystemClient.transfer(targetPathForMenu, { type: 'trash' });
    await loadDirectory(state.currentPath);
  }));
  document.querySelector('.radial-btn.openwith').addEventListener('click', () => runAction(async () => {
    if (!targetPathForMenu || targetPathForMenu === state.currentPath) return;
    await FileSystemClient.exportFile(targetPathForMenu);
  }));

  const form = document.getElementById('name-form');
  const nameInput = document.getElementById('item-name');
  let original;
  function editName(name) {
    original = name;
    nameInput.value = name ?? '';
    form.hidden = false;
    nameInput.focus();
  }
  document.getElementById('btn-new').addEventListener('click', () => editName());
  document.getElementById('btn-rename').addEventListener('click', () => {
    if (state.selectedFiles.size !== 1) {
      status.textContent = 'Selecione um item para renomear.';
      return;
    }
    editName([...state.selectedFiles][0].split('/').at(-1));
  });
  document.getElementById('btn-cancel').addEventListener('click', () => { form.hidden = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    runAction(async () => {
      const name = nameInput.value;
      await FileSystemClient.manage(state.currentPath, original === undefined
        ? { type: 'create', name } : { type: 'rename', original, name });
      form.hidden = true;
      await loadDirectory(state.currentPath);
    });
  });
  document.getElementById('btn-import').addEventListener('click', () => runAction(async () => {
    await FileSystemClient.manage(state.currentPath, { type: 'import' });
    await loadDirectory(state.currentPath);
  }));
  document.getElementById('btn-restore').addEventListener('click', () => runAction(async () => {
    if (state.selectedFiles.size !== 1) throw new Error('Selecione um item para restaurar.');
    await FileSystemClient.transfer([...state.selectedFiles][0], { type: 'restore' });
    await loadDirectory(state.currentPath);
  }));

  // Hide radial menu on left click anywhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.radial-menu')) {
      radialMenu.classList.remove('active');
    }
    
    // Click on empty grid clears selection
    if (e.target === fileGrid) {
      state.selectedFiles.clear();
      document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
    }
  });
}

// Start app
init();
