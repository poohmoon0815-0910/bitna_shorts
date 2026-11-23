@echo off
chcp 65001 >nul
title [호기심빛나] 스마트 이미지 인식 작업표시줄 매크로
cd /d "c:\shorts-v2"

echo ========================================================
echo  [호기심빛나] 스마트 이미지 인식 작업표시줄 매크로 가동
echo ========================================================
echo.

uv run --with pyautogui --with opencv-python --with pillow python "c:\shorts-v2\macro\smart_macro\smart_macro.py"

pause
