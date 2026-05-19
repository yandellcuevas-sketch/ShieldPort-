/**
 * ShieldPort — qr-service.js
 * QR Forge module: premium QR generation using qrcode.js + Canvas API
 */

ShieldPort.qr = {
  _qrcode: null,
  _lastContent: '',
  _history: [],

  init() {
    this._bindButtons();
    this._loadHistory();
    this._initForm('url');
    // Generar primer QR por defecto
    setTimeout(() => this.generateQR(), 200);
  },

  _bindButtons() {
    document.querySelectorAll('.qr-type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.qr-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._initForm(btn.dataset.type);
      });
    });

    document.getElementById('btn-generate-qr')?.addEventListener('click', () => this.generateQR());
    document.getElementById('qr-style-preset')?.addEventListener('change', (e) => this._applyPreset(e.target.value));
    
    document.getElementById('qr-size')?.addEventListener('input', (e) => {
      document.getElementById('qr-size-val').textContent = e.target.value + 'px';
    });
    
    document.getElementById('qr-margin')?.addEventListener('input', (e) => {
      document.getElementById('qr-margin-val').textContent = e.target.value;
    });

    document.getElementById('btn-download-png')?.addEventListener('click', () => this.downloadQR('png'));
    document.getElementById('btn-download-svg')?.addEventListener('click', () => this.downloadQR('svg'));
    document.getElementById('btn-copy-qr')?.addEventListener('click', () => this.copyToClipboard());
    document.getElementById('btn-clear-qr-history')?.addEventListener('click', () => this.clearHistory());
  },

  _initForm(type) {
    const container = document.getElementById('qr-content-form');
    if (!container) return;

    // Use same templates as NFC, but adapt for QR if needed. 
    // Since NFC is removed, we'll redefine the fields here.
    const templates = {
      url: `
        <div class="form-group">
          <label class="form-label" for="qr-url">URL</label>
          <input type="url" class="form-input" id="qr-url" placeholder="https://ejemplo.com" value="https://shieldport.local" />
        </div>`,
      text: `
        <div class="form-group">
          <label class="form-label" for="qr-text">Texto libre</label>
          <textarea class="form-textarea" id="qr-text" placeholder="Escribe tu mensaje..."></textarea>
        </div>`,
      phone: `
        <div class="form-group">
          <label class="form-label" for="qr-phone">Número de teléfono</label>
          <input type="tel" class="form-input" id="qr-phone" placeholder="+1234567890" />
        </div>`,
      email: `
        <div class="form-group">
          <label class="form-label" for="qr-email">Email</label>
          <input type="email" class="form-input" id="qr-email" placeholder="correo@ejemplo.com" />
        </div>`,
      contact: `
        <div class="form-group">
          <label class="form-label" for="qr-contact-name">Nombre</label>
          <input type="text" class="form-input" id="qr-contact-name" placeholder="Nombre Apellido" />
        </div>
        <div class="form-group">
          <label class="form-label" for="qr-contact-phone">Teléfono</label>
          <input type="tel" class="form-input" id="qr-contact-phone" />
        </div>`,
      wifi: `
        <div class="form-group">
          <label class="form-label" for="qr-wifi-ssid">Nombre de red (SSID)</label>
          <input type="text" class="form-input" id="qr-wifi-ssid" placeholder="Mi Red WiFi" />
        </div>
        <div class="form-group">
          <label class="form-label" for="qr-wifi-pass">Contraseña</label>
          <input type="password" class="form-input" id="qr-wifi-pass" />
        </div>`,
      location: `
        <div class="form-group">
          <label class="form-label" for="qr-lat">Latitud</label>
          <input type="number" class="form-input" id="qr-lat" placeholder="-34.6037" step="any" />
        </div>
        <div class="form-group">
          <label class="form-label" for="qr-lon">Longitud</label>
          <input type="number" class="form-input" id="qr-lon" placeholder="-58.3816" step="any" />
        </div>`,
      whatsapp: `
        <div class="form-group">
          <label class="form-label" for="qr-wa-phone">WhatsApp</label>
          <input type="tel" class="form-input" id="qr-wa-phone" placeholder="Código país + número" />
        </div>`,
      custom: `
        <div class="form-group">
          <label class="form-label" for="qr-custom-data">Datos</label>
          <textarea class="form-textarea" id="qr-custom-data" placeholder="Datos custom..."></textarea>
        </div>`
    };

    container.innerHTML = templates[type] || templates.text;
    container.style.animation = 'none';
    requestAnimationFrame(() => container.style.animation = 'sectionFadeIn 0.2s ease');
  },

  _getContent() {
    const activeBtn = document.querySelector('.qr-type-btn.active');
    const type = activeBtn ? activeBtn.dataset.type : 'text';
    const v = (id) => document.getElementById(id)?.value?.trim() || '';

    switch (type) {
      case 'url': return v('qr-url') || 'https://shieldport.local';
      case 'text': return v('qr-text') || 'ShieldPort QR';
      case 'phone': return `tel:${v('qr-phone')}`;
      case 'email': return `mailto:${v('qr-email')}`;
      case 'contact': return `BEGIN:VCARD\nVERSION:3.0\nFN:${v('qr-contact-name')}\nTEL:${v('qr-contact-phone')}\nEND:VCARD`;
      case 'wifi': return `WIFI:T:WPA;S:${v('qr-wifi-ssid')};P:${v('qr-wifi-pass')};;`;
      case 'location': return `geo:${v('qr-lat')},${v('qr-lon')}`;
      case 'whatsapp': return `https://wa.me/${v('qr-wa-phone').replace(/\D/g, '')}`;
      case 'custom': return v('qr-custom-data');
    }
    return '';
  },

  _applyPreset(preset) {
    const customFields = document.getElementById('custom-design-fields');
    if (preset === 'custom') {
      customFields.style.display = 'block';
      return;
    }
    
    customFields.style.display = 'none';
    const presets = {
      cyber: { dark: '#2af0ff', light: '#0a0b0f' },
      ocean: { dark: '#0099ff', light: '#10121a' },
      matrix: { dark: '#00ff9d', light: '#000000' },
      fire: { dark: '#ff4d6d', light: '#1a0b0d' },
      purple: { dark: '#a855f7', light: '#13081c' },
    };

    const p = presets[preset];
    if (p) {
      document.getElementById('qr-color-dark').value = p.dark;
      document.getElementById('qr-color-light').value = p.light;
    }
  },

  generateQR() {
    const content = this._getContent();
    if (!content) {
      ShieldPort.showToast('warning', 'Campos vacíos', 'Por favor llena los campos necesarios.');
      return;
    }

    this._lastContent = content;
    const size = parseInt(document.getElementById('qr-size').value, 10);
    const dark = document.getElementById('qr-color-dark').value;
    const light = document.getElementById('qr-color-light').value;
    const ecl = document.getElementById('qr-ecl').value;
    const glow = document.getElementById('qr-glow-toggle').checked;

    const previewArea = document.getElementById('qr-preview-area');
    previewArea.innerHTML = '<div id="qr-canvas-wrapper"></div>';
    
    const wrapper = document.getElementById('qr-canvas-wrapper');
    if (glow) {
      wrapper.classList.add('glow-effect');
      // Update glow color dynamically
      wrapper.style.boxShadow = \`0 0 20px \${dark}80, 0 0 60px \${dark}40\`;
    }

    this._qrcode = new QRCode(wrapper, {
      text: content,
      width: size,
      height: size,
      colorDark: dark,
      colorLight: light,
      correctLevel: QRCode.CorrectLevel[ecl]
    });

    previewArea.classList.add('has-qr');
    document.getElementById('qr-export-actions').style.display = 'flex';
    document.getElementById('qr-scannable-badge').style.display = 'inline-flex';

    this._addToHistory(content);
    ShieldPort.addActivity('🔷', 'QR generado');
  },

  _addToHistory(content) {
    const type = document.querySelector('.qr-type-btn.active')?.dataset.type || 'text';
    const entry = {
      id: Date.now(),
      type,
      content,
      time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    };
    
    // Avoid duplicates in history
    if (this._history.length > 0 && this._history[0].content === content) return;

    this._history.unshift(entry);
    if (this._history.length > 10) this._history.pop();
    this._saveHistory();
    this._renderHistory();
  },

  _loadHistory() {
    try {
      const stored = localStorage.getItem('shieldport_qr_history');
      if (stored) this._history = JSON.parse(stored);
      this._renderHistory();
    } catch(e) {}
  },

  _saveHistory() {
    localStorage.setItem('shieldport_qr_history', JSON.stringify(this._history));
  },

  _renderHistory() {
    const list = document.getElementById('qr-history-list');
    if (!list) return;

    if (this._history.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔷</div><p>Sin QR generados aún</p></div>';
      return;
    }

    list.innerHTML = this._history.map(h => \`
      <div class="qr-history-item" onclick="ShieldPort.qr.restoreHistory('\${h.id}')">
        <div class="qr-history-thumb">🔷</div>
        <div class="qr-history-info">
          <div class="qr-history-type">\${h.type}</div>
          <div class="qr-history-content">\${ShieldPort._esc(h.content)}</div>
        </div>
        <div class="qr-history-time">\${h.time}</div>
      </div>
    \`).join('');
  },

  restoreHistory(id) {
    const entry = this._history.find(h => h.id.toString() === id);
    if (!entry) return;

    const btn = document.querySelector(\`.qr-type-btn[data-type="\${entry.type}"]\`);
    if (btn) btn.click();
    
    // Tiny delay to let form render
    setTimeout(() => {
      const fieldId = \`qr-\${entry.type === 'url' || entry.type === 'text' || entry.type === 'phone' || entry.type === 'email' ? entry.type : 'custom-data'}\`;
      const field = document.getElementById(fieldId);
      if (field) field.value = entry.content;
      this.generateQR();
    }, 100);
  },

  clearHistory() {
    this._history = [];
    this._saveHistory();
    this._renderHistory();
  },

  downloadQR(format) {
    const canvas = document.querySelector('#qr-canvas-wrapper canvas');
    if (!canvas) return;

    if (format === 'png') {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = \`shieldport-qr-\${Date.now()}.png\`;
      a.click();
      ShieldPort.showToast('success', 'Descarga completada', 'Imagen PNG guardada');
    } else if (format === 'svg') {
      // Very basic SVG export workaround since qrcode.js uses canvas
      ShieldPort.showToast('warning', 'Formato no soportado', 'La exportación nativa a SVG requiere una librería diferente. Usar PNG.');
    }
  },

  copyToClipboard() {
    const canvas = document.querySelector('#qr-canvas-wrapper canvas');
    if (!canvas) return;

    canvas.toBlob(blob => {
      if (!blob) return;
      try {
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]).then(() => {
          ShieldPort.showToast('success', 'QR Copiado', 'Imagen copiada al portapapeles');
        }).catch(() => {
          ShieldPort.showToast('error', 'Error al copiar', 'El navegador bloqueó el acceso al portapapeles');
        });
      } catch(e) {
        ShieldPort.showToast('error', 'No soportado', 'Tu navegador no soporta ClipboardItem');
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => ShieldPort.qr.init());
