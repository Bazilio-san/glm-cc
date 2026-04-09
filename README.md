# @bazilio-san/glm-cc

CLI tool for running Claude with custom GLM model configuration.

## Installation

```bash
npm install -g @bazilio-san/glm-cc
```

## Usage

### Start claude with your configuration
```bash
glm
```

### Interactive configuration
```bash
glm -c
# or
glm --config
```

### Show help and current settings
```bash
glm -h
# or
glm --help
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
