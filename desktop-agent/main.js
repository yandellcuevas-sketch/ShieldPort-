/**
 * ShieldPort — Desktop Agent
 * Provides WebSocket bridge to Web App for privileged system operations.
 */
const { WebSocketServer } = require('ws');
const usbService = require('./usb-service');

const PORT = 8765;
const wss = new WebSocketServer({ port: PORT });

console.log(`\n🛡️  ShieldPort Desktop Agent running on ws://localhost:${PORT}`);
console.log(`Waiting for Web App connection...\n`);

wss.on('connection', (ws) => {
  console.log('✅ Web App connected');

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'GET_DRIVES':
          const drives = await usbService.getDrives();
          ws.send(JSON.stringify({ type: 'DRIVES_LIST', drives }));
          break;

        case 'PROTECT_DRIVE':
          const pResult = await usbService.protectDrive(msg.driveId);
          ws.send(JSON.stringify({ type: 'DRIVE_PROTECTED', success: pResult.success, driveId: msg.driveId, message: pResult.message }));
          break;

        case 'UNPROTECT_DRIVE':
          const uResult = await usbService.unprotectDrive(msg.driveId);
          ws.send(JSON.stringify({ type: 'DRIVE_UNPROTECTED', success: uResult.success, driveId: msg.driveId, message: uResult.message }));
          break;
          
        default:
          console.log('Unknown message type:', msg.type);
      }
    } catch (e) {
      console.error('Message processing error:', e);
      ws.send(JSON.stringify({ type: 'ERROR', message: e.message }));
    }
  });

  ws.on('close', () => {
    console.log('❌ Web App disconnected');
  });
  
  // Forward logs to web app
  usbService.onLog = (level, text) => {
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify({ type: 'LOG', level, message: text }));
    }
  };
});
