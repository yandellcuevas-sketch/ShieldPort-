/**
 * ShieldPort v2.0 — app.js
 * Core controller: navigation, state, particles, agent connection, toasts, modals
 */

// ══════════════════════════════════════════════════════════════
// GLOBAL STATE
// ══════════════════════════════════════════════════════════════
const ShieldPort = {
  state: {
    agentConnected: false,
    agentWs:        null,
    agentUrl:       'ws://localhost:8765',
    currentSection: 'dashboard',
    lastUsbDevice:  null,
    activityLog:    [],
    alerts:         [],
    usbDevices:     [],
    webUsbSupported: false,
  },

  explorer: {
    open(drive) {
      const card = document.getElementById('usb-explorer-card');
      const badge = document.getElementById('explorer-drive-badge');
      if (card && badge) {
        card.style.display = 'block';
        badge.textContent = drive;
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.USBExplorer) USBExplorer.mount(drive);
      }
    },
    close() {
      const card = document.getElementById('usb-explorer-card');
      if (card) card.style.display = 'none';
    }
  },

  // ── INIT ─────────────────────────────────────────────────
  init() {
    this.initParticles();
    this.initNav();
    this.initAgentConnection();
    this.detectCapabilities();
    this.initMobileMenu();
    this.updateDashboardClock();
    console.log('%cShieldPort v2.0 initialized', 'color:#2af0ff;font-weight:800;font-size:15px;');
  },

  // ── NAVIGATION ───────────────────────────────────────────
  nav(section) {
    const validSections = ['dashboard', 'usb', 'qr'];
    if (!validSections.includes(section)) return;

    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    // Show target
    const targetSection = document.getElementById(`section-${section}`);
    if (targetSection) {
      targetSection.classList.add('active');
      // Scroll to top smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update nav items
    document.querySelectorAll('.nav-item[data-section]').forEach(n => {
      n.classList.remove('active');
      n.removeAttribute('aria-current');
    });
    const targetNav = document.getElementById(`nav-${section}`);
    if (targetNav) {
      targetNav.classList.add('active');
      targetNav.setAttribute('aria-current', 'page');
    }

    // Update breadcrumb
    const sectionNames = { dashboard: 'Dashboard', usb: 'USB Shield', qr: 'QR Forge' };
    const breadcrumb = document.getElementById('topbar-section-name');
    if (breadcrumb) breadcrumb.textContent = sectionNames[section] || section;

    this.state.currentSection = section;
    this.closeMobileMenu();
  },

  initNav() {
    document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
      btn.addEventListener('click', () => this.nav(btn.dataset.section));
    });

    document.getElementById('btn-refresh-dashboard')?.addEventListener('click', () => {
      this.refreshDashboard();
    });

    document.getElementById('btn-close-explorer')?.addEventListener('click', () => this.explorer.close());
  },

  // ── DETECT CAPABILITIES ──────────────────────────────────
  detectCapabilities() {
    const ua = navigator.userAgent;
    let osName = 'Desconocido';
    if (/Windows/i.test(ua)) osName = 'Windows';
    else if (/Mac/i.test(ua)) osName = 'macOS';
    else if (/Linux/i.test(ua)) osName = 'Linux';
    else if (/Android/i.test(ua)) osName = 'Android';
    else if (/iPhone|iPad/i.test(ua)) osName = 'iOS';

    const osEl = document.getElementById('sys-os');
    if (osEl) osEl.textContent = osName;

    this.state.webUsbSupported = 'usb' in navigator;
  },

  // ── DESKTOP AGENT CONNECTION ─────────────────────────────
  initAgentConnection() {
    this.updateAgentStatus('loading', 'Conectando...');
    this._connectAgent();
  },

  _connectAgent() {
    try {
      const ws = new WebSocket(this.state.agentUrl);

      ws.addEventListener('open', () => {
        this.state.agentConnected = true;
        this.state.agentWs = ws;
        this.updateAgentStatus('online', 'Agente Activo');
        if (window.USBExplorer) USBExplorer.setAgentConnected(true);
        // Hide USB notice
        const notice = document.getElementById('usb-agent-notice');
        if (notice) notice.style.display = 'none';
        // Auto-scan
        this.sendToAgent({ type: 'GET_DRIVES' });
      });

      ws.addEventListener('message', (e) => {
        try {
          const msg = JSON.parse(e.data);
          this._handleAgentMessage(msg);
        } catch (err) {
          console.warn('ShieldPort: Invalid WS message', err);
        }
      });

      ws.addEventListener('close', () => {
        this.state.agentConnected = false;
        this.state.agentWs = null;
        if (window.USBExplorer) USBExplorer.setAgentConnected(false);
        this.updateAgentStatus('offline', 'Sin Agente');
        // Show USB notice again
        const notice = document.getElementById('usb-agent-notice');
        if (notice) notice.style.display = 'flex';
        // Retry after 5 seconds
        setTimeout(() => this._connectAgent(), 5000);
      });

      ws.addEventListener('error', () => {
        this.updateAgentStatus('offline', 'Sin Agente');
      });

    } catch (e) {
      this.updateAgentStatus('offline', 'Sin Agente');
      setTimeout(() => this._connectAgent(), 5000);
    }
  },

  _handleAgentMessage(msg) {
    if (msg.type && msg.type.startsWith('fs_')) {
      if (window.USBExplorer) USBExplorer.handleAgentMessage(msg);
      return;
    }

    switch (msg.type) {
      case 'DRIVES_LIST':
        this.state.usbDevices = msg.drives || [];
        if (this.usb) this.usb.renderDevices(msg.drives || []);
        this._updateDashboardUSBStatus(msg.drives || []);
        break;

      case 'DRIVE_PROTECTED':
        if (this.usb) this.usb.onProtectResult(msg);
        break;

      case 'DRIVE_UNPROTECTED':
        if (this.usb) this.usb.onUnprotectResult(msg);
        break;

      case 'BITLOCKER_STATUS':
        if (this.usb) this.usb.updateBitlockerStatus(msg);
        break;

      case 'BITLOCKER_ENABLED':
      case 'BITLOCKER_DISABLED':
      case 'BITLOCKER_UNLOCKED':
        if (this.usb) this.usb.onBitlockerResult(msg);
        break;

      case 'LOG':
        if (this.usb) this.usb.appendLog(msg.level, msg.message);
        break;

      default:
        break;
    }
  },

  sendToAgent(msg) {
    if (this.state.agentWs?.readyState === WebSocket.OPEN) {
      this.state.agentWs.send(JSON.stringify(msg));
      return true;
    }
    return false;
  },

  updateAgentStatus(state, label) {
    // Sidebar strip
    const strip = document.getElementById('agent-status-bar');
    if (strip) {
      strip.className = `sidebar-agent-strip ${state === 'online' ? 'online' : state === 'loading' ? 'loading' : 'offline'}`;
      const labelEl = document.getElementById('agent-label');
      if (labelEl) labelEl.textContent = label;
    }

    // Topbar pill
    const pill = document.getElementById('topbar-agent-pill');
    if (pill) {
      pill.className = `topbar-agent-pill ${state === 'online' ? 'connected' : 'disconnected'}`;
      const pillLabel = document.getElementById('topbar-agent-label');
      if (pillLabel) pillLabel.textContent = label;
    }

    // Dashboard card
    const agentIndicator = document.getElementById('dash-agent-indicator');
    const agentStatus    = document.getElementById('dash-agent-status');
    if (agentIndicator) agentIndicator.setAttribute('data-state', state === 'online' ? 'online' : state === 'loading' ? 'loading' : 'offline');
    if (agentStatus) agentStatus.textContent = label;
  },

  _updateDashboardUSBStatus(drives) {
    const count = drives.length;
    const statusEl    = document.getElementById('dash-usb-status');
    const indicatorEl = document.getElementById('dash-usb-indicator');
    const badgeEl     = document.getElementById('usb-count-badge');

    if (statusEl) statusEl.textContent = count > 0 ? `${count} dispositivo${count !== 1 ? 's' : ''} detectado${count !== 1 ? 's' : ''}` : 'Sin dispositivos';
    if (indicatorEl) indicatorEl.setAttribute('data-state', count > 0 ? 'online' : 'warning');

    if (badgeEl) {
      if (count > 0) {
        badgeEl.textContent = count;
        badgeEl.style.display = 'inline-flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    if (drives.length > 0) {
      const last = drives[0];
      this.state.lastUsbDevice = last;
      const lastEl = document.getElementById('last-usb-info');
      if (lastEl) {
        lastEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(42,240,255,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2af0ff" stroke-width="1.7" stroke-linecap="round">
                <path d="M12 2v12M9 6l3-4 3 4"/>
                <path d="M7 14a5 5 0 0010 0"/>
              </svg>
            </div>
            <div>
              <div style="font-weight:700;color:var(--text-primary);font-size:14px;">${this._esc(last.name || last.device || 'USB Drive')}</div>
              <div style="font-size:12px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;">${this._esc(last.mount || last.device || '—')} · ${this._formatBytes(last.size)}</div>
            </div>
          </div>`;
      }
    }
  },

  // ── MOBILE MENU ──────────────────────────────────────────
  initMobileMenu() {
    const hamburger = document.getElementById('mobile-menu-toggle');
    if (!hamburger) return;
    hamburger.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const open = sidebar.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open);
    });
  },

  closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
    const hamburger = document.getElementById('mobile-menu-toggle');
    if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
  },

  // ── DASHBOARD ────────────────────────────────────────────
  refreshDashboard() {
    this.addActivity('refresh', 'Dashboard actualizado');
    if (this.state.agentConnected) {
      this.sendToAgent({ type: 'GET_DRIVES' });
    }
    this.showToast('info', 'Actualizado', 'Dashboard refrescado');
  },

  updateDashboardClock() {
    // No clock displayed; placeholder for any periodic update
  },

  // ── ACTIVITY LOG ─────────────────────────────────────────
  addActivity(iconKey, text) {
    const list = document.getElementById('activity-list');
    if (!list) return;

    // Remove empty state
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const time = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const item = document.createElement('div');
    item.className = 'activity-item';

    const iconSvgs = {
      usb:     '<path d="M12 2v12M9 6l3-4 3 4"/><path d="M7 14a5 5 0 0010 0"/>',
      lock:    '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
      unlock:  '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>',
      qr:      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
      refresh: '<path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
      check:   '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    };
    const svgKey = typeof iconKey === 'string' ? iconKey : 'check';
    const svgPath = iconSvgs[svgKey] || iconSvgs.check;

    item.innerHTML = `
      <div class="act-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>
      </div>
      <span class="act-text">${this._esc(text)}</span>
      <span class="act-time">${time}</span>`;

    list.insertBefore(item, list.firstChild);

    // Cap at 20 items
    while (list.children.length > 20) list.removeChild(list.lastChild);

    this.state.activityLog.unshift({ iconKey, text, time });
    if (this.state.activityLog.length > 50) this.state.activityLog.pop();
  },

  addAlert(iconKey, text, variant = 'info') {
    const list = document.getElementById('alerts-list');
    if (!list) return;

    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const time = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="act-icon"><svg viewBox="0 0 24 24" fill="none" stroke="${variant === 'success' ? 'var(--green)' : variant === 'danger' ? 'var(--red)' : 'var(--cyan)'}" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
      <span class="act-text">${this._esc(text)}</span>
      <span class="act-time">${time}</span>`;
    list.insertBefore(item, list.firstChild);
    while (list.children.length > 10) list.removeChild(list.lastChild);
  },

  // ── TOAST SYSTEM ─────────────────────────────────────────
  showToast(type, title, message = '', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
      error:   '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
      warning: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      info:    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[type] || icons.info}</svg>
      </div>
      <div class="toast-body">
        <div class="toast-title">${this._esc(title)}</div>
        ${message ? `<div class="toast-msg">${this._esc(message)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>`;

    const close = () => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 280);
    };

    toast.querySelector('.toast-close').addEventListener('click', close);
    container.appendChild(toast);

    if (duration > 0) setTimeout(close, duration);
    return toast;
  },

  // ── CONFIRM MODAL ────────────────────────────────────────
  confirm(title, body, confirmLabel = 'Confirmar', variant = 'primary') {
    return new Promise((resolve) => {
      const modal  = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-title');
      const bodyEl  = document.getElementById('confirm-body');
      const okBtn   = document.getElementById('confirm-ok');
      const cancelX = document.getElementById('confirm-cancel-x');
      const cancelBtn = document.getElementById('confirm-cancel');

      if (!modal) { resolve(false); return; }

      titleEl.textContent = title;
      bodyEl.textContent  = body;
      okBtn.textContent   = confirmLabel;
      okBtn.className     = `btn btn-${variant}`;

      modal.style.display = 'flex';

      const done = (result) => {
        modal.style.display = 'none';
        resolve(result);
      };

      // Remove old listeners
      const newOk = okBtn.cloneNode(true);
      okBtn.parentNode.replaceChild(newOk, okBtn);
      newOk.textContent = confirmLabel;
      newOk.className   = `btn btn-${variant}`;
      newOk.addEventListener('click', () => done(true));

      cancelX.onclick = () => done(false);
      cancelBtn.onclick = () => done(false);
    });
  },

  // ── PASSWORD MODAL ───────────────────────────────────────
  promptPassword(title, desc, confirm = false) {
    return new Promise((resolve) => {
      const modal = document.getElementById('password-modal');
      const titleEl = document.getElementById('password-modal-title');
      const descEl = document.getElementById('password-modal-desc');
      const input = document.getElementById('password-input');
      const confirmGroup = document.getElementById('password-confirm-group');
      const confirmInput = document.getElementById('password-confirm-input');
      const okBtn = document.getElementById('password-modal-ok');
      const cancelX = document.getElementById('password-modal-close');
      const cancelBtn = document.getElementById('password-modal-cancel');

      if (!modal) { resolve(null); return; }

      titleEl.textContent = title;
      descEl.textContent = desc;
      input.value = '';
      confirmInput.value = '';
      
      if (confirm) {
        confirmGroup.style.display = 'block';
      } else {
        confirmGroup.style.display = 'none';
      }

      modal.style.display = 'flex';
      setTimeout(() => input.focus(), 100);

      const done = (val) => {
        modal.style.display = 'none';
        resolve(val);
      };

      const newOk = okBtn.cloneNode(true);
      okBtn.parentNode.replaceChild(newOk, okBtn);
      
      newOk.addEventListener('click', () => {
        const p1 = input.value;
        const p2 = confirmInput.value;
        if (!p1) {
          ShieldPort.showToast('warning', 'Contraseña vacía', 'Debes escribir una contraseña');
          return;
        }
        if (confirm && p1 !== p2) {
          ShieldPort.showToast('error', 'No coinciden', 'Las contraseñas no son iguales');
          return;
        }
        done(p1);
      });

      cancelX.onclick = () => done(null);
      cancelBtn.onclick = () => done(null);
    });
  },

  // ── SETUP GUIDE ──────────────────────────────────────────
  agent: {
    openSetupGuide() {
      const modal = document.getElementById('setup-modal');
      const content = document.getElementById('setup-modal-content');
      if (!modal || !content) return;

      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:20px;padding-top:8px;">
          <div style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-md);padding:20px;">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              Requisitos
            </div>
            <ul style="list-style:disc;padding-left:18px;display:flex;flex-direction:column;gap:6px;">
              <li style="font-size:13px;color:var(--text-secondary);">Node.js v18 o superior instalado</li>
              <li style="font-size:13px;color:var(--text-secondary);">PowerShell disponible (solo Windows)</li>
              <li style="font-size:13px;color:var(--text-secondary);">Ejecutar como <strong style="color:var(--text-primary);">Administrador</strong> para proteger USBs</li>
            </ul>
          </div>
          <div style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-md);padding:20px;">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);margin-bottom:12px;">Pasos de instalación</div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${['cd desktop-agent', 'npm install', 'node main.js'].map((cmd, i) => `
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:22px;height:22px;border-radius:50%;background:rgba(42,240,255,0.12);border:1px solid rgba(42,240,255,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--cyan);flex-shrink:0;">${i + 1}</div>
                  <code style="font-family:'JetBrains Mono',monospace;font-size:13px;background:rgba(255,255,255,0.05);padding:6px 12px;border-radius:6px;color:var(--cyan);flex:1;">${cmd}</code>
                </div>`).join('')}
            </div>
          </div>
          <p style="font-size:12.5px;color:var(--text-muted);text-align:center;">El agente iniciará en <code style="color:var(--cyan);font-family:'JetBrains Mono',monospace;">ws://localhost:8765</code> y conectará automáticamente.</p>
        </div>`;

      modal.style.display = 'flex';

      document.getElementById('setup-modal-close').onclick = () => {
        modal.style.display = 'none';
      };
    }
  },

  // ── PARTICLES ────────────────────────────────────────────
  initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const COLORS = ['rgba(42,240,255,', 'rgba(16,242,139,', 'rgba(59,130,246,'];

    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.4 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.alpha + ')';
        ctx.fill();
      }

      // Draw connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(42,240,255,${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener('resize', () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });
  },

  // ── UTILITIES ────────────────────────────────────────────
  _esc(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  _formatBytes(bytes) {
    if (!bytes || bytes === 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let val = Number(bytes);
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  },
};

// ── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => ShieldPort.init());
