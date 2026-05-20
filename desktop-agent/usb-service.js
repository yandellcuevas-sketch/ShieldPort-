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
      const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Where-Object DriveType -eq 2 | Select-Object DeviceID, VolumeName, Size, FreeSpace | ConvertTo-Json -Compress"`;
      
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
              available: parseInt(d.FreeSpace || 0, 10),
              freeSpace: parseInt(d.FreeSpace || 0, 10),
              isUsb: true,
              readOnly: false
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

  // Resolve drive letter (e.g. "E:") to physical disk number using PowerShell
  _getDiskNumber(driveLetter) {
    return new Promise((resolve) => {
      // driveLetter may come as "E:", "E:\", strip to just the letter
      const letter = driveLetter.replace(/[:\\/]/g, '').toUpperCase();
      const ps = `powershell -NoProfile -Command "Get-Partition | Where-Object { $_.DriveLetter -eq '${letter}' } | Get-Disk | Select-Object -ExpandProperty Number"`;
      exec(ps, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
        } else {
          const num = parseInt(stdout.trim(), 10);
          resolve(isNaN(num) ? null : num);
        }
      });
    });
  },

  async protectDrive(driveId) {
    this.onLog('info', `Attempting to write-protect drive: ${driveId}`);

    if (platform !== 'win32') {
      return { success: false, message: `Protection not yet implemented for ${platform}` };
    }

    const diskNum = await this._getDiskNumber(driveId);
    if (diskNum === null) {
      this.onLog('error', `Could not resolve disk number for ${driveId}`);
      return { success: false, message: `No se pudo encontrar el disco físico para ${driveId}. Asegúrate de ejecutar el agente como Administrador.` };
    }

    return new Promise((resolve) => {
      const scriptPath = path.join(os.tmpdir(), `shieldport_protect_${Date.now()}.txt`);
      fs.writeFileSync(scriptPath, `select disk ${diskNum}\nattributes disk set readonly\nexit`);

      exec(`diskpart /s "${scriptPath}"`, (error, stdout) => {
        try { fs.unlinkSync(scriptPath); } catch (e) {}
        if (error) {
          this.onLog('error', `Write-protect failed: ${error.message}`);
          resolve({ success: false, message: error.message });
        } else {
          this.onLog('success', `Disk ${diskNum} (${driveId}) write-protected`);
          resolve({ success: true, message: 'Protección contra escritura activada' });
        }
      });
    });
  },

  async unprotectDrive(driveId) {
    this.onLog('info', `Attempting to remove write-protection from: ${driveId}`);

    if (platform !== 'win32') {
      return { success: false, message: `Protection not yet implemented for ${platform}` };
    }

    const diskNum = await this._getDiskNumber(driveId);
    if (diskNum === null) {
      this.onLog('error', `Could not resolve disk number for ${driveId}`);
      return { success: false, message: `No se pudo encontrar el disco físico para ${driveId}. Asegúrate de ejecutar el agente como Administrador.` };
    }

    return new Promise((resolve) => {
      const scriptPath = path.join(os.tmpdir(), `shieldport_unprotect_${Date.now()}.txt`);
      fs.writeFileSync(scriptPath, `select disk ${diskNum}\nattributes disk clear readonly\nexit`);

      exec(`diskpart /s "${scriptPath}"`, (error, stdout) => {
        try { fs.unlinkSync(scriptPath); } catch (e) {}
        if (error) {
          this.onLog('error', `Unprotect failed: ${error.message}`);
          resolve({ success: false, message: error.message });
        } else {
          this.onLog('success', `Disk ${diskNum} (${driveId}) write protection removed`);
          resolve({ success: true, message: 'Protección contra escritura desactivada' });
        }
      });
    });
  }
};

module.exports = usbService;
