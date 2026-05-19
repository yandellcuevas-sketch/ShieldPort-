# Compatibilidad del Sistema

## USB Shield (Desktop Agent)
La protección contra escritura a nivel de unidad se realiza modificando el disco directamente. 

- **Windows**: ✅ Soporte Completo. Utiliza `diskpart`. Requiere que el Desktop Agent corra como Administrador.
- **macOS**: ⚠️ Experimental. Utiliza comandos mock. Para soporte completo se requeriría `diskutil mount readOnly`.
- **Linux**: ⚠️ Experimental. Utiliza comandos mock. Para soporte completo se requeriría `blockdev --setro`.

## Navegadores (Frontend)
- **Chrome / Edge (Chromium)**: ✅ Soporte Completo.
- **Firefox**: ⚠️ Soporte Parcial. No soporta WebUSB.
- **Safari / iOS**: ⚠️ Soporte Parcial. No soporta WebUSB.
