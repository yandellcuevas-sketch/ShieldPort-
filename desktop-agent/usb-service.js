/**
 * ShieldPort — usb-service.js
 * Interfaces with system tools to list and protect USB drives.
 */
const drivelist = require('drivelist');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const platform = os.platform();

const usbService = {
  onLog: (level, msg) => console.log(`[${level}] ${msg}`),

  async getDrives() {
    this.onLog('info', 'Scanning system drives...');
    try {
      const drives = await drivelist.list();
      const usbDrives = drives
        .filter(d => d.isUSB || d.isRemovable)
        .map(d => {
          // Determine mount point or fallback to device path
          const mount = d.mountpoints && d.mountpoints.length > 0 
            ? d.mountpoints[0].path 
            : d.device;
            
          return {
            id: d.device,
            name: d.description || 'USB Drive',
            device: d.device,
            mount: mount,
            size: d.size,
            isUsb: true,
            readOnly: d.isReadOnly || false
          };
        });
      
      this.onLog('success', `Found ${usbDrives.length} USB drive(s)`);
      return usbDrives;
    } catch (e) {
      this.onLog('error', 'Failed to scan drives: ' + e.message);
      throw e;
    }
  },

  async protectDrive(driveId) {
    this.onLog('info', `Attempting to write-protect drive: ${driveId}`);
    
    return new Promise((resolve) => {
      if (platform === 'win32') {
        // Find disk number from device path
        const diskNumMatch = driveId.match(/PhysicalDrive(\d+)/i);
        if (!diskNumMatch) {
          resolve({ success: false, message: "Invalid drive ID for Windows" });
          return;
        }
        const diskNum = diskNumMatch[1];
        
        const scriptPath = path.join(os.tmpdir(), `shieldport_protect_${Date.now()}.txt`);
        fs.writeFileSync(scriptPath, `select disk ${diskNum}\nattributes disk set readonly\nexit`);
        
        exec(`diskpart /s "${scriptPath}"`, (error, stdout, stderr) => {
          try { fs.unlinkSync(scriptPath); } catch (e) {}
          
          if (error) {
            this.onLog('error', `Write-protect failed: ${error.message}`);
            resolve({ success: false, message: error.message });
          } else {
            this.onLog('success', `Drive ${driveId} is now write-protected`);
            resolve({ success: true, message: "Write protection enabled via diskpart" });
          }
        });
      } else if (platform === 'linux' || platform === 'darwin') {
        // For macOS/Linux, mock or use blockdev/diskutil
        this.onLog('warning', `OS-level protection requires sudo on ${platform}`);
        resolve({ success: false, message: `Not fully implemented for ${platform} without sudo wrapper` });
      } else {
        resolve({ success: false, message: "Unsupported OS" });
      }
    });
  },

  async unprotectDrive(driveId) {
    this.onLog('info', `Attempting to remove write-protection from drive: ${driveId}`);
    
    return new Promise((resolve) => {
      if (platform === 'win32') {
        const diskNumMatch = driveId.match(/PhysicalDrive(\d+)/i);
        if (!diskNumMatch) {
          resolve({ success: false, message: "Invalid drive ID for Windows" });
          return;
        }
        const diskNum = diskNumMatch[1];
        
        const scriptPath = path.join(os.tmpdir(), `shieldport_unprotect_${Date.now()}.txt`);
        fs.writeFileSync(scriptPath, `select disk ${diskNum}\nattributes disk clear readonly\nexit`);
        
        exec(`diskpart /s "${scriptPath}"`, (error, stdout, stderr) => {
          try { fs.unlinkSync(scriptPath); } catch (e) {}
          
          if (error) {
            this.onLog('error', `Unprotect failed: ${error.message}`);
            resolve({ success: false, message: error.message });
          } else {
            this.onLog('success', `Drive ${driveId} is now unprotected`);
            resolve({ success: true, message: "Write protection removed via diskpart" });
          }
        });
      } else {
        resolve({ success: false, message: "Unsupported OS" });
      }
    });
  }
};

module.exports = usbService;
