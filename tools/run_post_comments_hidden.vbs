Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\shorts-v2"
WshShell.Run "cmd.exe /c node ""c:\shorts-v2\tools\youtube-uploader.mjs"" post-due-comments ""c:\shorts-v2\outputs\upload_manifest_261122.json"" >> ""c:\shorts-v2\outputs\post_comments.log"" 2>&1", 0, True
