@echo off
title English file box check
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  pause
  exit /b 1
)
echo Checking the English Result file box on LOS. Nothing is uploaded.
node scripts/run-english-file.mjs
pause
