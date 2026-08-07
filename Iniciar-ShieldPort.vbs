' ══════════════════════════════════════════════════════
' ShieldPort — Iniciar Todo (Agente + Web App)
' Doble clic para iniciar el agente como Administrador 
' y abrir la aplicación web en tu navegador.
' ══════════════════════════════════════════════════════

Set objFSO   = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("Shell.Application")
Set objWss   = CreateObject("WScript.Shell")

' Obtiene la carpeta raíz del proyecto
strDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
agentDir = strDir & "\desktop-agent"

' 1. Inicia el Agente de Escritorio como Administrador en segundo plano
objShell.ShellExecute "node", Chr(34) & agentDir & "\main.js" & Chr(34), agentDir, "runas", 0

' Espera 1.2 segundos para asegurar la inicialización
WScript.Sleep 1200

' 2. Abre la aplicación web en el navegador predeterminado (GitHub Pages / Localhost)
objWss.Run "https://yandellcuevas-sketch.github.io/ShieldPort-/"

' Aviso informativo de 3 segundos
objWss.Popup "ShieldPort iniciado con éxito." & Chr(13) & _
             "Agente de Administrador activo y navegador abierto.", _
             3, "ShieldPort", 64
