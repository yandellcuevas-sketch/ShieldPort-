/* ══════════════════════════════════════════════════════════════
   SHIELDPORT — USB FILE EXPLORER
   Conecta al Desktop Agent vía WebSocket.
   Mensajes esperados del agente:
     → { type: 'fs_list',   drive: 'E:', path: '/', entries: [...] }
     → { type: 'fs_read',   path: '...', content: '...' }
     → { type: 'fs_write',  path: '...', ok: true }
     → { type: 'fs_rename', oldPath: '...', newPath: '...', ok: true }
     → { type: 'fs_delete', path: '...', ok: true }
   ══════════════════════════════════════════════════════════════ */

;(function() {

/* ── MOCK DATA (se usa cuando el agente no está conectado) ── */
const MOCK_FS = {
  '/': [
    { name: 'Documentos',   type: 'dir',  modified: '2025-05-10', size: null },
    { name: 'Fotos',        type: 'dir',  modified: '2025-05-18', size: null },
    { name: 'Backups',      type: 'dir',  modified: '2025-04-30', size: null },
    { name: 'README.txt',   type: 'file', modified: '2025-05-20', size: 1240,  ext: 'txt' },
    { name: 'config.json',  type: 'file', modified: '2025-05-15', size: 3800,  ext: 'json' },
    { name: 'notas.md',     type: 'file', modified: '2025-05-22', size: 920,   ext: 'md' },
    { name: 'foto_01.jpg',  type: 'file', modified: '2025-05-01', size: 2400000, ext: 'jpg' },
    { name: 'reporte.pdf',  type: 'file', modified: '2025-05-19', size: 540000, ext: 'pdf' },
  ],
  '/Documentos': [
    { name: 'proyecto.txt', type: 'file', modified: '2025-05-11', size: 4200,  ext: 'txt' },
    { name: 'ideas.md',     type: 'file', modified: '2025-05-14', size: 880,   ext: 'md' },
    { name: 'datos.csv',    type: 'file', modified: '2025-05-09', size: 12000, ext: 'csv' },
  ],
  '/Fotos': [
    { name: 'vacaciones',   type: 'dir',  modified: '2025-04-15', size: null },
    { name: 'perfil.png',   type: 'file', modified: '2025-05-18', size: 890000, ext: 'png' },
  ],
  '/Fotos/vacaciones': [
    { name: 'playa.jpg',    type: 'file', modified: '2025-04-15', size: 3100000, ext: 'jpg' },
    { name: 'montaña.jpg',  type: 'file', modified: '2025-04-16', size: 2800000, ext: 'jpg' },
  ],
  '/Backups': [
    { name: 'backup_mayo.zip', type: 'file', modified: '2025-05-01', size: 45000000, ext: 'zip' },
  ],
};

const MOCK_CONTENT = {
  'README.txt':    'ShieldPort USB Explorer\n========================\nEste dispositivo está gestionado con ShieldPort v2.0.\n\nNo elimines archivos del sistema.\nContacto: admin@shieldport.io',
  'config.json':   '{\n  "device": "ShieldPort-001",\n  "version": "2.0.0",\n  "protection": true,\n  "last_scan": "2025-05-20T14:32:00Z",\n  "owner": "usuario@ejemplo.com"\n}',
  'notas.md':      '# Notas del Proyecto\n\n## Pendientes\n- [ ] Revisar backups\n- [ ] Actualizar firmware\n- [x] Configurar cifrado\n\n## Notas\nRecordar hacer backup semanal cada lunes.',
  'proyecto.txt':  'Proyecto Alpha\n==============\nFecha inicio: 2025-04-01\nEstado: En progreso\n\nObjetivos:\n1. Migrar datos\n2. Validar integridad\n3. Documentar proceso',
  'ideas.md':      '# Ideas\n\n- Automatizar escaneo al conectar\n- Notificaciones push\n- Dashboard mobile',
  'datos.csv':     'id,nombre,valor,fecha\n1,Item A,100.5,2025-05-01\n2,Item B,200.0,2025-05-02\n3,Item C,150.75,2025-05-03',
};

/* ── ICON MAP ── */
const FILE_ICONS = {
  dir:  { svg: iconFolder(), color: '#f5a623' },
  txt:  { svg: iconDoc(),    color: '#8a909e' },
  md:   { svg: iconDoc(),    color: '#4f8eff' },
  json: { svg: iconCode(),   color: '#34d97b' },
  csv:  { svg: iconDoc(),    color: '#34d97b' },
  pdf:  { svg: iconDoc(),    color: '#f05252' },
  jpg:  { svg: iconImage(),  color: '#9b7ff4' },
  jpeg: { svg: iconImage(),  color: '#9b7ff4' },
  png:  { svg: iconImage(),  color: '#9b7ff4' },
  zip:  { svg: iconZip(),    color: '#f5a623' },
  default: { svg: iconDoc(), color: '#4a5160' },
};

const EDITABLE_EXTS = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'log'];

/* ── STATE ── */
let state = {
  drive: null,       // e.g. 'E:'
  currentPath: '/',
  pathStack: ['/'],
  entries: [],
  selectedFile: null,
  editorContent: '',
  editorDirty: false,
  loading: false,
  agentConnected: false,
  viewMode: 'list',  // 'list' | 'grid'
  sortBy: 'name',
  sortDir: 'asc',
  filter: '',
};

/* ── RENDER ── */
function mount(drive) {
  state.drive = drive;
  state.currentPath = '/';
  state.pathStack = ['/'];

  const container = document.getElementById('usb-explorer-root');
  if (!container) return;

  container.innerHTML = buildShell();
  attachEvents();
  loadDirectory('/');
}

function buildShell() {
  return `
  <div class="explorer-layout" id="explorer-layout">
    <!-- File pane -->
    <div class="explorer-pane" id="explorer-file-pane">
      <!-- Toolbar -->
      <div class="explorer-toolbar">
        <div class="explorer-nav">
          <button class="exp-btn" id="exp-btn-back" title="Atrás" disabled>
            \${iconChevron('left')}
          </button>
          <div class="explorer-breadcrumb" id="explorer-breadcrumb"></div>
        </div>
        <div class="explorer-toolbar-right">
          <div class="exp-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" class="exp-search" id="exp-search" placeholder="Filtrar archivos…" />
          </div>
          <button class="exp-btn exp-btn-toggle \${state.viewMode === 'grid' ? 'active' : ''}" id="exp-btn-viewmode" title="Cambiar vista">
            \${state.viewMode === 'grid' ? iconList() : iconGrid()}
          </button>
          <button class="exp-btn" id="exp-btn-refresh" title="Actualizar">
            \${iconRefresh()}
          </button>
        </div>
      </div>

      <!-- Sort bar -->
      <div class="explorer-sortbar">
        <button class="sort-btn \${state.sortBy==='name'?'active':''}" data-sort="name">
          Nombre \${state.sortBy==='name' ? (state.sortDir==='asc'?'↑':'↓') : ''}
        </button>
        <button class="sort-btn \${state.sortBy==='modified'?'active':''}" data-sort="modified">
          Modificado \${state.sortBy==='modified' ? (state.sortDir==='asc'?'↑':'↓') : ''}
        </button>
        <button class="sort-btn \${state.sortBy==='size'?'active':''}" data-sort="size">
          Tamaño \${state.sortBy==='size' ? (state.sortDir==='asc'?'↑':'↓') : ''}
        </button>
        <span class="explorer-entry-count" id="explorer-entry-count"></span>
      </div>

      <!-- File list -->
      <div class="explorer-filelist" id="explorer-filelist">
        <div class="exp-loading" id="exp-loading" style="display:none;">
          <span class="spin">\${iconRefresh()}</span>
          <span>Cargando…</span>
        </div>
        <div id="explorer-entries"></div>
      </div>

      <!-- Status bar -->
      <div class="explorer-statusbar" id="explorer-statusbar">
        <span id="exp-status-text">\${state.drive} • /</span>
        <span id="exp-mock-badge" class="exp-mock-badge">DEMO</span>
      </div>
    </div>

    <!-- Editor pane (hidden until file selected) -->
    <div class="explorer-editor-pane" id="explorer-editor-pane" style="display:none;">
      <div class="editor-header">
        <div class="editor-file-info">
          <span class="editor-filename" id="editor-filename"></span>
          <span class="editor-dirty-dot" id="editor-dirty-dot" style="display:none;" title="Sin guardar">●</span>
        </div>
        <div class="editor-actions">
          <button class="exp-btn" id="editor-btn-save" title="Guardar (Ctrl+S)" disabled>
            \${iconSave()} <span style="font-size:12px;margin-left:2px;">Guardar</span>
          </button>
          <button class="exp-btn" id="editor-btn-close" title="Cerrar">
            \${iconX()}
          </button>
        </div>
      </div>
      <textarea class="editor-textarea" id="editor-textarea" spellcheck="false"></textarea>
      <div class="editor-footer">
        <span id="editor-footer-info"></span>
      </div>
    </div>
  </div>`;
}

function renderEntries() {
  const listEl = document.getElementById('explorer-entries');
  const countEl = document.getElementById('explorer-entry-count');
  if (!listEl) return;

  let entries = [...state.entries];

  if (state.filter) {
    const q = state.filter.toLowerCase();
    entries = entries.filter(e => e.name.toLowerCase().includes(q));
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let av, bv;
    if (state.sortBy === 'name')     { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    else if (state.sortBy === 'size') { av = a.size || 0; bv = b.size || 0; }
    else { av = a.modified || ''; bv = b.modified || ''; }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return state.sortDir === 'asc' ? cmp : -cmp;
  });

  countEl.textContent = `\${entries.length} elemento\${entries.length !== 1 ? 's' : ''}`;

  if (!entries.length) {
    listEl.innerHTML = `<div class="exp-empty"><p>Sin resultados</p></div>`;
    return;
  }

  if (state.viewMode === 'grid') {
    listEl.innerHTML = `<div class="exp-grid">\${entries.map(e => entryGridCard(e)).join('')}</div>`;
  } else {
    listEl.innerHTML = entries.map(e => entryRow(e)).join('');
  }

  listEl.querySelectorAll('[data-entry]').forEach(el => {
    el.addEventListener('click', () => handleEntryClick(el.dataset.entry, el.dataset.type));
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev, el.dataset.entry, el.dataset.type);
    });
  });
}

