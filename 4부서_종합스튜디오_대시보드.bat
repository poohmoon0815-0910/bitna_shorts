@echo off
chcp 65001 >nul
cd /d c:\longform-v1
title 4부서: 종합 영상제작 스튜디오 (:4318)
echo ========================================================
echo  [호기심빛나 AI 회사] 4부서: 종합 영상제작 스튜디오
echo  - 웹 대시보드:  http://127.0.0.1:4318
echo  - 로컬 API 서버: http://127.0.0.1:4317
echo ========================================================

:: 브라우저 즉시 열기
start http://127.0.0.1:4318

:: 4318 포트 점검
netstat -ano | findstr ":4318" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo [안내] 4318 대시보드 서버가 이미 정상 작동 중입니다!
    echo 브라우저 창이 열렸습니다: http://127.0.0.1:4318
    echo.
    pause
    exit /b 0
)

echo.
echo 4부서 스튜디오 서버를 시작합니다...
pnpm dev
pause
