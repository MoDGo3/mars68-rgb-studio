' Run server.js without a console window (lights keep running after the browser closes)
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dir
sh.Run "node """ & dir & "\server.js""", 0, False