function entryRow(entry) {
  const icon = FILE_ICONS[entry.type === 'dir' ? 'dir' : (entry.ext || 'default')];
  const size = entry.type === 'dir' ? '—' : formatSize(entry.size);
  const isSelected = state.selectedFile === fullPath(entry.name);
  return `
  <div class="exp-entry-row \${isSelected ? 'selected' : ''}" data-entry="\${entry.name}" data-type="\${entry.type}" title="\${entry.name}">
    <span class="exp-entry-icon" style="color:\${icon.color}">\${icon.svg}</span>
    <span class="exp-entry-name">\${entry.name}</span>
    <span class="exp-entry-size">\${size}</span>
    <span class="exp-entry-date">\${entry.modified || ''}</span>
  </div>`;
}

function entryGridCard(entry) {
  const icon = FILE_ICONS[entry.type === 'dir' ? 'dir' : (entry.ext || 'default')];
  return `
  <div class="exp-grid-card" data-entry="\${entry.name}" data-type="\${entry.type}" title="\${entry.name}">
    <span class="exp-grid-icon" style="color:\${icon.color}">\${icon.svg}</span>
    <span class="exp-grid-name">\${entry.name}</span>
  </div>`;
}

function renderBreadcrumb() {
  const el = document.getElementById('explorer-breadcrumb');
  if (!el) return;
  const parts = state.currentPath === '/' ? [''] : state.currentPath.split('/').filter(Boolean);
  const crumbs = [{ label: state.drive, path: '/' }];
  let acc = '';
  parts.forEach(p => { acc += '/' + p; crumbs.push({ label: p, path: acc }); });

  el.innerHTML = crumbs.map((c, i) =>
    i < crumbs.length - 1
      ? `<button class="bc-part" data-path="\${c.path}">\${c.label}</button><span class="bc-sep">/</span>`
      : `<span class="bc-current">\${c.label}</span>`
  ).join('');

  el.querySelectorAll('[data-path]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.path));
  });
}

