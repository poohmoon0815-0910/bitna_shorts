@echo off
chcp 65001 >nul
cd /d c:\shorts-v2
title 3부서: 마케팅·분석실 유튜브 AI 분석기 (:8001)
echo ========================================================
echo  [호기심빛나 AI 회사] 3부서: 마케팅·분석실
echo  - 유튜브 AI 분석 대시보드: http://127.0.0.1:8001
echo ========================================================

:: 브라우저 즉시 열기
start http://127.0.0.1:8001

:: 8001 포트 점검
netstat -ano | findstr ":8001" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo [안내] 8001 마케팅·분석 대시보드가 이미 정상 작동 중입니다!
    echo 브라우저 창이 열렸습니다: http://127.0.0.1:8001
    echo.
    pause
    exit /b 0
)

echo.
echo 마케팅·분석 서버를 시작합니다...
uv run --with fastapi --with uvicorn --with openai --with yt-dlp python -m uvicorn 유튜브_분석.backend.main:app --host 127.0.0.1 --port 8001 --reload
pause
