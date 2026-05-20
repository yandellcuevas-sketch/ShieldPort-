/**
 * ShieldPort v2.0 — usb-ui.js
 * USB Shield: device detection, write-protect, logs
 */

ShieldPort.usb = {
  _logs: [],
  _scanning: false,

  init() {
    this._bindButtons();
  },

  _bindButtons() {
    document.getElementById('btn-scan-usb')?.addEventListener('click', () => this.scanUSB());
    document.getElementById('btn-view-usb-logs')?.addEventListener('click', () => this.openLogs());
    document.getElementById('btn-close-usb-logs')?.addEventListener('click', () => this.closeLogs());
    document.getElementById('btn-retry-agent')?.addEventListener('click', () => {
      ShieldPort.showToast('info', 'Reintentando...', 'Buscando Desktop Agent');
      ShieldPort._connectAgent();
    });
  },

  async scanUSB() {
    if (this._scanning) return;
    this._scanning = true;

    const btn = document.getElementById('btn-scan-usb');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        <span>Escaneando...</span>`;
    }

    this.appendLog('info', 'Iniciando escaneo de dispositivos USB...');
    ShieldPort.addActivity('usb', 'Escaneo USB iniciado');

    if (ShieldPort.state.agentConnected) {
      ShieldPort.sendToAgent({ type: 'GET_DRIVES' });
      setTimeout(() => this._endScan(btn), 1500);
    } else {
      ShieldPort.showToast('warning', 'Sin Desktop Agent', 'Inicia el Desktop Agent para escanear USBs');
      this.appendLog('warn', 'Desktop Agent no conectado — usa el Desktop Agent para escanear USBs');
      this._endScan(btn);
    }
  },

  _endScan(btn) {
    this._scanning = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <span>Escanear USB</span>`;
    }
    ShieldPort.addActivity('check', 'Escaneo USB completado');
  },

  // ── RENDER DEVICES ──────────────────────────────────────
  renderDevices(drives) {
    const list = document.getElementById('usb-devices-list');
    if (!list) return;

    const usbDrives = drives.filter(d => d.isUsb !== false);

    if (usbDrives.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M12 2v12M9 6l3-4 3 4"/>
              <path d="M7 14a5 5 0 0010 0"/>
            </svg>
          </div>
          <p class="empty-title">Sin dispositivos USB</p>
          <p class="empty-subtitle">Conecta un dispositivo y presiona Escanear</p>
        </div>`;
      return;
    }

    list.innerHTML = usbDrives.map((drive, idx) =>
      this._buildDeviceCard(drive, idx)
    ).join('');

    // Bind buttons
    usbDrives.forEach(drive => {
      const id = this._driveId(drive);
      document.getElementById(`btn-protect-${id}`)?.addEventListener('click', () => this.protectDrive(drive));
      document.getElementById(`btn-unprotect-${id}`)?.addEventListener('click', () => this.unprotectDrive(drive));
    });
  },

  _buildDeviceCard(drive, idx) {
    const id       = this._driveId(drive);
    const totalBytes = drive.size || 0;
    const freeBytes  = drive.available || drive.freeSpace || 0;
    const usedBytes  = totalBytes - freeBytes;
    const usedPct    = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;
    const isProtected = drive.readOnly || false;

    const protectedBadge = isProtected
      ? `<span class="usb-status-badge protected">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="12" height="12">
             <rect x="3" y="11" width="18" height="11" rx="2"/>
             <path d="M7 11V7a5 5 0 0110 0v4"/>
           </svg>
           Protegido
         </span>`
      : `<span class="usb-status-badge unprotected">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="12" height="12">
             <rect x="3" y="11" width="18" height="11" rx="2"/>
             <path d="M7 11V7a5 5 0 019.9-1"/>
           </svg>
           Sin protección
         </span>`;

    const progressColor = usedPct > 85
      ? 'linear-gradient(90deg,var(--red),#b91c3c)'
      : 'linear-gradient(90deg,var(--cyan),var(--blue))';

    return `
      <div class="usb-device-card" id="drive-card-${id}" style="animation-delay:${idx * 60}ms">
        <div class="usb-device-header">
          <div class="usb-device-name">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" width="16" height="16">
              <path d="M12 2v12M9 6l3-4 3 4"/>
              <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none"/>
              <path d="M7 14a5 5 0 0010 0"/>
            </svg>
            ${ShieldPort._esc(drive.name || drive.device || 'USB Drive')}
          </div>
          ${protectedBadge}
        </div>

        <div class="usb-device-grid">
          <div class="usb-info-item">
            <span class="usb-info-label">Unidad / Ruta</span>
            <span class="usb-info-value">${ShieldPort._esc(drive.mount || drive.device || '—')}</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Tamaño Total</span>
            <span class="usb-info-value">${ShieldPort._formatBytes(totalBytes)}</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Espacio Libre</span>
            <span class="usb-info-value">${ShieldPort._formatBytes(freeBytes)}</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Usado</span>
            <span class="usb-info-value">${usedPct}%</span>
          </div>
        </div>

        ${totalBytes > 0 ? `
        <div class="usb-storage-bar">
          <div class="usb-storage-bar-label">
            <span>${ShieldPort._formatBytes(usedBytes)} usados</span>
            <span>${ShieldPort._formatBytes(freeBytes)} libres</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${usedPct}%;background:${progressColor}"></div>
          </div>
        </div>` : ''}

        <div class="usb-device-actions">
          <button class="btn btn-secondary btn-sm" id="btn-protect-${id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Proteger
          </button>
          <button class="btn btn-ghost btn-sm" id="btn-unprotect-${id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 019.9-1"/>
            </svg>
            Desproteger
          </button>
          <button class="btn btn-ghost btn-sm" onclick="ShieldPort.usb.refreshDrive('${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
              <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
            </svg>
            Actualizar
          </button>
        </div>
      </div>`;
  },

  _driveId(drive) {
    return (drive.device || drive.mount || 'dev').replace(/[^a-zA-Z0-9]/g, '_');
  },

  // ── PROTECT / UNPROTECT ─────────────────────────────────
  async protectDrive(drive) {
    const confirmed = await ShieldPort.confirm(
      'Proteger contra escritura',
      `¿Confirmas proteger "${drive.name || drive.device}"?\n\nEste dispositivo quedará en modo solo-lectura hasta que lo desproteja manualmente.`,
      'Proteger', 'primary'
    );
    if (!confirmed) return;

    this.appendLog('info', `Aplicando protección en ${drive.device || drive.mount}...`);
    ShieldPort.addActivity('lock', `Protegiendo: ${drive.name || drive.device}`);

    if (!ShieldPort.sendToAgent({ type: 'PROTECT_DRIVE', driveId: drive.device, device: drive.device, mount: drive.mount })) {
      ShieldPort.showToast('warning', 'Sin Desktop Agent', 'Activa el Desktop Agent para esta función');
    }
  },

  async unprotectDrive(drive) {
    const confirmed = await ShieldPort.confirm(
      'Quitar protección',
      `¿Confirmas quitar la protección de "${drive.name || drive.device}"?\n\nEl dispositivo podrá recibir escrituras.`,
      'Desproteger', 'danger'
    );
    if (!confirmed) return;

    this.appendLog('info', `Quitando protección de ${drive.device || drive.mount}...`);
    ShieldPort.addActivity('unlock', `Desprotegiendo: ${drive.name || drive.device}`);

    if (!ShieldPort.sendToAgent({ type: 'UNPROTECT_DRIVE', driveId: drive.device, device: drive.device, mount: drive.mount })) {
      ShieldPort.showToast('warning', 'Sin Desktop Agent', 'Activa el Desktop Agent para esta función');
    }
  },

  onProtectResult(msg) {
    if (msg.success) {
      ShieldPort.showToast('success', 'USB Protegido', 'El dispositivo está en modo solo-lectura');
      ShieldPort.addAlert('shield', `${msg.driveId || 'USB'} protegido`, 'success');
      this.appendLog('info', `✅ Protección aplicada en ${msg.driveId}`);
    } else {
      ShieldPort.showToast('error', 'Error al proteger', msg.message || 'No se pudo aplicar la protección');
      this.appendLog('error', `❌ Error al proteger: ${msg.message}`);
    }
    setTimeout(() => ShieldPort.sendToAgent({ type: 'GET_DRIVES' }), 800);
  },

  onUnprotectResult(msg) {
    if (msg.success) {
      ShieldPort.showToast('success', 'Protección eliminada', 'El dispositivo ya puede recibir escrituras');
      ShieldPort.addAlert('shield', `${msg.driveId || 'USB'} desprotegido`, 'warning');
      this.appendLog('info', `✅ Protección eliminada en ${msg.driveId}`);
    } else {
      ShieldPort.showToast('error', 'Error al desproteger', msg.message || 'No se pudo quitar la protección');
      this.appendLog('error', `❌ Error al desproteger: ${msg.message}`);
    }
    setTimeout(() => ShieldPort.sendToAgent({ type: 'GET_DRIVES' }), 800);
  },

  refreshDrive(id) {
    ShieldPort.sendToAgent({ type: 'GET_DRIVES' });
    ShieldPort.showToast('info', 'Actualizando...', 'Refrescando lista de dispositivos');
  },

  // ── LOGS ────────────────────────────────────────────────
  appendLog(level, message) {
    const time = new Date().toLocaleTimeString('es', { hour12: false });
    this._logs.unshift({ level, message, time });
    if (this._logs.length > 200) this._logs.pop();

    const logEl = document.getElementById('usb-log-entries');
    if (logEl) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      const cls = level === 'error' ? 'log-err' : level === 'warn' ? 'log-warn' : level === 'success' ? 'log-ok' : 'log-msg';
      entry.innerHTML = `<span class="log-time">${time}</span><span class="${cls}">${ShieldPort._esc(message)}</span>`;
      logEl.prepend(entry);
      while (logEl.children.length > 100) logEl.removeChild(logEl.lastChild);
    }
  },

  openLogs() {
    const panel = document.getElementById('usb-logs-panel');
    if (panel) panel.style.display = 'block';
    const logEl = document.getElementById('usb-log-entries');
    if (logEl && this._logs.length === 0) {
      logEl.innerHTML = '<div class="log-entry"><span class="log-time">—</span><span class="log-msg">Sin entradas. Realiza un escaneo primero.</span></div>';
    }
  },

  closeLogs() {
    const panel = document.getElementById('usb-logs-panel');
    if (panel) panel.style.display = 'none';
  },
};

document.addEventListener('DOMContentLoaded', () => ShieldPort.usb.init());