/* ── NAVIGATION ── */
function navigateTo(path) {
  if (path !== state.currentPath) {
    state.pathStack.push(path);
  }
  state.currentPath = path;
  state.filter = '';
  const searchEl = document.getElementById('exp-search');
  if (searchEl) searchEl.value = '';
  loadDirectory(path);
}

function loadDirectory(path) {
  setLoading(true);
  updateStatusBar();
  renderBreadcrumb();

  const backBtn = document.getElementById('exp-btn-back');
  if (backBtn) backBtn.disabled = state.pathStack.length <= 1;

  if (state.agentConnected) {
    ShieldPort.agent.send({ type: 'fs_list', drive: state.drive, path });
  } else {
    setTimeout(() => {
      state.entries = MOCK_FS[path] || [];
      setLoading(false);
      renderEntries();
      updateStatusBar();
    }, 180);
  }
}

function handleEntryClick(name, type) {
  if (type === 'dir') {
    const newPath = state.currentPath === '/' ? `/\${name}` : `\${state.currentPath}/\${name}`;
    navigateTo(newPath);
  } else {
    openFile(name);
  }
}

function openFile(name) {
  const path = fullPath(name);
  const ext = name.split('.').pop().toLowerCase();

  if (!EDITABLE_EXTS.includes(ext)) {
    if (window.ShieldPort && ShieldPort.toast) {
      ShieldPort.toast('info', 'Archivo no editable', `Los archivos .\${ext} no se pueden editar en el explorador.`);
    }
    return;
  }

  state.selectedFile = path;
  renderEntries();

  const editorPane = document.getElementById('explorer-editor-pane');
  const filenameEl = document.getElementById('editor-filename');
  const textarea   = document.getElementById('editor-textarea');
  const footerEl   = document.getElementById('editor-footer-info');

  editorPane.style.display = 'flex';
  filenameEl.textContent = name;
  textarea.value = 'Cargando…';
  textarea.disabled = true;

  document.getElementById('editor-btn-save').disabled = true;
  document.getElementById('editor-dirty-dot').style.display = 'none';
  state.editorDirty = false;

  if (state.agentConnected) {
    ShieldPort.agent.send({ type: 'fs_read', path });
  } else {
    setTimeout(() => {
      const content = MOCK_CONTENT[name] || `[Contenido de \${name}]`;
      state.editorContent = content;
      textarea.value = content;
      textarea.disabled = false;
      footerEl.textContent = `\${content.split('\\n').length} líneas · \${ext.toUpperCase()}`;
    }, 120);
  }
}

