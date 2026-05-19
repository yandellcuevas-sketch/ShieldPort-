/**
 * ShieldPort — app.js
 * Core application controller: routing, state, particles, agent detection
 */

// ════════════════════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════════════════════
const ShieldPort = {
  state: {
    agentConnected: false,
    agentWs: null,
    agentUrl: 'ws://localhost:8765',
    lastUsbDevice: null,
    activityLog: [],
    alerts: [],
    usbDevices: [],
  },

  // ── INIT ──────────────────────────────────────────────────
  init() {
    this.initParticles();
    this.initNav();
    this.detectCapabilities();
    this.initAgentConnection();
    this.initMobileMenu();
    this.updateDashboardClock();
    console.log('%cShieldPort initialized', 'color:#2af0ff;font-weight:bold;font-size:14px');
  },

  // ── NAVIGATION ────────────────────────────────────────────
  nav(section) {
    const sections = ['dashboard', 'usb', 'qr'];
    if (!sections.includes(section)) return;

    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.remove('active');
      n.removeAttribute('aria-current');
    });

    // Activate target
    const targetSection = document.getElementById(`section-${section}`);
    const targetNav = document.getElementById(`nav-${section}`);

    if (targetSection) targetSection.classList.add('active');
    if (targetNav) {
      targetNav.classList.add('active');
      targetNav.setAttribute('aria-current', 'page');
    }

    this.state.currentSection = section;

    // Close mobile menu
    this.closeMobileMenu();
  },

  initNav() {
    document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
      btn.addEventListener('click', () => this.nav(btn.dataset.section));
    });

    document.getElementById('btn-refresh-dashboard')?.addEventListener('click', () => {
      this.refreshDashboard();
    });
  },

  // ── DETECT BROWSER CAPABILITIES ──────────────────────────
  detectCapabilities() {
    // Detect OS
    const platform = navigator.userAgentData?.platform || navigator.platform || 'Unknown';
    const ua = navigator.userAgent;
    let osName = 'Desconocido';
    if (/Windows/i.test(ua)) osName = 'Windows';
    else if (/Mac/i.test(ua)) osName = 'macOS';
    else if (/Linux/i.test(ua)) osName = 'Linux';
    else if (/Android/i.test(ua)) osName = 'Android';
    else if (/iPhone|iPad/i.test(ua)) osName = 'iOS';
    document.getElementById('sys-os').textContent = osName;

    // Detect WebUSB
    const webUsbAvailable = 'usb' in navigator;
    this.state.webUsbSupported = webUsbAvailable;
    const webUsbEl = document.getElementById('sys-webusb');
    if (webUsbEl) webUsbEl.textContent = webUsbAvailable ? 'Sí' : 'No';
  },

  // ── DESKTOP AGENT CONNECTION ──────────────────────────────
  initAgentConnection() {
    this.updateAgentStatus('loading', 'Buscando Desktop Agent...');
    this._connectAgent();
  },

  _connectAgent() {
    try {
      const ws = new WebSocket(this.state.agentUrl);
      let opened = false;

      ws.addEventListener('open', () => {
        opened = true;
        this.state.agentConnected = true;
        this.state.agentWs = ws;
        this.updateAgentStatus('online', 'Desktop Agent conectado');
        this.addActivity('🖥️', 'Desktop Agent conectado');
        this.updateDashboardAgentState(true);
        // Request initial USB scan
        this.sendToAgent({ type: 'GET_DRIVES' });
      });

      ws.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          this._handleAgentMessage(msg);
        } catch (e) {
          console.error('ShieldPort: bad agent message', e);
        }
      });

      ws.addEventListener('close', () => {
        this.state.agentConnected = false;
        this.state.agentWs = null;
        if (opened) {
          this.updateAgentStatus('offline', 'Desktop Agent desconectado');
          this.addAlert('🔴', 'Desktop Agent desconectado. Funciones USB limitadas.');
        } else {
          this.updateAgentStatus('offline', 'Sin Desktop Agent');
        }
        this.updateDashboardAgentState(false);
        // Retry every 8s
        setTimeout(() => this._connectAgent(), 8000);
      });

      ws.addEventListener('error', () => {
        // Silently retry — no error shown to user
      });

    } catch (e) {
      this.updateAgentStatus('offline', 'Sin Desktop Agent');
      this.updateDashboardAgentState(false);
      setTimeout(() => this._connectAgent(), 8000);
    }
  },

  _handleAgentMessage(msg) {
    switch (msg.type) {
      case 'DRIVES_LIST':
        this.state.usbDevices = msg.drives || [];
        ShieldPort.usb.renderDevices(msg.drives || []);
        this.updateUsbDashboard(msg.drives || []);
        break;
      case 'DRIVE_PROTECTED':
        ShieldPort.usb.onProtectResult(msg);
        break;
      case 'DRIVE_UNPROTECTED':
        ShieldPort.usb.onUnprotectResult(msg);
        break;
      case 'LOG':
        ShieldPort.usb.appendLog(msg.level, msg.message);
        break;
      case 'ERROR':
        this.showToast('error', 'Error del sistema', msg.message);
        break;
    }
  },

  sendToAgent(payload) {
    if (this.state.agentConnected && this.state.agentWs) {
      this.state.agentWs.send(JSON.stringify(payload));
      return true;
    }
    return false;
  },

  updateAgentStatus(state, label) {
    const dot = document.getElementById('agent-dot');
    const labelEl = document.getElementById('agent-label');
    if (dot) { dot.className = 'agent-dot ' + state; }
    if (labelEl) labelEl.textContent = label;
  },

  updateDashboardAgentState(online) {
    const el = document.getElementById('dash-agent-status');
    const ind = document.getElementById('dash-agent-indicator');
    if (el) el.textContent = online ? 'Activo' : 'Sin conexión';
    if (ind) ind.dataset.state = online ? 'online' : 'offline';

    const usbEl = document.getElementById('dash-usb-status');
    const usbInd = document.getElementById('dash-usb-indicator');
    if (!online) {
      if (usbEl) usbEl.textContent = 'Solo Web';
      if (usbInd) usbInd.dataset.state = 'warning';
    }

    // Hide/show USB agent notice based on connection
    const notice = document.getElementById('usb-agent-notice');
    if (notice) notice.style.display = online ? 'none' : 'flex';
  },

  updateUsbDashboard(drives) {
    const usbEl = document.getElementById('dash-usb-status');
    const usbInd = document.getElementById('dash-usb-indicator');
    const badge = document.getElementById('usb-count-badge');

    const usbDrives = drives.filter(d => d.isUsb);
    if (usbEl) usbEl.textContent = usbDrives.length > 0
      ? `${usbDrives.length} USB detectado${usbDrives.length > 1 ? 's' : ''}`
      : 'Sin USB';
    if (usbInd) usbInd.dataset.state = usbDrives.length > 0 ? 'online' : 'offline';
    if (badge) {
      badge.textContent = usbDrives.length;
      badge.style.display = usbDrives.length > 0 ? 'inline-flex' : 'none';
    }

    // Last USB on dashboard
    if (usbDrives.length > 0) {
      this.state.lastUsbDevice = usbDrives[0];
      this.renderLastUsb(usbDrives[0]);
    }
  },

  renderLastUsb(drive) {
    const el = document.getElementById('last-usb-info');
    if (!el) return;
    el.innerHTML = `
      <div class="usb-device-grid" style="margin:0;">
        <div class="usb-info-item">
          <span class="usb-info-label">Nombre</span>
          <span class="usb-info-value">${this._esc(drive.name || 'USB Drive')}</span>
        </div>
        <div class="usb-info-item">
          <span class="usb-info-label">Unidad</span>
          <span class="usb-info-value">${this._esc(drive.mount || drive.device || '—')}</span>
        </div>
        <div class="usb-info-item">
          <span class="usb-info-label">Tamaño</span>
          <span class="usb-info-value">${this._formatBytes(drive.size)}</span>
        </div>
        <div class="usb-info-item">
          <span class="usb-info-label">Estado</span>
          <span class="usb-info-value">
            <span class="lock-anim ${drive.readOnly ? 'locked' : 'unlocked'}">
              ${drive.readOnly ? '🔒 Protegido' : '🔓 Desprotegido'}
            </span>
          </span>
        </div>
      </div>
    `;
  },

  // ── MOBILE MENU ───────────────────────────────────────────
  initMobileMenu() {
    // Inject overlay if not exists
    if (!document.getElementById('sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => this.closeMobileMenu());
    }

    const toggle = document.getElementById('mobile-menu-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const isOpen = sidebar.classList.contains('mobile-open');
        if (isOpen) {
          this.closeMobileMenu();
        } else {
          sidebar.classList.add('mobile-open');
          overlay.classList.add('active');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
    }
  },

  closeMobileMenu() {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
    document.getElementById('mobile-menu-toggle')?.setAttribute('aria-expanded', 'false');
  },

  // ── ACTIVITY LOG ──────────────────────────────────────────
  addActivity(icon, text) {
    const now = new Date();
    const time = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    this.state.activityLog.unshift({ icon, text, time });
    if (this.state.activityLog.length > 50) this.state.activityLog.pop();
    this._renderActivity();
  },

  _renderActivity() {
    const list = document.getElementById('activity-list');
    if (!list) return;
    const items = this.state.activityLog.slice(0, 10);
    if (items.length === 0) return;
    list.innerHTML = items.map(a => `
      <div class="activity-item">
        <span class="activity-type">${a.icon}</span>
        <span class="activity-text">${this._esc(a.text)}</span>
        <span class="activity-time">${a.time}</span>
      </div>
    `).join('');
  },

  // ── ALERTS ───────────────────────────────────────────────
  addAlert(icon, text, level = 'warning') {
    const now = new Date();
    const time = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    this.state.alerts.unshift({ icon, text, time, level });
    if (this.state.alerts.length > 20) this.state.alerts.pop();
    this._renderAlerts();
  },

  _renderAlerts() {
    const list = document.getElementById('alerts-list');
    if (!list) return;
    const items = this.state.alerts.slice(0, 8);
    if (items.length === 0) return;
    list.innerHTML = items.map(a => `
      <div class="activity-item">
        <span class="activity-type">${a.icon}</span>
        <span class="activity-text" style="color: var(--${a.level === 'error' ? 'red' : a.level === 'success' ? 'green' : 'yellow'})">${this._esc(a.text)}</span>
        <span class="activity-time">${a.time}</span>
      </div>
    `).join('');
  },

  // ── TOAST NOTIFICATIONS ───────────────────────────────────
  showToast(type, title, message, duration = 4000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-body">
        <div class="toast-title">${this._esc(title)}</div>
        ${message ? `<div class="toast-msg">${this._esc(message)}</div>` : ''}
      </div>
    `;

    toast.addEventListener('click', () => this._dismissToast(toast));
    container.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => this._dismissToast(toast), duration);
  },

  _dismissToast(toast) {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  },

  // ── CONFIRM MODAL ─────────────────────────────────────────
  confirm(icon, title, message, okLabel, dangerLevel = 'danger') {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      document.getElementById('confirm-icon').textContent = icon;
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;

      const okBtn = document.getElementById('confirm-ok');
      okBtn.textContent = okLabel;
      okBtn.className = `btn btn-${dangerLevel}`;

      modal.style.display = 'flex';

      const onOk = () => {
        modal.style.display = 'none';
        cleanup();
        resolve(true);
      };
      const onCancel = () => {
        modal.style.display = 'none';
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        okBtn.removeEventListener('click', onOk);
        document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
        modal.removeEventListener('click', onOverlayClick);
      };

      const onOverlayClick = (e) => { if (e.target === modal) onCancel(); };

      okBtn.addEventListener('click', onOk);
      document.getElementById('confirm-cancel').addEventListener('click', onCancel);
      modal.addEventListener('click', onOverlayClick);
    });
  },

  // ── DASHBOARD ────────────────────────────────────────────
  refreshDashboard() {
    if (this.state.agentConnected) {
      this.sendToAgent({ type: 'GET_DRIVES' });
    }
    this.showToast('info', 'Actualizando', 'Refrescando estado del dashboard...');
    this.addActivity('🔄', 'Dashboard actualizado');
  },

  updateDashboardClock() {
    // QR dashboard always online
    const qrStatus = document.getElementById('dash-qr-status');
    const qrInd = document.getElementById('dash-qr-indicator');
    if (qrStatus) qrStatus.textContent = 'Listo';
    if (qrInd) qrInd.dataset.state = 'online';
  },

  // ── AGENT SETUP GUIDE ────────────────────────────────────
  agent: {
    openSetupGuide() {
      const modal = document.getElementById('setup-modal');
      const content = document.getElementById('setup-modal-content');
      if (!modal || !content) return;

      content.innerHTML = `
        <h3>🪟 Windows</h3>
        <p>1. Descarga el Desktop Agent desde el repositorio del proyecto.</p>
        <p>2. Ejecuta como <strong>Administrador</strong>:</p>
        <pre>cd desktop-agent
npm install
node main.js</pre>
        <p>3. El agente arrancará en el puerto <code>8765</code>. Recarga esta página.</p>

        <h3>🐧 Linux</h3>
        <pre>cd desktop-agent
npm install
sudo node main.js</pre>

        <h3>🍎 macOS</h3>
        <pre>cd desktop-agent
npm install
sudo node main.js</pre>

        <p style="margin-top:14px; color: var(--text-muted); font-size:12px;">
          Una vez activo, el ícono en la barra lateral se volverá verde automáticamente.
        </p>
      `;

      modal.style.display = 'flex';
      document.getElementById('setup-modal-close')?.addEventListener('click', () => {
        modal.style.display = 'none';
      }, { once: true });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      }, { once: true });
    }
  },

  // ── UTILITIES ────────────────────────────────────────────
  _formatBytes(bytes) {
    if (!bytes || bytes === 0) return '—';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  },

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  },

  // ── PARTICLES ────────────────────────────────────────────
  initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const PARTICLE_COUNT = 60;
    const particles = [];

    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.5 + 0.3;
        this.speedX = (Math.random() - 0.5) * 0.3;
        this.speedY = (Math.random() - 0.5) * 0.3;
        this.opacity = Math.random() * 0.4 + 0.1;
        this.color = Math.random() > 0.6 ? '#2af0ff' : Math.random() > 0.5 ? '#0099ff' : '#00ff9d';
        this.pulseSpeed = Math.random() * 0.02 + 0.005;
        this.pulsePhase = Math.random() * Math.PI * 2;
      }
      update(t) {
        this.x += this.speedX;
        this.y += this.speedY;
        this.opacity = 0.1 + 0.25 * Math.abs(Math.sin(t * this.pulseSpeed + this.pulsePhase));
        if (this.x < -10) this.x = canvas.width + 10;
        if (this.x > canvas.width + 10) this.x = -10;
        if (this.y < -10) this.y = canvas.height + 10;
        if (this.y > canvas.height + 10) this.y = -10;
      }
      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Create particles
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

    // Draw connecting lines
    function drawLines() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.save();
            ctx.globalAlpha = (1 - dist / 120) * 0.08;
            ctx.strokeStyle = '#2af0ff';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      particles.forEach(p => { p.update(frame); p.draw(); });
      drawLines();
      requestAnimationFrame(animate);
    }

    animate();
  },
};

// ── BOOT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => ShieldPort.init());
