# @bazilio-san/glm-cc

CLI tool for running Claude Code against a GLM-compatible API endpoint.

`glm` is a thin wrapper: it exports a handful of environment variables and then
tail-calls `claude` directly, with no Node process left in between. That matters
on Windows, where an intermediate process would break the parent terminal's
ConPty session and with it Claude Code's raw keyboard input.

## Installation

```bash
npm install -g @bazilio-san/glm-cc
```

No runtime dependencies — the package is plain Node.js plus two shell scripts.

## Usage

All arguments are passed through to `claude`, so you can use `glm` as a drop-in
replacement:

```bash
glm                        # launch claude interactively
glm -h                     # claude -h
glm plugin -h              # claude plugin -h
glm -p "hello"             # claude -p "hello"
glm --version              # claude --version
glm mcp serve              # claude mcp serve
```

### glm-specific commands

```bash
glm -c                     # configuration menu (alias: --glm-config)
glm --glm-show             # print the current settings
glm --glm-doctor           # check the key, the endpoint and the models
glm --glm-version          # print the glm version
glm --glm-help             # list these flags
```

`-c` is consumed by glm and never reaches `claude`, so `claude -c`
(continue the previous session) is not available through `glm`.

## Configuration

Running `glm -c` opens an arrow-key menu that can:

- **Pick the API endpoint** — Z.AI Global, Z.AI China (BigModel), or any other
  Anthropic-compatible URL you type in.
- **Set the API key** and verify it against the endpoint before saving. A
  rejected key, an unreachable server and an HTTP error are reported separately,
  so you can tell a wrong key from a network problem.
- **Choose the models** — keep the defaults, pick from the list of models your
  key can actually use (fetched live from the provider), or type model ids by
  hand. The `[1m]` suffix that unlocks a 1M-token context window and the
  matching auto-compact threshold are derived from the model, not typed in.
- **Tune the advanced settings** — request timeout, non-essential traffic,
  auto-compact window.
- **Run a health check** — configuration files, `claude` and `git` on PATH, key
  validity, whether the selected models exist on the server, and whether
  anything else on the machine would override what glm exports.
- **Remove the glm configuration** — deletes glm's own two files and nothing
  else.

The first `glm` run starts the same wizard automatically when no configuration
exists yet.

### Files

glm owns exactly two files and modifies nothing else:

| File | Purpose |
| --- | --- |
| `~/.glm-claude-code.json` | source of truth, edited through `glm -c` |
| `~/.glm-claude-code.env` | flat `KEY=VALUE` sidecar read by the launcher at every start |

**Claude Code's own configuration is never written to.** `~/.claude/settings.json`
and `~/.claude.json` are left alone; the health check reads `settings.json` only
to warn you when its `env` block would silently override glm's values, and tells
you to edit that file yourself.

### Managed variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_BASE_URL` | `https://api.z.ai/api/anthropic` | API endpoint |
| `ANTHROPIC_AUTH_TOKEN` | — | bearer token sent with every request |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `glm-5.3[1m]` | model for ordinary work |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `glm-5.3[1m]` | model for the strongest tier |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `glm-5.3-flash[1m]` | model for cheap background tasks |
| `API_TIMEOUT_MS` | `3000000` | how long to wait for one reply (50 minutes) |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `1` | switch off optional telemetry |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `1048576` | token count at which history is compacted |

Defaults only apply to settings you have never set; existing values are kept as
they are.

## What is out of scope

MCP servers and the plugin marketplace are not managed here. Both live in Claude
Code's own configuration (`~/.claude.json` and the plugin store) rather than in
environment variables, so managing them would mean writing to files glm
deliberately keeps its hands off. Use `claude mcp …` and `claude plugin …` for
those.

## License

MIT
