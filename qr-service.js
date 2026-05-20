/**
 * ShieldPort v2.0 — qr-service.js
 * QR Forge: premium QR generation with qrcode.js + Canvas API
 */

ShieldPort.qr = {
  _history: [],
  _lastContent: '',

  init() {
    this._bindButtons();
    this._loadHistory();
    this._initForm('url');
    // Apply default preset
    this._applyPreset('cyber');
    // Auto-generate default QR after short delay
    setTimeout(() => this.generateQR(), 300);
  },

  _bindButtons() {
    // Type selector
    document.querySelectorAll('.qr-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qr-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._initForm(btn.dataset.type);
      });
    });

    document.getElementById('btn-generate-qr')?.addEventListener('click', () => this.generateQR());
    document.getElementById('qr-style-preset')?.addEventListener('change', e => this._applyPreset(e.target.value));

    document.getElementById('qr-size')?.addEventListener('input', e => {
      const val = document.getElementById('qr-size-val');
      if (val) val.textContent = e.target.value + 'px';
    });

    // Color hex display
    document.getElementById('qr-color-dark')?.addEventListener('input', e => {
      const hex = document.getElementById('qr-color-dark-hex');
      if (hex) hex.textContent = e.target.value;
    });
    document.getElementById('qr-color-light')?.addEventListener('input', e => {
      const hex = document.getElementById('qr-color-light-hex');
      if (hex) hex.textContent = e.target.value;
    });

    document.getElementById('btn-download-png')?.addEventListener('click', () => this.downloadQR('png'));
    document.getElementById('btn-copy-qr')?.addEventListener('click', () => this.copyToClipboard());
    document.getElementById('btn-clear-qr-history')?.addEventListener('click', () => this.clearHistory());
  },

  _initForm(type) {
    const container = document.getElementById('qr-content-form');
    if (!container) return;

    const templates = {
      url: `
        <div class="form-group">
          <label class="form-label" for="qr-url">Dirección URL</label>
          <input type="url" class="form-input" id="qr-url" placeholder="https://ejemplo.com" value="https://shieldport.io" />
        </div>`,
      text: `
        <div class="form-group">
          <label class="form-label" for="qr-text">Texto libre</label>
          <textarea class="form-textarea" id="qr-text" placeholder="Escribe tu mensaje aquí..."></textarea>
        </div>`,
      phone: `
        <div class="form-group">
          <label class="form-label" for="qr-phone">Número de teléfono</label>
          <input type="tel" class="form-input" id="qr-phone" placeholder="+1 234 567 8900" />
        </div>`,
      email: `
        <div class="form-group">
          <label class="form-label" for="qr-email">Dirección de email</label>
          <input type="email" class="form-input" id="qr-email" placeholder="correo@ejemplo.com" />
        </div>
        <div class="form-group" style="margin-top:10px;">
          <label class="form-label" for="qr-email-subject">Asunto (opcional)</label>
          <input type="text" class="form-input" id="qr-email-subject" placeholder="Asunto del email" />
        </div>`,
      wifi: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="qr-wifi-ssid">Nombre de red (SSID)</label>
            <input type="text" class="form-input" id="qr-wifi-ssid" placeholder="Mi Red WiFi" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr-wifi-security">Seguridad</label>
            <select class="form-select" id="qr-wifi-security">
              <option value="WPA">WPA/WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Sin contraseña</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-top:10px;">
          <label class="form-label" for="qr-wifi-pass">Contraseña</label>
          <input type="password" class="form-input" id="qr-wifi-pass" placeholder="Contraseña de la red" />
        </div>`,
      whatsapp: `
        <div class="form-group">
          <label class="form-label" for="qr-wa-phone">Número de WhatsApp</label>
          <input type="tel" class="form-input" id="qr-wa-phone" placeholder="+1 234 567 8900" />
        </div>
        <div class="form-group" style="margin-top:10px;">
          <label class="form-label" for="qr-wa-msg">Mensaje inicial (opcional)</label>
          <input type="text" class="form-input" id="qr-wa-msg" placeholder="Hola, te contacto desde ShieldPort..." />
        </div>`,
    };

    container.innerHTML = templates[type] || templates.url;
    container.style.marginTop = '16px';
    // Subtle fade-in
    container.style.opacity = '0';
    requestAnimationFrame(() => {
      container.style.transition = 'opacity 0.2s ease';
      container.style.opacity = '1';
    });
  },

  _getContent() {
    const activeBtn = document.querySelector('.qr-type-btn.active');
    const type = activeBtn?.dataset.type || 'url';
    const v = id => document.getElementById(id)?.value?.trim() || '';

    switch (type) {
      case 'url':
        return v('qr-url') || 'https://shieldport.io';
      case 'text':
        return v('qr-text') || 'ShieldPort';
      case 'phone':
        return `tel:${v('qr-phone')}`;
      case 'email': {
        const subject = v('qr-email-subject');
        return subject
          ? `mailto:${v('qr-email')}?subject=${encodeURIComponent(subject)}`
          : `mailto:${v('qr-email')}`;
      }
      case 'wifi': {
        const sec = v('qr-wifi-security') || 'WPA';
        return `WIFI:T:${sec};S:${v('qr-wifi-ssid')};P:${v('qr-wifi-pass')};;`;
      }
      case 'whatsapp': {
        const phone = v('qr-wa-phone').replace(/\D/g, '');
        const msg   = encodeURIComponent(v('qr-wa-msg'));
        return msg ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/${phone}`;
      }
      default:
        return v('qr-url') || 'https://shieldport.io';
    }
  },

  _applyPreset(preset) {
    const customFields = document.getElementById('custom-design-fields');
    if (preset === 'custom') {
      if (customFields) customFields.style.display = 'block';
      return;
    }
    if (customFields) customFields.style.display = 'none';

    const presets = {
      cyber:  { dark: '#2af0ff', light: '#0a0b0f' },
      ocean:  { dark: '#3b82f6', light: '#0c1020' },
      matrix: { dark: '#10f28b', light: '#000000' },
      fire:   { dark: '#f43f5e', light: '#1a0508' },
      purple: { dark: '#a855f7', light: '#10061c' },
    };

    const p = presets[preset];
    if (p) {
      const darkEl  = document.getElementById('qr-color-dark');
      const lightEl = document.getElementById('qr-color-light');
      const darkHex  = document.getElementById('qr-color-dark-hex');
      const lightHex = document.getElementById('qr-color-light-hex');
      if (darkEl)  darkEl.value  = p.dark;
      if (lightEl) lightEl.value = p.light;
      if (darkHex)  darkHex.textContent  = p.dark;
      if (lightHex) lightHex.textContent = p.light;
    }
  },

  generateQR() {
    const content = this._getContent();
    if (!content) {
      ShieldPort.showToast('warning', 'Campo vacío', 'Por favor ingresa contenido para el QR');
      return;
    }

    this._lastContent = content;

    const size  = parseInt(document.getElementById('qr-size')?.value || '256', 10);
    const dark  = document.getElementById('qr-color-dark')?.value  || '#2af0ff';
    const light = document.getElementById('qr-color-light')?.value || '#0a0b0f';
    const ecl   = document.getElementById('qr-ecl')?.value || 'M';
    const glow  = document.getElementById('qr-glow-toggle')?.checked ?? true;

    const previewArea = document.getElementById('qr-preview-area');
    if (!previewArea) return;

    previewArea.innerHTML = '<div id="qr-canvas-wrapper"></div>';
    previewArea.classList.add('has-qr');

    const wrapper = document.getElementById('qr-canvas-wrapper');
    if (glow) {
      wrapper.classList.add('glow-effect');
      wrapper.style.boxShadow = `0 0 24px ${dark}66, 0 0 64px ${dark}33`;
    }

    try {
      new QRCode(wrapper, {
        text: content,
        width: size,
        height: size,
        colorDark: dark,
        colorLight: light,
        correctLevel: QRCode.CorrectLevel[ecl] ?? QRCode.CorrectLevel.M,
      });

      // Show export + badge
      const exportEl = document.getElementById('qr-export-actions');
      const badgeEl  = document.getElementById('qr-scannable-badge');
      if (exportEl) exportEl.style.display = 'flex';
      if (badgeEl)  badgeEl.style.display  = 'inline-flex';

      this._addToHistory(content);
      ShieldPort.addActivity('qr', 'QR generado');
      ShieldPort.showToast('success', 'QR listo', 'Código generado correctamente');

    } catch (e) {
      previewArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></div>
          <p class="empty-title">Error al generar</p>
          <p class="empty-subtitle">${ShieldPort._esc(e.message)}</p>
        </div>`;
      ShieldPort.showToast('error', 'Error al generar QR', e.message);
    }
  },

  _addToHistory(content) {
    const type = document.querySelector('.qr-type-btn.active')?.dataset.type || 'url';
    // Avoid duplicates
    if (this._history.length > 0 && this._history[0].content === content) return;

    const entry = {
      id: Date.now(),
      type,
      content,
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    };

    this._history.unshift(entry);
    if (this._history.length > 12) this._history.pop();
    this._saveHistory();
    this._renderHistory();
  },

  _loadHistory() {
    try {
      const stored = localStorage.getItem('shieldport_qr_history_v2');
      if (stored) this._history = JSON.parse(stored);
      this._renderHistory();
    } catch (e) {}
  },

  _saveHistory() {
    try {
      localStorage.setItem('shieldport_qr_history_v2', JSON.stringify(this._history));
    } catch (e) {}
  },

  _renderHistory() {
    const list = document.getElementById('qr-history-list');
    if (!list) return;

    if (this._history.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
          </div>
          <p class="empty-title">Sin historial</p>
          <p class="empty-subtitle">Los QR generados aparecerán aquí</p>
        </div>`;
      return;
    }

    list.innerHTML = this._history.map(h => `
      <div class="qr-history-item" role="button" tabindex="0" onclick="ShieldPort.qr.restoreHistory('${h.id}')">
        <div class="qr-history-thumb">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
          </svg>
        </div>
        <div class="qr-history-info">
          <div class="qr-history-type">${ShieldPort._esc(h.type)}</div>
          <div class="qr-history-content">${ShieldPort._esc(h.content)}</div>
        </div>
        <div class="qr-history-time">${h.time}</div>
      </div>`).join('');
  },

  restoreHistory(id) {
    const entry = this._history.find(h => h.id.toString() === id.toString());
    if (!entry) return;

    // Switch type tab
    const btn = document.querySelector(`.qr-type-btn[data-type="${entry.type}"]`);
    if (btn) btn.click();
    else {
      const firstBtn = document.querySelector('.qr-type-btn');
      if (firstBtn) firstBtn.click();
    }

    setTimeout(() => {
      // Try to fill the main input
      const fieldIds = { url: 'qr-url', text: 'qr-text', phone: 'qr-phone', email: 'qr-email', whatsapp: 'qr-wa-phone' };
      const fid = fieldIds[entry.type];
      if (fid) {
        const el = document.getElementById(fid);
        if (el) el.value = entry.content;
      }
      this.generateQR();
    }, 120);
  },

  clearHistory() {
    this._history = [];
    this._saveHistory();
    this._renderHistory();
    ShieldPort.showToast('info', 'Historial borrado', 'Historial de QR eliminado');
  },

  downloadQR(format) {
    const canvas = document.querySelector('#qr-canvas-wrapper canvas');
    if (!canvas) {
      ShieldPort.showToast('warning', 'Sin QR', 'Genera un código QR primero');
      return;
    }

    if (format === 'png') {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `shieldport-qr-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      ShieldPort.showToast('success', 'Descarga iniciada', 'Imagen PNG guardada');
    }
  },

  copyToClipboard() {
    const canvas = document.querySelector('#qr-canvas-wrapper canvas');
    if (!canvas) {
      ShieldPort.showToast('warning', 'Sin QR', 'Genera un código QR primero');
      return;
    }

    canvas.toBlob(blob => {
      if (!blob) return;
      try {
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]).then(() => {
          ShieldPort.showToast('success', 'Copiado', 'QR copiado al portapapeles');
        }).catch(() => {
          ShieldPort.showToast('error', 'Error al copiar', 'El navegador bloqueó el acceso al portapapeles');
        });
      } catch (e) {
        ShieldPort.showToast('error', 'No soportado', 'Tu navegador no soporta copiar imágenes');
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => ShieldPort.qr.init());
