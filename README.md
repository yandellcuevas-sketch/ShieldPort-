<div align="center">
  <img src="https://raw.githubusercontent.com/yandellcuevas-sketch/ShieldPort-/main/frontend/assets/logo.png" alt="ShieldPort Logo" width="120" />
  <h1>🛡️ ShieldPort</h1>
  <p><strong>Plataforma profesional de seguridad USB y generación de QR premium.</strong></p>
  <p>Diseño Cyber Security Futurista • WebSockets • Desktop Agent • Glassmorphism</p>
</div>

---

## 🚀 Arquitectura del Proyecto
ShieldPort está construido con una arquitectura de 3 capas para evadir las restricciones de seguridad (sandboxing) del navegador, permitiendo modificaciones de disco a nivel del sistema operativo.

1. **Frontend (Web App)**: Interfaz de usuario moderna, creada con Vanilla JS y CSS, animaciones interactivas (particles background) y diseño oscuro premium (Cyber Neon).
2. **Desktop Agent**: Un daemon en Node.js que corre en la PC local. Se comunica con el navegador mediante **WebSockets** y ejecuta comandos del sistema (`diskpart`, `drivelist`).
3. **Backend Local**: Un servidor estático super ligero (`Express`) para servir la interfaz web.

## 🛠️ Características Principales

*   **🔌 USB Shield**: Escaneo en tiempo real de unidades extraíbles. Permite aplicar protección contra escritura (read-only) directo al hardware (vía bit de protección GPT/MBR en Windows) para evitar robo de datos o infección por malware.
*   **🔷 QR Forge**: Generador avanzado de códigos QR con presets de diseño (Cyber Neon, Matrix Green, Fire Alert), opciones de corrección de error y descargas en PNG.
*   **📊 Dashboard Interactivo**: Panel de monitoreo que verifica constantemente la conexión del Desktop Agent y muestra el estado de seguridad global en tiempo real.

## 📦 Instalación y Uso

### 1. Requisitos Previos
- [Node.js](https://nodejs.org/) v16 o superior.
- En Windows, es **obligatorio** correr el Desktop Agent desde una terminal con **Privilegios de Administrador** para que `diskpart` pueda modificar los permisos USB.

### 2. Iniciar el Desktop Agent
El agente expone un servidor WebSocket en el puerto `8765`.
\`\`\`bash
cd desktop-agent
npm install
npm start
\`\`\`

### 3. Iniciar la Interfaz Web
\`\`\`bash
cd backend
npm install
npm start
\`\`\`
Navega a [http://localhost:3000](http://localhost:3000) en tu navegador preferido.

## 📁 Estructura del Código
\`\`\`
ShieldPort/
├── backend/            # Servidor web estático
│   ├── package.json
│   └── server.js
├── desktop-agent/      # Agente WebSocket Node.js
│   ├── package.json
│   ├── main.js         # WS Server
│   └── usb-service.js  # Lógica de discos y Diskpart
├── docs/               # Documentación
├── frontend/           # Interfaz de usuario (Vanilla JS/CSS)
│   ├── index.html
│   ├── style.css
│   ├── app.js          # Core, Websocket client, Particles
│   ├── qr-service.js   # Generador de QR
│   └── usb-ui.js       # Lógica UI de USB Shield
└── README.md
\`\`\`

## ⚙️ Compatibilidad y Limitaciones
*   **Desktop Agent**: La protección USB está implementada completamente en **Windows** vía `diskpart`. Para macOS/Linux, el agente requiere implementación de comandos alternativos (`diskutil` o `blockdev`).
*   **Web Frontend**: Completamente compatible con cualquier navegador moderno (Chrome, Edge, Firefox, Safari).

---
<div align="center">
  <i>Construido con enfoque en UI/UX y control de hardware desde la web.</i>
</div>
