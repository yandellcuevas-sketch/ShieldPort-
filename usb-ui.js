/**
 * ShieldPort — usb-ui.js
 * USB Shield module: device detection, write-protect, UI management
 * All OS-level operations happen in the backend. The UI only shows results.
 */

ShieldPort.usb = {
  _logs: [],
  _scanning: false,

  // ── INIT ──────────────────────────────────────────────────
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
    document.getElementById('btn-webusb-request')?.addEventListener('click', () => this.requestWebUSB());
  },

  // ── SCAN USB ──────────────────────────────────────────────
  async scanUSB() {
    if (this._scanning) return;
    this._scanning = true;

    const btn = document.getElementById('btn-scan-usb');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="scan-spinner">⏳</span> Escaneando...'; }

    this.appendLog('info', 'Iniciando escaneo de dispositivos USB...');
    ShieldPort.addActivity('🔍', 'Escaneo USB iniciado');

    if (ShieldPort.state.agentConnected) {
      // Agent will respond with DRIVES_LIST message → renderDevices()
      ShieldPort.sendToAgent({ type: 'GET_DRIVES' });
      setTimeout(() => this._endScan(btn), 1500);
    } else {
      // Fallback: WebUSB only - list paired USB devices
      try {
        const devices = await navigator.usb?.getDevices() || [];
        this._renderWebUsbDevices(devices);
        this.appendLog('info', `WebUSB: ${devices.length} dispositivo(s) emparejado(s)`);
      } catch (e) {
        this.appendLog('warn', 'WebUSB no disponible en este navegador');
      }
      this._endScan(btn);
    }
  },

  _endScan(btn) {
    this._scanning = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">🔍</span> Escanear USB';
    }
    ShieldPort.addActivity('✅', 'Escaneo USB completado');
  },

  // ── RENDER DEVICES (from Desktop Agent) ──────────────────
  renderDevices(drives) {
    const list = document.getElementById('usb-devices-list');
    if (!list) return;

    const usbDrives = drives.filter(d => d.isUsb !== false);

    if (usbDrives.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔌</div>
          <p>Sin dispositivos USB detectados</p>
          <small>Conecta un dispositivo USB y presiona Escanear</small>
        </div>`;
      return;
    }

    list.innerHTML = usbDrives.map(drive => this._buildDeviceCard(drive)).join('');

    // Bind action buttons
    usbDrives.forEach(drive => {
      const id = this._driveId(drive);
      document.getElementById(`btn-protect-${id}`)?.addEventListener('click', () => this.protectDrive(drive));
      document.getElementById(`btn-unprotect-${id}`)?.addEventListener('click', () => this.unprotectDrive(drive));
    });
  },

  _buildDeviceCard(drive) {
    const id = this._driveId(drive);
    const usedPct = drive.size > 0 ? Math.round(((drive.size - drive.available) / drive.size) * 100) : 0;
    const statusClass = drive.readOnly ? 'locked' : 'unlocked';
    const statusText = drive.readOnly ? '🔒 Protegido contra escritura' : '🔓 Sin protección';
    const statusColor = drive.readOnly ? 'var(--green)' : 'var(--yellow)';

    return `
      <div class="usb-device-card" id="drive-card-${id}">
        <div class="usb-device-header">
          <div class="usb-device-name">
            💾 ${ShieldPort._esc(drive.name || drive.device || 'USB Drive')}
          </div>
          <span class="lock-anim ${statusClass}" style="color:${statusColor}">${statusText}</span>
        </div>

        <div class="usb-device-grid">
          <div class="usb-info-item">
            <span class="usb-info-label">Unidad / Ruta</span>
            <span class="usb-info-value">${ShieldPort._esc(drive.mount || drive.device || '—')}</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Sistema archivos</span>
            <span class="usb-info-value">${ShieldPort._esc(drive.fsType || '—')}</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Tamaño total</span>
            <span class="usb-info-value">${ShieldPort._formatBytes(drive.size)}</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Espacio libre</span>
            <span class="usb-info-value">${ShieldPort._formatBytes(drive.available)}</span>
          </div>
          ${drive.serial ? `
          <div class="usb-info-item">
            <span class="usb-info-label">Serial</span>
            <span class="usb-info-value">${ShieldPort._esc(drive.serial)}</span>
          </div>` : ''}
          ${drive.connectedAt ? `
          <div class="usb-info-item">
            <span class="usb-info-label">Conectado</span>
            <span class="usb-info-value">${ShieldPort._esc(drive.connectedAt)}</span>
          </div>` : ''}
        </div>

        ${drive.size > 0 ? `
        <div class="usb-storage-bar">
          <div class="usb-storage-bar-label">
            <span>Usado: ${ShieldPort._formatBytes(drive.size - drive.available)}</span>
            <span>${usedPct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${usedPct}%; background: ${usedPct > 85 ? 'linear-gradient(90deg,var(--red),#cc0033)' : 'linear-gradient(90deg,var(--cyan),var(--blue))'}"></div>
          </div>
        </div>` : ''}

        <div class="usb-device-actions">
          ${!drive.readOnly
            ? `<button class="btn btn-secondary btn-sm" id="btn-protect-${id}">🔒 Proteger</button>`
            : `<button class="btn btn-ghost btn-sm" id="btn-unprotect-${id}">🔓 Desproteger</button>`
          }
          <button class="btn btn-ghost btn-sm" onclick="ShieldPort.usb.refreshDrive('${id}')">🔄 Actualizar</button>
        </div>
      </div>
    `;
  },

  _driveId(drive) {
    return (drive.device || drive.mount || 'dev').replace(/[^a-zA-Z0-9]/g, '_');
  },

  // ── PROTECT / UNPROTECT ──────────────────────────────────
  async protectDrive(drive) {
    const confirmed = await ShieldPort.confirm(
      '🔒',
      'Proteger contra escritura',
      `¿Confirmas proteger "${drive.name || drive.device}"?\n\nEste dispositivo quedará en modo solo-lectura hasta que lo desproteja manualmente.`,
      'Proteger',
      'primary'
    );
    if (!confirmed) return;

    this.appendLog('info', `Aplicando protección en ${drive.device || drive.mount}...`);
    ShieldPort.addActivity('🔒', `Protegiendo: ${drive.name || drive.device}`);

    if (!ShieldPort.sendToAgent({ type: 'PROTECT_DRIVE', device: drive.device, mount: drive.mount })) {
      ShieldPort.showToast('warning', 'Sin conexión al agente', 'Activa el Desktop Agent para esta función');
    }
  },

  async unprotectDrive(drive) {
    const confirmed = await ShieldPort.confirm(
      '🔓',
      'Desproteger dispositivo',
      `¿Confirmas quitar la protección de "${drive.name || drive.device}"?\n\nEl dispositivo podrá ser modificado o formateado.`,
      'Desproteger',
      'danger'
    );
    if (!confirmed) return;

    this.appendLog('info', `Quitando protección de ${drive.device || drive.mount}...`);
    ShieldPort.addActivity('🔓', `Desprotegiendo: ${drive.name || drive.device}`);

    if (!ShieldPort.sendToAgent({ type: 'UNPROTECT_DRIVE', device: drive.device, mount: drive.mount })) {
      ShieldPort.showToast('warning', 'Sin conexión al agente', 'Activa el Desktop Agent para esta función');
    }
  },

  onProtectResult(msg) {
    if (msg.success) {
      ShieldPort.showToast('success', 'Protección aplicada', `El dispositivo ahora está protegido contra escritura`);
      ShieldPort.addAlert('🔒', `${msg.device} protegido correctamente`, 'success');
      this.appendLog('info', `✅ Protección aplicada correctamente en ${msg.device}`);
    } else {
      ShieldPort.showToast('error', 'Error al proteger', msg.error || 'No se pudo aplicar la protección');
      this.appendLog('error', `❌ Error al proteger: ${msg.error}`);
    }
    // Refresh drives
    setTimeout(() => ShieldPort.sendToAgent({ type: 'GET_DRIVES' }), 800);
  },

  onUnprotectResult(msg) {
    if (msg.success) {
      ShieldPort.showToast('success', 'Protección eliminada', 'El dispositivo ya puede recibir escrituras');
      ShieldPort.addAlert('🔓', `${msg.device} desprotegido`, 'warning');
      this.appendLog('info', `✅ Protección eliminada en ${msg.device}`);
    } else {
      ShieldPort.showToast('error', 'Error al desproteger', msg.error || 'No se pudo quitar la protección');
      this.appendLog('error', `❌ Error al desproteger: ${msg.error}`);
    }
    setTimeout(() => ShieldPort.sendToAgent({ type: 'GET_DRIVES' }), 800);
  },

  refreshDrive(id) {
    ShieldPort.sendToAgent({ type: 'GET_DRIVES' });
    ShieldPort.showToast('info', 'Actualizando...', 'Refrescando información del dispositivo');
  },

  // ── WEB USB (raw access in browser) ──────────────────────
  async requestWebUSB() {
    if (!ShieldPort.state.webUsbSupported) {
      ShieldPort.showToast('warning', 'WebUSB no disponible', 'Este navegador no soporta WebUSB. Usa Chrome o Edge.');
      return;
    }
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      const infoEl = document.getElementById('webusb-device-info');
      if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `
          <strong>Dispositivo:</strong> ${ShieldPort._esc(device.productName || 'Desconocido')}<br>
          <strong>Fabricante:</strong> ${ShieldPort._esc(device.manufacturerName || '—')}<br>
          <strong>VID:</strong> 0x${device.vendorId.toString(16).padStart(4,'0').toUpperCase()}<br>
          <strong>PID:</strong> 0x${device.productId.toString(16).padStart(4,'0').toUpperCase()}<br>
          <strong>Serial:</strong> ${ShieldPort._esc(device.serialNumber || '—')}<br>
          <strong>Versión USB:</strong> ${device.usbVersionMajor}.${device.usbVersionMinor}
        `;
      }
      ShieldPort.addActivity('🔌', `WebUSB: ${device.productName || 'Dispositivo conectado'}`);
      ShieldPort.showToast('success', 'Dispositivo USB', `${device.productName || 'Acceso concedido'}`);
    } catch (e) {
      if (e.name === 'NotFoundError') {
        // User cancelled — no error needed
      } else {
        ShieldPort.showToast('error', 'Error WebUSB', e.message);
      }
    }
  },

  _renderWebUsbDevices(devices) {
    const infoEl = document.getElementById('webusb-device-info');
    if (!infoEl) return;
    if (devices.length === 0) {
      infoEl.style.display = 'none';
      return;
    }
    infoEl.style.display = 'block';
    infoEl.innerHTML = devices.map(d =>
      `<div>📱 ${ShieldPort._esc(d.productName || 'USB')} — VID:0x${d.vendorId.toString(16)}</div>`
    ).join('');
  },

  // ── LOGS ──────────────────────────────────────────────────
  appendLog(level, message) {
    const time = new Date().toLocaleTimeString('es', { hour12: false });
    this._logs.unshift({ level, message, time });
    if (this._logs.length > 200) this._logs.pop();

    const logEl = document.getElementById('usb-log-entries');
    if (logEl) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      const cls = level === 'error' ? 'log-err' : level === 'warn' ? 'log-warn' : 'log-msg';
      entry.innerHTML = `<span class="log-time">${time}</span><span class="${cls}">${ShieldPort._esc(message)}</span>`;
      logEl.prepend(entry);
      // Keep max 100 visible
      while (logEl.children.length > 100) logEl.removeChild(logEl.lastChild);
    }
  },

  openLogs() {
    const panel = document.getElementById('usb-logs-panel');
    if (panel) panel.style.display = 'block';
    const logEl = document.getElementById('usb-log-entries');
    if (logEl && this._logs.length === 0) {
      logEl.innerHTML = '<div class="log-entry"><span class="log-time">—</span><span class="log-msg">Sin entradas de log aún. Realiza un escaneo.</span></div>';
    }
  },

  closeLogs() {
    const panel = document.getElementById('usb-logs-panel');
    if (panel) panel.style.display = 'none';
  },
};

// Auto-init when app is ready
document.addEventListener('DOMContentLoaded', () => ShieldPort.usb.init());
