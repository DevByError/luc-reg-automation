@echo off
title Registration Portal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)

rem Install again whenever the list of parts changes, or if an earlier install didn't finish.
fc /b "package-lock.json" "node_modules\.portal-installed" >nul 2>nul
if errorlevel 1 (
  echo Installing the portal parts. This needs internet and takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo The install did not finish. Check the internet connection, then run this file again.
    pause
    exit /b 1
  )
  copy /y "package-lock.json" "node_modules\.portal-installed" >nul
)

for /f "delims=" %%v in ('node -e "const t=require('fs').readFileSync('src/version.ts','utf8');const m=t.match(/date: '([^']+)', time: '([^']+)'/);console.log(m?m[1]+' '+m[2]:'unknown')"') do echo Portal version: %%v
echo Starting the portal. Keep this window open while you use it; close it to stop.
call npm run dev -- --open
pause
