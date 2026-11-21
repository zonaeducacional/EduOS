function getIconForFile(name, isDirectory) {
  if (isDirectory) {
    return `<div class="css-3d-folder">
      <div class="folder-back"></div>
      <div class="folder-paper paper-1"></div>
      <div class="folder-paper paper-2"></div>
      <div class="folder-front"></div>
    </div>`;
  }
  
  const ext = name.split('.').pop().toLowerCase();
  
  // Basic extension mapping to Lucide Icons inline SVGs
  let svgContent = `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>`; // file
  
  switch (ext) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      svgContent = `<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`; // image
      break;
    case 'js':
    case 'ts':
    case 'json':
    case 'html':
    case 'css':
      svgContent = `<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>`; // code
      break;
    case 'txt':
    case 'md':
    case 'doc':
    case 'pdf':
      svgContent = `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>`; // file-text
      break;
    case 'mp3':
    case 'wav':
      svgContent = `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`; // music
      break;
    case 'mp4':
    case 'mkv':
    case 'avi':
      svgContent = `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>`; // film
      break;
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
      svgContent = `<line x1="16.5" x2="7.5" y1="9.4" y2="4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" x2="12" y1="22.08" y2="12"/>`; // package
      break;
  }
  
  return `<div class="file-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg></div>`;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function createFileCard(file) {
  // Aceternity spotlight effect will be handled by CSS and JS mousemove listener
  return `
    <div class="file-card" data-path="${escapeHtml(file.path)}" data-isdir="${file.isDirectory}">
      ${file.sizeLabel ? `<span class="size-badge">${file.sizeLabel}</span>` : ''}
      ${getIconForFile(file.name, file.isDirectory)}
      <span class="file-name">${escapeHtml(file.name)}</span>
    </div>
  `;
}

export function renderBreadcrumb(path, homeDir) {
  if (!path) return '';
  
  let displayPath = path;
  if (homeDir && path.startsWith(homeDir)) {
    displayPath = path.replace(homeDir, 'Home');
  }

  const parts = displayPath.split('/').filter(p => p);
  
  let html = '';
  
  if (displayPath.startsWith('Home')) {
    html += `<span data-path="${homeDir}">🏠 Meus arquivos</span>`;
  } else if (displayPath.startsWith('/')) {
    html += `<span data-path="/">/</span>`;
  }

  let cumulativePath = displayPath.startsWith('Home') ? homeDir : '/';

  parts.slice(displayPath.startsWith('Home') ? 1 : 0).forEach(part => {
    cumulativePath += (cumulativePath.endsWith('/') ? '' : '/') + part;
    html += ` <span style="color: var(--text-secondary); margin: 0 4px;">/</span> <span data-path="${escapeHtml(cumulativePath)}">${escapeHtml(part === '.lixeira' ? 'Lixeira' : part)}</span>`;
  });

  return html;
}
