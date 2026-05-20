' ══════════════════════════════════════════════════════
' ShieldPort Desktop Agent — Detener Agente
' Doble clic para matar el proceso node (agente).
' ══════════════════════════════════════════════════════

Set wsh = CreateObject("WScript.Shell")

' Mata cualquier proceso node corriendo el agente
wsh.Run "taskkill /F /IM node.exe", 0, True

wsh.Popup "ShieldPort Agent detenido.", 3, "ShieldPort", 64
