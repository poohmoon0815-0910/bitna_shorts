@echo off
chcp 65001 >nul
cd /d c:\shorts-v2
title 쇼츠 영상 제작 대시보드 (:5173)
echo ========================================================
echo  [호기심빛나 AI 회사] 2부서: 쇼츠 영상 제작팀
echo  - 웹 대시보드: http://127.0.0.1:5173
echo ========================================================

:: 브라우저 즉시 열기
start http://127.0.0.1:5173

:: 5173 포트 점검: 이미 실행 중이면 충돌 없이 안내
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo [안내] 5173 쇼츠 대시보드 서버가 이미 정상 작동 중입니다!
    echo 브라우저 창이 열렸습니다: http://127.0.0.1:5173
    echo.
    pause
    exit /b 0
)

echo.
echo 서버 프로세스를 시작합니다...
pnpm dev
pause
