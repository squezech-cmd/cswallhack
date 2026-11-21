@echo off
chcp 65001 >nul
title DEEP SALVAGE - сервер
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js не найден. Установите LTS с https://nodejs.org и запустите снова.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [*] Первый запуск: ставлю зависимости...
  call npm install --no-audit --no-fund
)

echo [*] Запускаю шахту на http://localhost:3000
start "" http://localhost:3000
node server/index.js
pause