/* ── EDITOR ── */
function markDirty() {
  if (!state.editorDirty) {
    state.editorDirty = true;
    document.getElementById('editor-dirty-dot').style.display = 'inline';
    document.getElementById('editor-btn-save').disabled = false;
  }
}

function saveFile() {
  const textarea = document.getElementById('editor-textarea');
  const content  = textarea.value;
  const path     = state.selectedFile;

  if (state.agentConnected) {
    ShieldPort.agent.send({ type: 'fs_write', path, content });
  } else {
    const name = path.split('/').pop();
    MOCK_CONTENT[name] = content;
    state.editorDirty = false;
    document.getElementById('editor-dirty-dot').style.display = 'none';
    document.getElementById('editor-btn-save').disabled = true;
    if (window.ShieldPort && ShieldPort.toast) {
      ShieldPort.toast('success', 'Guardado', `\${name} guardado correctamente.`);
    }
  }
}

/* ── CONTEXT MENU ── */
function showContextMenu(ev, name, type) {
  removeContextMenu();
  const path = fullPath(name);
  const ext  = name.split('.').pop().toLowerCase();
  const canEdit = type === 'file' && EDITABLE_EXTS.includes(ext);

  const menu = document.createElement('div');
  menu.className = 'exp-context-menu';
  menu.id = 'exp-context-menu';
  menu.style.cssText = `left:\${Math.min(ev.clientX, window.innerWidth - 180)}px;top:\${Math.min(ev.clientY, window.innerHeight - 160)}px`;

  menu.innerHTML = `
    \${type === 'dir' ? `<button class="ctx-item" data-action="open">
      \${iconFolder()} Abrir carpeta
    </button>` : ''}
    \${canEdit ? `<button class="ctx-item" data-action="edit">
      \${iconEdit()} Editar
    </button>` : ''}
    <button class="ctx-item" data-action="rename">
      \${iconEdit()} Renombrar
    </button>
    <div class="ctx-separator"></div>
    <button class="ctx-item ctx-item-danger" data-action="delete">
      \${iconTrash()} Eliminar
    </button>`;

  document.body.appendChild(menu);

  menu.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      removeContextMenu();
      const action = btn.dataset.action;
      if (action === 'open')   navigateTo(state.currentPath === '/' ? `/\${name}` : `\${state.currentPath}/\${name}`);
      if (action === 'edit')   openFile(name);
      if (action === 'rename') startRename(name, type);
      if (action === 'delete') confirmDelete(name, path);
    });
  });

  setTimeout(() => document.addEventListener('click', removeContextMenu, { once: true }), 0);
}

