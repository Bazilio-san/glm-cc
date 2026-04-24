#!/usr/bin/env bash
# glm — launch claude with GLM env vars (POSIX/Unix side).
# Kept as a pure shell script (no node intermediate) so the parent terminal's
# TTY reaches claude directly. Counterpart of bin/glm.cmd on Windows.

set -e

# Resolve real script dir (follow symlinks — npm links bin -> bin/glm.cmd → .sh via polyglot)
_glm_src="${BASH_SOURCE[0]:-$0}"
if command -v readlink >/dev/null 2>&1; then
  _glm_real="$(readlink -f "$_glm_src" 2>/dev/null || echo "$_glm_src")"
else
  _glm_real="$_glm_src"
fi
GLM_BIN_DIR="$(cd "$(dirname "$_glm_real")" && pwd)"

GLM_ENV_FILE="${HOME}/.glm-claude-code.env"

# --- glm-specific flags delegate to the node helper -----------------------
case " $* " in
  *" --glm-config "*|*" -c "*|*" --glm-show "*|*" --glm-version "*)
    exec node "${GLM_BIN_DIR}/glm-config.js" "$@"
    ;;
esac

# --- First-time setup -----------------------------------------------------
if [ ! -f "$GLM_ENV_FILE" ]; then
  node "${GLM_BIN_DIR}/glm-config.js" --setup
  if [ ! -f "$GLM_ENV_FILE" ]; then
    echo "glm: setup did not produce $GLM_ENV_FILE" >&2
    exit 1
  fi
fi

# --- Load env vars and tail-call claude -----------------------------------
set -a
# shellcheck disable=SC1090
. "$GLM_ENV_FILE"
set +a

exec claude "$@"
