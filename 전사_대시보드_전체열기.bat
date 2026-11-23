@echo off
chcp 65001 >nul
title 호기심빛나 AI 회사 — CEO 종합상황실 및 전사 서버 통합 가동기
echo ========================================================
echo  [호기심빛나 AI 회사] 전사 시스템 자동 점검 및 가동
echo ========================================================

:: 1부서 / CEO 종합상황실 (:4173) 점검
netstat -ano | findstr ":4173" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [가동 중] 1부서 CEO 종합상황실 서버(:4173) 시작...
    start "1부서_CEO종합상황실_4173" /min cmd /c "cd /d c:\shorts-v2\morning-agent && node server.mjs"
    timeout /t 2 /nobreak >nul
) else (
    echo [정상] 1부서 CEO 종합상황실(:4173) 이미 가동 중
)

:: 2부서 쇼츠 스튜디오 (:5173 / :8000) 점검
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [가동 중] 2부서 쇼츠 스튜디오(:5173) 시작...
    start "2부서_쇼츠스튜디오_5173" /min cmd /c "cd /d c:\shorts-v2 && pnpm dev"
    timeout /t 3 /nobreak >nul
) else (
    echo [정상] 2부서 쇼츠 스튜디오(:5173) 이미 가동 중
)

:: 3부서 유튜브 분석실 (:8001) 점검
netstat -ano | findstr ":8001" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [가동 중] 3부서 유튜브 AI 분석실(:8001) 시작...
    start "3부서_유튜브분석_8001" /min cmd /c "cd /d c:\shorts-v2 && uv run --with fastapi --with uvicorn --with openai --with yt-dlp python -m uvicorn 유튜브_분석.backend.main:app --host 127.0.0.1 --port 8001"
    timeout /t 2 /nobreak >nul
) else (
    echo [정상] 3부서 유튜브 분석실(:8001) 이미 가동 중
)

:: 4부서 종합 영상제작 스튜디오 (:4318 / :4317) 점검
netstat -ano | findstr ":4318" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [가동 중] 4부서 종합 영상제작 스튜디오(:4318) 시작...
    start "4부서_종합스튜디오_4318" /min cmd /c "cd /d c:\longform-v1 && pnpm dev"
    timeout /t 2 /nobreak >nul
) else (
    echo [정상] 4부서 종합 영상제작 스튜디오(:4318) 이미 가동 중
)

echo.
echo ========================================================
echo  모든 부서 서버 가동 확인 완료!
echo  - [메인 조종석] CEO 종합상황실:   http://127.0.0.1:4173
echo  - [2부서] 쇼츠 영상 제작실:       http://127.0.0.1:5173
echo  - [3부서] 유튜브 분석실:           http://127.0.0.1:8001
echo  - [4부서] 종합 영상제작 스튜디오: http://127.0.0.1:4318
echo ========================================================
echo.
echo 브라우저에서 CEO 종합상황실을 엽니다...
start http://127.0.0.1:4173

timeout /t 3 >nul
