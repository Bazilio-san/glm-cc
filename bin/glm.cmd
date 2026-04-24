:; SCRIPT="$(readlink -f "$0" 2>/dev/null || echo "$0")"; exec "$(dirname "$SCRIPT")/glm.sh" "$@"
@echo off
rem -------------------------------------------------------------------------
rem glm — launch claude with GLM env vars. Runs as a pure cmd.exe script so
rem that no intermediate node process sits between the caller (PTY / terminal)
rem and claude.exe. Critical for parent-PTY scenarios where the ConPty session
rem must reach claude directly for Ink-based raw-keyboard input to work.
rem
rem First line is a bash/batch polyglot:
rem   bash : `:` = no-op, `;` separator, `exec` replaces shell with glm.sh
rem   cmd  : `:;` = malformed label, skipped silently
rem -------------------------------------------------------------------------

set "GLM_ARGS=%*"

rem --- glm-specific flags are delegated to the node helper ----------------
set "GLM_PAD= %GLM_ARGS% "
echo.%GLM_PAD%| findstr /I /C:" --glm-config " /C:" --glm-show " /C:" --glm-version " /C:" -c " >nul
if not errorlevel 1 (
  node "%~dp0glm-config.js" %*
  exit /b %errorlevel%
)

rem --- First-time setup if env file is missing ----------------------------
set "GLM_ENV_FILE=%USERPROFILE%\.glm-claude-code.env"
if not exist "%GLM_ENV_FILE%" (
  node "%~dp0glm-config.js" --setup
  if errorlevel 1 exit /b 1
  if not exist "%GLM_ENV_FILE%" (
    echo glm: setup did not produce %GLM_ENV_FILE% 1>&2
    exit /b 1
  )
)

rem --- Load env vars from KEY=VALUE file ----------------------------------
rem Note: with `tokens=1,*` the second token is %%L (letter after %%K),
rem not %%V — `for /f` names extra tokens sequentially by letter.
for /f "usebackq eol=# tokens=1,* delims==" %%K in ("%GLM_ENV_FILE%") do (
  set "%%K=%%L"
)

rem --- Tail-call claude directly. `claude.exe` becomes a child of the
rem     outer (PTY-attached) cmd.exe process, not of any node intermediate.
claude %*
exit /b %errorlevel%
