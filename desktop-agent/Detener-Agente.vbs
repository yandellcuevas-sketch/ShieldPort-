' ══════════════════════════════════════════════════════
' ShieldPort Desktop Agent — Detener Agente
' Doble clic para matar el proceso node (agente).
' ══════════════════════════════════════════════════════

Set objShell = CreateObject("WScript.Shell")

' Mata cualquier proceso node corriendo el agente
objShell.Run "taskkill /F /IM node.exe", 0, True

objShell.Popup "ShieldPort Agent detenido.", 3, "ShieldPort", 64
