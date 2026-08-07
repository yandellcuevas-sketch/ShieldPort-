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

' 1. Cierra cualquier proceso previo del agente con permisos elevados
objShell.ShellExecute "taskkill", "/F /IM node.exe", "", "runas", 0

WScript.Sleep 1000

' 2. Inicia el nuevo Agente de Escritorio como Administrador en segundo plano
objShell.ShellExecute "node", Chr(34) & agentDir & "\main.js" & Chr(34), agentDir, "runas", 0

WScript.Sleep 1200

' 3. Abre la aplicación web en el navegador predeterminado
objWss.Run "https://yandellcuevas-sketch.github.io/ShieldPort-/"

' Aviso informativo de 3 segundos
objWss.Popup "ShieldPort cargado y listo." & Chr(13) & _
             "Agente de Administrador activo con el nuevo código.", _
             3, "ShieldPort", 64
