@echo off
cd /d c:\shorts-v2\macro\smart_macro
"C:\Users\user\.local\bin\uv.exe" run --with pyautogui --with opencv-python --with pillow --with numpy python smart_macro.py
pause
