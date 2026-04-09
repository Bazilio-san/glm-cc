#!/usr/bin/env node

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const CONFIG_FILE = path.join(os.homedir(), '.glm-claude-code.json');

const CONFIG_FIELDS = [
  {
    key: 'ANTHROPIC_BASE_URL',
    label: 'Anthropic Base URL',
    defaultValue: 'https://api.z.ai/api/anthropic',
  },
  {
    key: 'ANTHROPIC_AUTH_TOKEN',
    label: 'Anthropic Auth Token',
    defaultValue: '',
  },
  {
    key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    label: 'Default Haiku model',
    defaultValue: 'glm-4.5-air',
  },
  {
    key: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    label: 'Default Sonnet model',
    defaultValue: 'glm-5.1',
  },
  {
    key: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    label: 'Default Opus model',
    defaultValue: 'glm-5.1',
  },
];

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function runConfig(fields) {
  const config = loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nConfiguration (press Enter to keep current value):\n');

  for (const field of fields) {
    const current = config[field.key] !== undefined && config[field.key] !== ''
      ? config[field.key]
      : field.defaultValue;
    const hint = current ? ` [\x1b[32m${current}\x1b[0m]` : '';
    const answer = await ask(rl, `${field.label}${hint}: `);
    config[field.key] = answer.trim() !== '' ? answer.trim() : current;
  }

  rl.close();
  saveConfig(config);
  console.log(`\nConfig saved: ${CONFIG_FILE}\n`);
  return config;
}

function showConfig(config) {
  const lines = [
    '',
    `Config file: ${CONFIG_FILE}`,
    '',
    'Current settings:',
  ];
  for (const field of CONFIG_FIELDS) {
    const val = config[field.key] !== undefined && config[field.key] !== ''
      ? config[field.key]
      : '(not set)';
    lines.push(`  ${field.key} = ${val}`);
  }
  lines.push('');
  console.log(lines.join('\n'));
}

function launchClaude(config, args) {
  const env = { ...process.env };
  for (const field of CONFIG_FIELDS) {
    if (config[field.key]) {
      env[field.key] = config[field.key];
    }
  }
  const proc = spawn('claude', args, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  proc.on('exit', code => process.exit(code ?? 0));
  proc.on('error', err => {
    console.error(`Failed to launch claude: ${err.message}`);
    process.exit(1);
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Only glm-specific flags: --config, --show-config, --glm-version
  if (args.includes('--glm-config') || args.includes('-c')) {
    await runConfig(CONFIG_FIELDS);
    return;
  }

  if (args.includes('--glm-show')) {
    showConfig(loadConfig());
    return;
  }

  if (args.includes('--glm-version')) {
    console.log(`glm v${pkg.version}`);
    return;
  }

  let config = loadConfig();

  const missingFields = CONFIG_FIELDS.filter(f => !config[f.key]);

  if (missingFields.length > 0) {
    console.log('Some settings are missing. Please fill them in:\n');
    config = await runConfig(missingFields);
    config = loadConfig();
  }

  // All arguments are passed through to claude
  launchClaude(config, args);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