function removeContextMenu() {
  const m = document.getElementById('exp-context-menu');
  if (m) m.remove();
}

/* ── RENAME ── */
function startRename(name, type) {
  const rows = document.querySelectorAll(`[data-entry="\${name}"]`);
  if (!rows.length) return;
  const row = rows[0];
  const nameEl = row.querySelector('.exp-entry-name, .exp-grid-name');
  if (!nameEl) return;

  const input = document.createElement('input');
  input.className = 'exp-rename-input';
  input.value = name;
  input.style.cssText = 'background:var(--bg-4);border:1px solid var(--accent-border);color:var(--text-1);border-radius:4px;padding:1px 6px;font-size:12.5px;width:160px;outline:none;font-family:inherit;';
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim();
    if (newName && newName !== name) doRename(name, newName, type);
    else loadDirectory(state.currentPath);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = name; input.blur(); }
  });
}

function doRename(oldName, newName, type) {
  const oldPath = fullPath(oldName);
  const newPath = fullPath(newName);

  if (state.agentConnected) {
    ShieldPort.agent.send({ type: 'fs_rename', oldPath, newPath });
  } else {
    const dir = MOCK_FS[state.currentPath];
    if (dir) {
      const entry = dir.find(e => e.name === oldName);
      if (entry) { entry.name = newName; if (entry.ext) entry.ext = newName.split('.').pop().toLowerCase(); }
    }
    if (window.ShieldPort && ShieldPort.toast) {
      ShieldPort.toast('success', 'Renombrado', `"\${oldName}" → "\${newName}"`);
    }
    loadDirectory(state.currentPath);
  }
}

/* ── DELETE ── */
function confirmDelete(name, path) {
  if (!confirm(`¿Eliminar "\${name}"? Esta acción no se puede deshacer.`)) return;

  if (state.agentConnected) {
    ShieldPort.agent.send({ type: 'fs_delete', path });
  } else {
    const dir = MOCK_FS[state.currentPath];
    if (dir) {
      const idx = dir.findIndex(e => e.name === name);
      if (idx !== -1) dir.splice(idx, 1);
    }
    if (state.selectedFile === path) closeEditor();
    if (window.ShieldPort && ShieldPort.toast) {
      ShieldPort.toast('success', 'Eliminado', `"\${name}" eliminado.`);
    }
    loadDirectory(state.currentPath);
  }
}

/* ── EDITOR CLOSE ── */
function closeEditor() {
  if (state.editorDirty && !confirm('Hay cambios sin guardar. ¿Salir de todas formas?')) return;
  state.selectedFile = null;
  state.editorDirty = false;
  document.getElementById('explorer-editor-pane').style.display = 'none';
  renderEntries();
}

/* ── AGENT RESPONSE HANDLER ── */
function handleAgentMessage(msg) {
  if (msg.type === 'fs_list') {
    state.entries = msg.entries || [];
    setLoading(false);
    renderEntries();
    updateStatusBar();
  }
  if (msg.type === 'fs_read') {
    const textarea = document.getElementById('editor-textarea');
    const footerEl = document.getElementById('editor-footer-info');
    if (textarea) {
      state.editorContent = msg.content || '';
      textarea.value = msg.content || '';
      textarea.disabled = false;
      const lines = (msg.content || '').split('\\n').length;
      const ext = (state.selectedFile || '').split('.').pop().toUpperCase();
      if (footerEl) footerEl.textContent = `\${lines} líneas · \${ext}`;
    }
  }
  if (msg.type === 'fs_write' && msg.ok) {
    state.editorDirty = false;
    const dot = document.getElementById('editor-dirty-dot');
    const saveBtn = document.getElementById('editor-btn-save');
    if (dot) dot.style.display = 'none';
    if (saveBtn) saveBtn.disabled = true;
    if (window.ShieldPort && ShieldPort.toast) {
      ShieldPort.toast('success', 'Guardado', 'Archivo guardado correctamente.');
    }
  }
  if (msg.type === 'fs_rename' && msg.ok) {
    loadDirectory(state.currentPath);
  }
  if (msg.type === 'fs_delete' && msg.ok) {
    loadDirectory(state.currentPath);
  }
}

