@echo off
title English result mini portal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  pause
  exit /b 1
)
node scripts/run-english-portal.mjs
pause
