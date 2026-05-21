@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  pnpm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

set "NODE_ENV=development"
if "%PORT%"=="" set "PORT=3000"

echo Starting app at http://localhost:%PORT%/
echo Press Ctrl+C to stop the server.
echo.

pnpm exec tsx scripts/start-dev.mjs

echo.
echo App stopped.
pause
