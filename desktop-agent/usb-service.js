/**
 * ShieldPort — usb-service.js
 * Interfaces with system tools to list and protect USB drives.
 */
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const platform = os.platform();

const usbService = {
  onLog: (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`),

  async getDrives() {
    this.onLog('info', 'Scanning system drives...');
    return this._fetchDrives(true);
  },

  async getDrivesQuiet() {
    return this._fetchDrives(false);
  },

  async _fetchDrives(verbose) {
    return new Promise((resolve, reject) => {
      // DriveType 2 = Removable Disk
      const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object DriveType -eq 2 | Select-Object DeviceID, VolumeName, Size | ConvertTo-Json -Compress"`;
      
      exec(psCommand, (error, stdout, stderr) => {
        if (error) {
          if (verbose) this.onLog('error', 'Failed to scan drives: ' + error.message);
          return reject(error);
        }
        
        try {
          const output = stdout.trim();
          if (!output) {
            if (verbose) this.onLog('success', `Found 0 USB drive(s)`);
            return resolve([]);
          }
          
          let parsed = JSON.parse(output);
          if (!Array.isArray(parsed)) {
            parsed = [parsed];
          }
          
          const usbDrives = parsed.map(d => {
            return {
              id: d.DeviceID,
              name: d.VolumeName || 'USB Drive',
              device: d.DeviceID,
              mount: d.DeviceID + '\\',
              size: parseInt(d.Size || 0, 10),
              isUsb: true,
              readOnly: false // Cannot easily determine write protection securely from WMI alone without access denied checks
            };
          });
          
          if (verbose) this.onLog('success', `Found ${usbDrives.length} USB drive(s)`);
          resolve(usbDrives);
        } catch (e) {
          if (verbose) this.onLog('error', 'Failed to parse drives: ' + e.message);
          reject(e);
        }
      });
    });
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
