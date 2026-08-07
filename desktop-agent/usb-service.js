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
  },

  // ── BITLOCKER (PASSWORD) ────────────────────────────────
  // ── BITLOCKER (PASSWORD) ────────────────────────────────
  async getBitlockerStatus(driveId) {
    if (platform !== 'win32') return { status: 'Unsupported', locked: false };
    return new Promise((resolve) => {
      const letter = driveId.replace(/[:\/]/g, '').toUpperCase() + ':';
      const psCommand = `powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { $v = Get-BitLockerVolume -MountPoint '${letter}'; if ($v) { @{ VolumeStatus = $v.VolumeStatus.ToString(); ProtectionStatus = $v.ProtectionStatus.ToString() } | ConvertTo-Json -Compress } else { Write-Output '{}' } } catch { try { $bde = manage-bde -status '${letter}'; if ($bde) { $text = $bde -join ' '; if ($text -match 'Locked|Bloqueado|Bloqueada') { Write-Output '{\\\"VolumeStatus\\\":\\\"Locked\\\",\\\"ProtectionStatus\\\":\\\"On\\\"}' } elseif ($text -match 'Protection On|Proteccin activada|Mtodo de cifrado|Encryption Method') { Write-Output '{\\\"VolumeStatus\\\":\\\"FullyEncrypted\\\",\\\"ProtectionStatus\\\":\\\"On\\\"}' } else { Write-Output '{}' } } else { Write-Output '{}' } } catch { Write-Output '{}' } }"`;
      
      exec(psCommand, (error, stdout) => {
        try {
          const raw = (stdout || '').trim().split('\n').find(l => l.trim().startsWith('{')) || '{}';
          const res = JSON.parse(raw);
          if (!res.VolumeStatus) return resolve({ status: 'Unencrypted', locked: false });

          let status = 'Unencrypted';
          let locked = false;

          const vs = res.VolumeStatus || '';
          if (vs.includes('FullyEncrypted')) status = 'Encrypted';
          else if (vs.includes('Encrypted')) status = 'Encrypted';
          else if (vs.includes('EncryptionInProgress')) status = 'Encrypting';
          else if (vs.includes('DecryptionInProgress')) status = 'Decrypting';
          else if (vs.includes('Locked')) { status = 'Encrypted'; locked = true; }

          const ps = res.ProtectionStatus || '';
          if ((ps === 'Off' || ps === 'Unknown') && status === 'Encrypted') locked = true;

          resolve({ status, locked });
        } catch(e) {
          resolve({ status: 'Unencrypted', locked: false });
        }
      });
    });
  },

  async enableBitlocker(driveId, password) {
    this.onLog('info', `Configuring BitLocker password for: ${driveId}`);
    return new Promise((resolve) => {
      const letter = driveId.replace(/[:\\/]/g, '').toUpperCase() + ':';
      const escapedPw = password.replace(/'/g, "''").replace(/"/g, '`"');
      const psCommand = `powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { $sec = ConvertTo-SecureString '${escapedPw}' -AsPlainText -Force; Enable-BitLocker -MountPoint '${letter}' -PasswordProtector $sec -UsedSpaceOnly -SkipHardwareTest; Write-Output 'SUCCESS' } catch { Write-Output ('ERROR:' + $_.Exception.Message); exit 1 }"`;
      
      exec(psCommand, (error, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '');
        if (error || output.includes('ERROR:')) {
          const msg = output.split('ERROR:')[1] || error.message || 'Error al configurar contraseña';
          this.onLog('error', `Failed to configure password: ${msg.trim()}`);
          resolve({ success: false, message: msg.trim() });
        } else {
          this.onLog('success', `Password configured for ${driveId}. Please wait a few minutes for encryption to finish.`);
          resolve({ success: true, message: 'Contraseña configurada. Espera a que termine de cifrar antes de desconectar.' });
        }
      });
    });
  },

  async disableBitlocker(driveId) {
    this.onLog('info', `Removing BitLocker password from: ${driveId}`);
    return new Promise((resolve) => {
      const letter = driveId.replace(/[:\/]/g, '').toUpperCase() + ':';
      const psCommand = `powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { Disable-BitLocker -MountPoint '${letter}'; Write-Output 'SUCCESS' } catch { Write-Output ('ERROR:' + $_.Exception.Message); exit 1 }"`;
      
      exec(psCommand, (error, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '');
        if (error || output.includes('ERROR:')) {
          const msg = output.split('ERROR:')[1] || error.message || 'Error al desactivar';
          this.onLog('error', `Failed to remove password: ${msg.trim()}`);
          resolve({ success: false, message: msg.trim() });
        } else {
          this.onLog('success', `Password removed from ${driveId}`);
          resolve({ success: true, message: 'Contraseña eliminada. El proceso de descifrado está en curso.' });
        }
      });
    });
  },

  async unlockBitlocker(driveId, password) {
    this.onLog('info', `Attempting to unlock ${driveId}`);
    return new Promise((resolve) => {
      const letter = driveId.replace(/[:\\/]/g, '').toUpperCase() + ':';
      const escapedPw = password.replace(/'/g, "''").replace(/"/g, '`"');
      const psCommand = `powershell -NoProfile -Command "$ErrorActionPreference = 'Stop'; try { $sec = ConvertTo-SecureString '${escapedPw}' -AsPlainText -Force; Unlock-BitLocker -MountPoint '${letter}' -Password $sec; Write-Output 'SUCCESS' } catch { Write-Output ('ERROR:' + $_.Exception.Message); exit 1 }"`;
      
      exec(psCommand, (error, stdout, stderr) => {
        const output = (stdout || '') + (stderr || '');
        if (error || output.includes('ERROR:')) {
          const msg = output.split('ERROR:')[1] || error.message || 'Contraseña incorrecta';
          this.onLog('error', `Failed to unlock: ${msg.trim()}`);
          resolve({ success: false, message: 'Contraseña incorrecta o error al desbloquear.' });
        } else {
          this.onLog('success', `${driveId} unlocked successfully`);
          resolve({ success: true, message: 'Dispositivo desbloqueado correctamente.' });
        }
      });
    });
  },

  async formatDrive(driveId, fileSystem, forceClean) {
    this.onLog('info', `Attempting to format drive: ${driveId} with ${fileSystem} (Force: ${forceClean})`);

    if (platform !== 'win32') {
      return { success: false, message: `Formatting not yet implemented for ${platform}` };
    }

    const diskNum = await this._getDiskNumber(driveId);
    if (diskNum === null) {
      this.onLog('error', `Could not resolve disk number for ${driveId}`);
      return { success: false, message: `No se pudo encontrar el disco físico para ${driveId}.` };
    }

    const letter = driveId.replace(/[:\\/]/g, '').toUpperCase(); // E.g. "D"
    const fsUpper = fileSystem.toUpperCase();
    const fat32formatExe = path.join(__dirname, 'tools', 'fat32format.exe');

    return new Promise((resolve) => {
      // Step 1: If forceClean is requested, clean and partition first
      const cleanScriptPath = path.join(os.tmpdir(), `shieldport_clean_${Date.now()}.txt`);
      const doClean = forceClean ? `select disk ${diskNum}\nclean\ncreate partition primary\nselect partition 1\nassign letter=${letter}\nexit` : `select volume=${letter}\nassign letter=${letter}\nexit`;

      fs.writeFileSync(cleanScriptPath, doClean, 'utf8');

      exec(`diskpart /s "${cleanScriptPath}"`, (cleanErr, cleanStdout) => {
        try { fs.unlinkSync(cleanScriptPath); } catch (e) {}

        if (fsUpper === 'FAT32' && fs.existsSync(fat32formatExe)) {
          // Use Rufus-style fat32format utility to bypass Windows 32GB limit
          this.onLog('info', `Formatting ${letter}: with fat32format tool (bypassing 32GB limit)...`);
          exec(`echo y | "${fat32formatExe}" ${letter}:`, (fErr, fStdout, fStderr) => {
            const outStr = (fStdout || '') + (fStderr || '');
            // "Failed to allow extended DASD" is just a harmless warning — real success = "Done" in output
            const reallyFailed = fErr && !outStr.includes('Done');
            if (reallyFailed) {
              this.onLog('error', `FAT32 Format failed: ${outStr}`);
              resolve({ success: false, message: `Fallo al formatear en FAT32: ${outStr}` });
            } else {
              this.onLog('success', `¡Unidad ${driveId} formateada exitosamente en FAT32!`);
              resolve({ success: true, message: `Unidad ${driveId} formateada correctamente en FAT32 (límite de 32GB superado).` });
            }
          });
        } else {
          // Standard diskpart format for NTFS/exFAT
          const formatScriptPath = path.join(os.tmpdir(), `shieldport_format_${Date.now()}.txt`);
          const formatCmd = [
            `select disk ${diskNum}`,
            `select partition 1`,
            `format fs=${fileSystem} quick override`,
            `assign letter=${letter}`,
            `exit`
          ].join('\n');

          fs.writeFileSync(formatScriptPath, formatCmd, 'utf8');

          exec(`diskpart /s "${formatScriptPath}"`, (error, stdout, stderr) => {
            try { fs.unlinkSync(formatScriptPath); } catch (e) {}
            const outString = stdout.toString() + stderr.toString();

            if (error || outString.includes('Virtual Disk Service error')) {
              this.onLog('error', `Formatting failed: ${outString}`);
              resolve({ success: false, message: `Fallo al formatear en ${fileSystem}.` });
            } else {
              this.onLog('success', `Drive ${driveId} formatted successfully`);
              resolve({ success: true, message: `Unidad ${driveId} formateada correctamente en ${fileSystem}.` });
            }
          });
        }
      });
    });
  }
};

module.exports = usbService;
