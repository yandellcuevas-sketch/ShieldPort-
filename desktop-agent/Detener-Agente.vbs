' ══════════════════════════════════════════════════════
' ShieldPort Desktop Agent — Detener Agente
' Doble clic para matar el proceso node (agente).
' Ejecutado como Administrador para poder cerrar el agente.
' ══════════════════════════════════════════════════════

Set objShell = CreateObject("Shell.Application")

' Ejecuta taskkill elevado como Administrador
objShell.ShellExecute "taskkill", "/F /IM node.exe", "", "runas", 0

Set objShellWS = CreateObject("WScript.Shell")
objShellWS.Popup "ShieldPort Agent detenido correctamente.", 3, "ShieldPort", 64
