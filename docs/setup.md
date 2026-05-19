# Guía de Instalación (Setup)

## Requisitos Previos
- [Node.js](https://nodejs.org/) v16+ instalado.
- Privilegios de administrador (Windows) o `sudo` (Linux/macOS) para las funciones del Desktop Agent.

## Paso 1: Clonar/Descargar
Descarga la carpeta `ShieldPort`.

## Paso 2: Desktop Agent
1. Abre una terminal con **Privilegios de Administrador**.
2. Navega a `ShieldPort/desktop-agent`.
3. Ejecuta `npm install`.
4. Ejecuta `npm start`.
5. El agente escuchará en el puerto WebSocket `8765`.

## Paso 3: Web App
1. Abre una terminal normal.
2. Navega a `ShieldPort/backend`.
3. Ejecuta `npm install`.
4. Ejecuta `npm start`.
5. Abre `http://localhost:3000` en Chrome o Edge.

## Notas Adicionales
- El Frontend se reconectará automáticamente al Desktop Agent si este se reinicia.
- Si ves una advertencia de "Solo Web" en la sección USB, asegúrate de que el Desktop Agent está en ejecución y no está bloqueado por un Firewall.