/* ── EVENTS ── */
function attachEvents() {
  document.getElementById('exp-btn-back').addEventListener('click', () => {
    if (state.pathStack.length > 1) {
      state.pathStack.pop();
      const prev = state.pathStack[state.pathStack.length - 1];
      state.currentPath = prev;
      loadDirectory(prev);
    }
  });

  document.getElementById('exp-btn-refresh').addEventListener('click', () => loadDirectory(state.currentPath));

  document.getElementById('exp-btn-viewmode').addEventListener('click', () => {
    state.viewMode = state.viewMode === 'list' ? 'grid' : 'list';
    const btn = document.getElementById('exp-btn-viewmode');
    btn.innerHTML = state.viewMode === 'grid' ? iconList() : iconGrid();
    btn.classList.toggle('active', state.viewMode === 'grid');
    renderEntries();
  });

  document.getElementById('exp-search').addEventListener('input', e => {
    state.filter = e.target.value;
    renderEntries();
  });

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (state.sortBy === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortBy = key; state.sortDir = 'asc'; }
      document.querySelectorAll('.sort-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.sort === state.sortBy);
        b.textContent = b.dataset.sort + (b.dataset.sort === state.sortBy ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '');
      });
      renderEntries();
    });
  });

  const textarea = document.getElementById('editor-textarea');
  textarea.addEventListener('input', markDirty);
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end   = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      markDirty();
    }
  });

  document.getElementById('editor-btn-save').addEventListener('click', saveFile);
  document.getElementById('editor-btn-close').addEventListener('click', closeEditor);
}

/* ── HELPERS ── */
function fullPath(name) {
  return state.currentPath === '/' ? `/\${name}` : `\${state.currentPath}/\${name}`;
}

function setLoading(v) {
  state.loading = v;
  const el = document.getElementById('exp-loading');
  if (el) el.style.display = v ? 'flex' : 'none';
  const entries = document.getElementById('explorer-entries');
  if (entries) entries.style.opacity = v ? '0.3' : '1';
}

function updateStatusBar() {
  const el = document.getElementById('exp-status-text');
  if (el) el.textContent = `\${state.drive} • \${state.currentPath}`;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `\${bytes} B`;
  if (bytes < 1048576) return `\${(bytes/1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `\${(bytes/1048576).toFixed(1)} MB`;
  return `\${(bytes/1073741824).toFixed(1)} GB`;
}

/* ── ICONS ── */
function iconFolder() { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>\`; }
function iconDoc()    { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>\`; }
function iconCode()   { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>\`; }
function iconImage()  { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>\`; }
function iconZip()    { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>\`; }
function iconEdit()   { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>\`; }
function iconTrash()  { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>\`; }
function iconSave()   { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>\`; }
function iconX()      { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>\`; }
function iconRefresh(){ return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="15" height="15"><path d="M4 4v5h5M20 20v-5h-5"/><path d="M20 9A9 9 0 006 5.5L4 9M4 15a9 9 0 0014 3.5l2-3.5"/></svg>\`; }
function iconGrid()   { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="15" height="15"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>\`; }
function iconList()   { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="15" height="15"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>\`; }
function iconChevron(dir) { return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="\${dir==='left'?'M15 18l-6-6 6-6':'M9 18l6-6-6-6'}"/></svg>\`; }

/* ── PUBLIC API ── */
window.USBExplorer = {
  mount,
  handleAgentMessage,
  setAgentConnected: (v) => { state.agentConnected = v; },
  getCurrentDrive: () => state.drive,
};

})();
