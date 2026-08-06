/**
 * ShieldPort v2.0 — format-ui.js
 * Controls the USB formatting section
 */

const USBFormatUI = {
  elements: {},
  isFormatting: false,

  init() {
    this.elements = {
      deviceSelect:     document.getElementById('format-device-select'),
      fsSelect:         document.getElementById('format-fs-select'),
      forceCheckbox:    document.getElementById('format-force-checkbox'),
      warningBox:       document.getElementById('format-clean-warning'),
      executeBtn:       document.getElementById('btn-format-execute'),
      statusIdle:       document.getElementById('format-status-idle'),
      statusProcessing: document.getElementById('format-status-processing'),
      processTitle:     document.getElementById('format-process-title'),
      terminal:         document.getElementById('format-terminal'),
      agentNotice:      document.getElementById('format-agent-notice'),
      viewLogsBtn:      document.getElementById('btn-view-format-logs')
    };

    if (!this.elements.executeBtn) return;

    this.elements.forceCheckbox.addEventListener('change', (e) => {
      this.elements.warningBox.style.display = e.target.checked ? 'block' : 'none';
      if (e.target.checked) {
        this.elements.executeBtn.classList.remove('btn-danger');
        this.elements.executeBtn.classList.add('btn-primary'); // Highlight warning changes
        this.elements.executeBtn.style.background = '#ef4444'; // Force solid red
      } else {
        this.elements.executeBtn.classList.remove('btn-primary');
        this.elements.executeBtn.classList.add('btn-danger');
        this.elements.executeBtn.style.background = '';
      }
    });

    this.elements.executeBtn.addEventListener('click', () => this.confirmAndExecute());
    this.elements.deviceSelect.addEventListener('change', () => this.updateButtonState());
    
    this.elements.viewLogsBtn.addEventListener('click', () => {
      const show = this.elements.terminal.style.display === 'none';
      this.elements.terminal.style.display = show ? 'block' : 'none';
      this.elements.viewLogsBtn.textContent = show ? 'Ocultar Logs' : 'Ver Logs';
    });

    this.updateButtonState();
    this.checkAgentNotice();
  },

  checkAgentNotice() {
    const connected = ShieldPort.state.agentConnected;
    if (this.elements.agentNotice) {
      this.elements.agentNotice.style.display = connected ? 'none' : 'flex';
    }
    this.updateButtonState();
  },

  updateButtonState() {
    const hasDevice = this.elements.deviceSelect.value !== '';
    const agentConnected = ShieldPort.state.agentConnected;
    this.elements.executeBtn.disabled = !hasDevice || !agentConnected || this.isFormatting;
  },

  onShow() {
    this.checkAgentNotice();
    if (ShieldPort.state.agentConnected) {
      ShieldPort.sendToAgent({ type: 'GET_DRIVES' });
    }
  },

  updateDrivesList(drives) {
    const select = this.elements.deviceSelect;
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Selecciona una Unidad USB --</option>';

    const usbDrives = drives.filter(d => d.isUsb);

    if (usbDrives.length === 0) {
      select.innerHTML = '<option value="">Ninguna unidad USB detectada</option>';
    } else {
      usbDrives.forEach(d => {
        const sizeGb = (d.size / (1024 * 1024 * 1024)).toFixed(1);
        const freeGb = (d.available / (1024 * 1024 * 1024)).toFixed(1);
        const name = d.name || 'Unidad Externa';
        const option = document.createElement('option');
        option.value = d.device;
        option.textContent = `${d.device}\\ (${name}) — ${sizeGb} GB (${freeGb} GB libres)`;
        select.appendChild(option);
      });
    }

    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
      select.value = currentVal;
    }
    this.updateButtonState();
  },

  async confirmAndExecute() {
    if (this.isFormatting) return;

    const driveId = this.elements.deviceSelect.value;
    const fileSystem = this.elements.fsSelect.value;
    const forceClean = this.elements.forceCheckbox.checked;

    if (!driveId) return;

    let warningMsg = `¿Estás seguro de que quieres formatear la unidad ${driveId} en ${fileSystem}? Todos los datos se perderán para siempre.`;
    if (forceClean) {
      warningMsg = `¡ADVERTENCIA CRÍTICA! Se realizará un "WIPE TOTAL" (diskpart clean) de la unidad ${driveId}. Se eliminará toda la estructura de particiones antes de formatear en ${fileSystem}. Asegúrate de que no es tu disco duro principal.`;
    }

    const confirmed = await ShieldPort.confirm(
      forceClean ? 'FORMATEO FORZADO (CLEAN)' : 'Formatear USB',
      warningMsg,
      forceClean ? 'SÍ, BORRAR TODO' : 'Formatear',
      'danger'
    );

    if (!confirmed) return;

    // Start UI processing state
    this.isFormatting = true;
    this.updateButtonState();
    
    this.elements.statusIdle.style.display = 'none';
    this.elements.statusProcessing.style.display = 'flex';
    this.elements.terminal.style.display = 'block';
    this.elements.viewLogsBtn.textContent = 'Ocultar Logs';
    this.elements.processTitle.textContent = forceClean ? 'Realizando limpieza profunda (diskpart clean)...' : 'Formateando unidad...';

    this.clearLogs();
    this.appendLog('info', `Iniciando formateo de ${driveId}...`);
    this.appendLog('info', `FileSystem destino: ${fileSystem}`);
    this.appendLog('info', `Modo Forzado: ${forceClean ? 'SÍ' : 'NO'}`);

    ShieldPort.sendToAgent({
      type: 'FORMAT_DRIVE',
      driveId,
      fileSystem,
      forceClean
    });
  },

  onFormatResult(msg) {
    this.isFormatting = false;
    this.elements.statusProcessing.style.display = 'none';
    this.elements.statusIdle.style.display = 'flex';
    this.updateButtonState();

    if (msg.success) {
      ShieldPort.showToast('success', 'Formateo Exitoso', msg.message);
      this.appendLog('success', msg.message);
      ShieldPort.state.activityLog.unshift({
        type: 'success',
        title: 'USB Formateado',
        text: `Unidad ${msg.driveId} formateada correctamente`,
        time: new Date().toLocaleTimeString()
      });
    } else {
      ShieldPort.showToast('error', 'Error al Formatear', msg.message);
      this.appendLog('error', msg.message);
      ShieldPort.state.activityLog.unshift({
        type: 'error',
        title: 'Fallo al Formatear',
        text: msg.message,
        time: new Date().toLocaleTimeString()
      });
    }

    // Refresh drives list
    setTimeout(() => {
      if (ShieldPort.state.agentConnected) {
        ShieldPort.sendToAgent({ type: 'GET_DRIVES' });
      }
    }, 2000);
  },

  clearLogs() {
    if (this.elements.terminal) {
      this.elements.terminal.innerHTML = '<div class="log-line text-muted">// Logs del formateador forzado</div>';
    }
  },

  appendLog(level, message) {
    const terminal = this.elements.terminal;
    if (!terminal) return;

    const time = new Date().toLocaleTimeString('es', { hour12: false });
    const logLine = document.createElement('div');
    logLine.className = `log-line text-${level}`;
    logLine.innerHTML = `<span style="color:var(--text-muted)">[${time}]</span> <span class="log-level">[${level.toUpperCase()}]</span> ${message}`;
    terminal.appendChild(logLine);
    terminal.scrollTop = terminal.scrollHeight;
  }
};

// Auto initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  USBFormatUI.init();
  window.USBFormatUI = USBFormatUI;
});
