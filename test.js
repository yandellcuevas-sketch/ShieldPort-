const { exec } = require('child_process');
const letter = 'C:';
const ps = `powershell -NoProfile -Command "$v = Get-BitLockerVolume -MountPoint '${letter}' -ErrorAction SilentlyContinue; if ($v) { @{ VolumeStatus = $v.VolumeStatus.ToString(); ProtectionStatus = $v.ProtectionStatus.ToString() } | ConvertTo-Json -Compress } else { '{}' }"`;
console.log('Running:', ps);
exec(ps, (error, stdout, stderr) => {
  console.log('Error:', error);
  console.log('Stdout:', stdout);
  console.log('Stderr:', stderr);
});
