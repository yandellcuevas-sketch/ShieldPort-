/**
 * ShieldPort v2.0 — usb-ui.js
 * USB Shield: device detection, write-protect, logs
 */

ShieldPort.usb = {
  _logs: [],
  _scanning: false,
  _blPollers: {},  // active BitLocker status polling timers

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
      
      // Request BitLocker status
      if (ShieldPort.state.agentConnected) {
        ShieldPort.sendToAgent({ type: 'GET_BITLOCKER_STATUS', driveId: drive.device });
      }
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
            <span class="usb-info-label">Cifrado (BitLocker)</span>
            <span class="usb-info-value" id="bl-status-${id}">Cargando...</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Tamaño Total</span>
            <span class="usb-info-value">${ShieldPort._formatBytes(totalBytes)}</span>
          </div>
          <div class="usb-info-item">
            <span class="usb-info-label">Espacio Libre</span>
            <span class="usb-info-value">${ShieldPort._formatBytes(freeBytes)}</span>
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
          <button class="btn btn-ghost btn-sm" onclick="ShieldPort.explorer.open('${drive.device || drive.mount}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            Explorar archivos
          </button>
        </div>

        <div class="usb-device-actions usb-password-actions" style="margin-top:8px; border-top:1px solid var(--line); padding-top:10px; gap:8px; flex-wrap:wrap;">
          <div style="font-size:11px;color:var(--text-2);display:flex;align-items:center;gap:5px;width:100%;margin-bottom:2px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Contraseña (BitLocker): <span id="bl-status-${id}" style="color:var(--text-1);font-weight:500;">—</span>
          </div>
          <div id="bl-actions-${id}" style="display:flex; gap:8px; flex-wrap:wrap; width:100%;"></div>
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

  // ── BITLOCKER ───────────────────────────────────────────
  updateBitlockerStatus(msg) {
    const id = (msg.driveId || '').replace(/[^a-zA-Z0-9]/g, '_');
    const statusEl = document.getElementById(`bl-status-${id}`);
    const actionsEl = document.getElementById(`bl-actions-${id}`);
    if (!statusEl || !actionsEl) return;

    actionsEl.style.display = 'flex';

    // Store current status for smartRemovePassword
    if (statusEl) statusEl.dataset.blStatus = msg.locked ? 'Locked' : msg.status;

    // Stop any existing poller for this drive
    if (this._blPollers[msg.driveId]) {
      clearInterval(this._blPollers[msg.driveId]);
      delete this._blPollers[msg.driveId];
    }

    if (msg.status === 'Unencrypted') {
       statusEl.innerHTML = `<span style="color:var(--text-2)">Sin contraseña</span>`;
       actionsEl.innerHTML = `
         <button class="btn btn-ghost btn-sm" style="color:var(--purple);border-color:rgba(168,85,247,0.3);" onclick="ShieldPort.usb.enableBitlocker('${msg.driveId}')">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
             <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
           </svg>
           Poner Contraseña
         </button>
         <button class="btn btn-ghost btn-sm" style="color:var(--text-muted);border-color:var(--border);opacity:0.4;cursor:not-allowed;" disabled>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
             <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
             <line x1="17" y1="7" x2="23" y2="13"/><line x1="23" y1="7" x2="17" y2="13"/>
           </svg>
           Eliminar Contraseña
         </button>
       `;
    } else if (msg.status === 'Encrypting' || msg.status === 'Decrypting') {
       const label = msg.status === 'Encrypting' ? 'Cifrando' : 'Descifrando';
       statusEl.innerHTML = `<span style="color:var(--accent)">${label}... <span id="bl-pct-${id}"></span></span>`;
       actionsEl.innerHTML = `
         <button class="btn btn-ghost btn-sm" style="color:var(--accent);border-color:rgba(42,240,255,0.3);opacity:0.7;cursor:wait;" disabled>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13" class="animate-spin">
             <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67"/>
           </svg>
           ${label}...
         </button>
         <button class="btn btn-ghost btn-sm" style="color:var(--text-muted);border-color:var(--border);opacity:0.4;cursor:not-allowed;" disabled>
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
             <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
             <line x1="17" y1="7" x2="23" y2="13"/><line x1="23" y1="7" x2="17" y2="13"/>
           </svg>
           Eliminar Contraseña
         </button>
       `;

       // Auto-poll every 4 seconds until finished
       this._blPollers[msg.driveId] = setInterval(() => {
         ShieldPort.sendToAgent({ type: 'GET_BITLOCKER_STATUS', driveId: msg.driveId });
       }, 4000);

    } else if (msg.status === 'Encrypted') {
       if (msg.locked) {
         statusEl.innerHTML = `<span class="badge badge-red">🔒 Bloqueado</span>`;
         actionsEl.innerHTML = `
           <button class="btn btn-primary btn-sm" onclick="ShieldPort.usb.unlockBitlocker('${msg.driveId}')">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
               <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
             </svg>
             Desbloquear
           </button>
           <button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(240,82,82,0.3);" onclick="ShieldPort.usb.removePassword('${msg.driveId}')">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
               <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
               <line x1="17" y1="7" x2="23" y2="13"/><line x1="23" y1="7" x2="17" y2="13"/>
             </svg>
             Eliminar Contraseña
           </button>
         `;
       } else {
         statusEl.innerHTML = `<span style="background:rgba(168,85,247,0.15);color:#c084fc;padding:2px 8px;border-radius:5px;font-size:12px;">🔓 Con Contraseña</span>`;
         actionsEl.innerHTML = `
           <button class="btn btn-ghost btn-sm" style="color:var(--text-muted);border-color:var(--border);opacity:0.4;cursor:not-allowed;" disabled>
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
               <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
             </svg>
             Poner Contraseña
           </button>
           <button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(240,82,82,0.3);" onclick="ShieldPort.usb.disableBitlocker('${msg.driveId}')">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
               <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>
               <line x1="17" y1="7" x2="23" y2="13"/><line x1="23" y1="7" x2="17" y2="13"/>
             </svg>
             Eliminar Contraseña
           </button>
         `;
       }
    }
  },

  async enableBitlocker(driveId) {
    const pw = await ShieldPort.promptPassword(
      'Poner Contraseña', 
      'Cifrará el espacio usado del USB con contraseña. Asegúrate de no olvidarla.',
      true
    );
    if (!pw) return;
    ShieldPort.showToast('info', 'Iniciando...', 'Configurando contraseña. No desconectes el USB.');
    ShieldPort.sendToAgent({ type: 'ENABLE_BITLOCKER', driveId, password: pw });
  },

  async unlockBitlocker(driveId) {
    const pw = await ShieldPort.promptPassword(
      'Desbloquear USB', 
      'Ingresa tu contraseña para acceder a los archivos del USB.',
      false
    );
    if (!pw) return;
    ShieldPort.showToast('info', 'Desbloqueando...', 'Verificando contraseña');
    ShieldPort.sendToAgent({ type: 'UNLOCK_BITLOCKER', driveId, password: pw });
  },

  async disableBitlocker(driveId) {
    const confirmed = await ShieldPort.confirm(
      'Eliminar Contraseña',
      '¿Estás seguro? El USB quedará sin protección. El descifrado puede tardar unos minutos.',
      'Sí, Eliminar', 'danger'
    );
    if (!confirmed) return;
    ShieldPort.showToast('info', 'Eliminando contraseña...', 'No desconectes el USB.');
    ShieldPort.sendToAgent({ type: 'DISABLE_BITLOCKER', driveId });
  },

  // Eliminar contraseña desde estado BLOQUEADO (desbloquea primero, luego desactiva)
  async removePassword(driveId) {
    const pw = await ShieldPort.promptPassword(
      'Eliminar Contraseña',
      'Para eliminar la protección necesitas confirmar tu contraseña actual.',
      false
    );
    if (!pw) return;

    const confirmed = await ShieldPort.confirm(
      '¿Eliminar la contraseña?',
      `El USB ${driveId} quedará completamente desprotegido y accesible sin contraseña.`,
      'Sí, Eliminar', 'danger'
    );
    if (!confirmed) return;

    ShieldPort.showToast('info', 'Desbloqueando...', 'Verificando contraseña.');
    ShieldPort.sendToAgent({ type: 'UNLOCK_THEN_DISABLE', driveId, password: pw });
  },

  // Detecta estado actual y elimina contraseña inteligentemente
  async smartRemovePassword(driveId) {
    const id = driveId.replace(/[^a-zA-Z0-9]/g, '_');
    const statusEl = document.getElementById(`bl-status-${id}`);
    const currentStatus = statusEl?.dataset?.blStatus || '';

    if (currentStatus === 'Unencrypted' || currentStatus === '') {
      ShieldPort.showToast('info', 'Sin contraseña', 'Este USB no tiene contraseña BitLocker activa.');
      return;
    }
    if (currentStatus === 'Encrypting' || currentStatus === 'Decrypting') {
      ShieldPort.showToast('warning', 'Proceso en curso', 'Espera a que termine el proceso actual antes de eliminar.');
      return;
    }
    if (currentStatus === 'Locked') {
      await this.removePassword(driveId);
    } else {
      await this.disableBitlocker(driveId);
    }
  },

  onBitlockerResult(msg) {
    if (msg.success) {
      ShieldPort.showToast('success', 'Éxito', msg.message);
    } else {
      ShieldPort.showToast('error', 'Error', msg.message);
    }
    // Refresh status shortly after
    setTimeout(() => {
      ShieldPort.sendToAgent({ type: 'GET_BITLOCKER_STATUS', driveId: msg.driveId });
    }, 1500);
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
