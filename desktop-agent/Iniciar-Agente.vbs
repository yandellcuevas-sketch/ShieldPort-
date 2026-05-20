' ══════════════════════════════════════════════════════
' ShieldPort Desktop Agent — Launcher Invisible
' Doble clic para iniciar el agente en segundo plano.
' Se ejecuta como Administrador sin ventana visible.
' ══════════════════════════════════════════════════════

Set objFSO   = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("Shell.Application")

' Obtiene la carpeta donde está este .vbs
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Lanza node main.js como Administrador, ventana oculta (0)
objShell.ShellExecute "node", Chr(34) & strDir & "\main.js" & Chr(34), strDir, "runas", 0

' Pequeño aviso sin bloquear
WScript.Sleep 1200
Set objShellWS = CreateObject("WScript.Shell")
objShellWS.Popup "ShieldPort Agent iniciado en segundo plano." & Chr(13) & _
          "Abre http://localhost:8080 en tu navegador.", _
          4, "ShieldPort", 64
