' ══════════════════════════════════════════════════════
' ShieldPort Desktop Agent — Launcher Invisible
' Doble clic para iniciar el agente en segundo plano.
' Se ejecuta como Administrador sin ventana visible.
' ══════════════════════════════════════════════════════

Set objFSO   = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("Shell.Application")

strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' 1. Cierra procesos previos de node.exe usando permisos elevados (para evitar acceso denegado)
objShell.ShellExecute "taskkill", "/F /IM node.exe", "", "runas", 0

WScript.Sleep 1000

' 2. Lanza node main.js como Administrador en segundo plano (0 = invisible)
objShell.ShellExecute "node", Chr(34) & strDir & "\main.js" & Chr(34), strDir, "runas", 0

WScript.Sleep 1200
Set objShellWS = CreateObject("WScript.Shell")
objShellWS.Popup "ShieldPort Agent iniciado con éxito en segundo plano.", 3, "ShieldPort", 64
