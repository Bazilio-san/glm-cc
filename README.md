# @bazilio-san/glm-cc

CLI tool for running Claude with custom GLM model configuration.

## Installation

```bash
npm install -g @bazilio-san/glm-cc
```

## Usage

All arguments are passed through to `claude`, so you can use `glm` as a drop-in replacement:

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
glm -c                     # interactive configuration (alias: --glm-config)
glm --glm-show             # show current settings
glm --glm-version          # show glm version
```

## Configuration

The tool stores configuration in `~/.glm-claude-code.json`.

Supported settings:
- `ANTHROPIC_BASE_URL` — API endpoint (default: `https://api.z.ai/api/anthropic`)
- `ANTHROPIC_AUTH_TOKEN` — primary auth token
- `ANTHROPIC_DEFAULT_HAIKU_MODEL` — default Haiku model (default: `glm-4.5-air`)
- `ANTHROPIC_DEFAULT_SONNET_MODEL` — default Sonnet model (default: `glm-5.1`)
- `ANTHROPIC_DEFAULT_OPUS_MODEL` — default Opus model (default: `glm-5.1`)

If any setting is missing, the tool will automatically prompt for it on first run.

## License

MIT
