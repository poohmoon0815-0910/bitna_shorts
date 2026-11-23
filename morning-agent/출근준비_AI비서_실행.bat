@echo off
chcp 65001 >nul
cd /d c:\shorts-v2\morning-agent
title 1부서: 출근 준비 AI 비서실 (:4173)
echo ========================================================
echo  [호기심빛나 AI 회사] 1부서: 출근 준비 AI 비서실
echo  - 웹 대시보드: http://127.0.0.1:4173
echo ========================================================

:: 브라우저 즉시 열기
start http://127.0.0.1:4173

:: 4173 포트 점검: 이미 실행 중이면 대기 없이 바로 완료
netstat -ano | findstr ":4173" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo [안내] 4173 비서실 서버가 이미 정상 작동 중입니다!
    echo 브라우저 창이 열렸습니다: http://127.0.0.1:4173
    echo.
    pause
    exit /b 0
)

echo.
echo 1부서 비서실 서버를 시작합니다...
node server.mjs
pause
