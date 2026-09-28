@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0.tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.12+ or 24 LTS is required. Install from https://nodejs.org
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)
call npm run dev
