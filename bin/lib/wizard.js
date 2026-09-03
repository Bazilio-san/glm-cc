// Interactive screens for `glm -c`.
//
// Everything here writes to ~/.glm-claude-code.json and ~/.glm-claude-code.env
// and to nothing else. Claude Code's own configuration is only ever read, and
// only by the health check, which reports conflicts instead of fixing them.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ENV_PATH,
  JSON_PATH,
  FIELDS,
  DEFAULTS,
  effective,
  isComplete,
  load,
  maskSecret,
  missingKeys,
  removeAll,
  save,
} from './config.js';
import { listModels, validateApiKey } from './api.js';
import {
  ENDPOINTS,
  contextWindowFor,
  describeContext,
  findEndpoint,
  formatForClaudeCode,
  formatTokens,
  modelsUrlFor,
  stripSuffix,
} from './models.js';
import {
  box,
  c,
  clearScreen,
  confirm,
  input,
  password,
  pause,
  select,
  separator,
  sleep,
  spinner,
  write,
} from './ui.js';

const BANNER = 'glm — GLM configuration for Claude Code';

function header (version, title) {
  clearScreen();
  box(BANNER, `v${version}`);
  if (title) {
    write(c.bold(title));
    write('');
  }
}

// ── status ────────────────────────────────────────────────────────────────

function endpointLabel (baseUrl) {
  const known = findEndpoint(baseUrl);
  return known ? `${known.label} ${c.gray(`(${baseUrl})`)}` : `${c.gray('custom')} ${baseUrl}`;
}

function printStatus (config) {
  const values = effective(config);
  const mainModel = stripSuffix(values.ANTHROPIC_DEFAULT_SONNET_MODEL);
  const opusModel = stripSuffix(values.ANTHROPIC_DEFAULT_OPUS_MODEL);
  const smallModel = stripSuffix(values.ANTHROPIC_DEFAULT_HAIKU_MODEL);
  const token = config.ANTHROPIC_AUTH_TOKEN;

  write(c.bold('Current configuration'));
  write(`  ${c.gray('Endpoint    :')} ${endpointLabel(values.ANTHROPIC_BASE_URL)}`);
  write(`  ${c.gray('API key     :')} ${token ? c.green(maskSecret(token)) : c.red('not set')}`);
  write(`  ${c.gray('Main model  :')} ${c.green(mainModel)} ${c.gray(`— ${describeContext(mainModel)}`)}`);
  if (opusModel !== mainModel) {
    write(`  ${c.gray('Opus slot   :')} ${c.green(opusModel)} ${c.gray(`— ${describeContext(opusModel)}`)}`);
  }
  write(`  ${c.gray('Small model :')} ${c.green(smallModel)} ${c.gray(`— ${describeContext(smallModel)}`)}`);
  write(`  ${c.gray('Timeout     :')} ${formatTokens(values.API_TIMEOUT_MS)} ms`);
  write(`  ${c.gray('Telemetry   :')} ${values.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === '1' ? 'non-essential traffic off' : 'left at the Claude Code default'}`);
  write(`  ${c.gray('Compact at  :')} ${formatTokens(values.CLAUDE_CODE_AUTO_COMPACT_WINDOW)} tokens`);
  write('');
  write(c.gray(`  Files: ${JSON_PATH}`));
  write(c.gray(`         ${ENV_PATH}`));
  write('');
}

export function showConfig () {
  const config = load();
  const values = effective(config);
  write('');
  write(c.bold('glm configuration'));
  write(c.gray(`  ${JSON_PATH}`));
  write(c.gray(`  ${ENV_PATH}`));
  write('');
  for (const field of FIELDS) {
    const stored = config[field.key];
    const value = values[field.key];
    let shown;
    if (stored == null) shown = c.gray(`${value || '(unset)'}  — default`);
    else if (stored === '') shown = c.gray('(not exported)');
    else shown = field.secret ? c.green(maskSecret(value)) : c.green(value);
    write(`  ${field.key.padEnd(42)} ${shown}`);
  }
  write('');
  if (!isComplete(config)) {
    write(c.yellow(`  Missing required settings: ${missingKeys(config).join(', ')}`));
    write(c.gray('  Run `glm -c` to fill them in.'));
    write('');
  }
}

// ── endpoint ──────────────────────────────────────────────────────────────

async function pickEndpoint (currentBaseUrl) {
  const known = findEndpoint(currentBaseUrl);
  const choices = ENDPOINTS.map(endpoint => ({
    name: endpoint.label + (endpoint.baseUrl === currentBaseUrl ? c.green('  ✓ in use') : ''),
    value: endpoint.baseUrl,
    hint: `— ${endpoint.baseUrl}`,
  }));
  choices.push({
    name: 'Custom endpoint…',
    value: '__custom__',
    hint: '— any Anthropic-compatible server',
  });
  choices.push(separator(), { name: 'Back', value: null });

  const chosen = await select({
    message: 'Which API endpoint should Claude Code use?',
    choices,
    initial: known ? ENDPOINTS.indexOf(known) : (currentBaseUrl ? ENDPOINTS.length : 0),
  });

  if (chosen === null) return null;
  if (chosen !== '__custom__') return chosen;

  write('');
  return input({
    message: 'Base URL',
    defaultValue: currentBaseUrl || DEFAULTS.ANTHROPIC_BASE_URL,
    validate: (value) => {
      try {
        const url = new URL(value);
        if (!/^https?:$/.test(url.protocol)) return 'The URL must start with http:// or https://';
        return true;
      } catch {
        return 'That is not a valid URL';
      }
    },
  });
}

// ── api key ───────────────────────────────────────────────────────────────

function apiKeyHint (baseUrl) {
  const known = findEndpoint(baseUrl);
  if (known) {
    write(c.blue(`  Get or manage your API key at ${known.apiKeysUrl}`));
  } else {
    write(c.gray(`  Key check will use ${modelsUrlFor(baseUrl) || '(unknown model-list URL)'}`));
  }
  write('');
}

/**
 * Ask for a key and verify it against the endpoint. Returns the key, or null
 * if the user backed out.
 */
async function askApiKey (baseUrl, currentKey) {
  for (;;) {
    apiKeyHint(baseUrl);
    if (currentKey) write(`  ${c.gray('Stored key:')} ${c.green(maskSecret(currentKey))}\n`);

    const key = await password({
      message: currentKey ? 'New API key (leave empty to keep the stored one)' : 'API key',
      validate: (value) => {
        if (!value && currentKey) return true;
        if (!value) return 'An API key is required';
        return true;
      },
    });

    if (!key) return currentKey;

    const check = spinner('Checking the key against the endpoint…');
    const result = await validateApiKey(key, baseUrl);

    if (result.valid) {
      check.succeed('API key accepted by the server');
      await sleep(500);
      return key;
    }

    if (result.reason === 'invalid_key') check.fail(`API key rejected: ${result.message}`);
    else if (result.reason === 'unreachable') check.fail(`Endpoint unreachable: ${result.message}`);
    else check.fail(result.message);
    write('');

    const next = await select({
      message: 'What now?',
      choices: [
        { name: 'Enter the key again', value: 'retry' },
        { name: 'Save it anyway (skip the check)', value: 'force' },
        { name: 'Back', value: 'back' },
      ],
    });

    if (next === 'force') return key;
    if (next === 'back') return currentKey ?? null;
    write('');
  }
}

// ── models ────────────────────────────────────────────────────────────────

function modelChoice (id) {
  return { name: id, value: id, hint: `— ${describeContext(id)}` };
}

async function pickFromList (apiKey, baseUrl, message, current) {
  const progress = spinner('Fetching the available models…');
  const result = await listModels(apiKey, baseUrl);

  if (result.error) {
    progress.warn(`Could not fetch the model list: ${result.error}`);
    await sleep(1200);
    return undefined;
  }

  progress.succeed(`Fetched ${result.models.length} models`);
  await sleep(300);
  write('');

  const choices = result.models.map(modelChoice);
  const initial = result.models.indexOf(stripSuffix(current));
  choices.push(separator(), { name: 'Back', value: null });

  return select({
    message,
    choices,
    pageSize: 14,
    initial: initial >= 0 ? initial : 0,
  });
}

/**
 * Model selection screen. Returns { main, small } or null when cancelled.
 * The Opus and Sonnet slots always get the same model: with GLM there is no
 * separate stronger tier, and Claude Code picks between them on its own.
 */
async function pickModels (config) {
  const values = effective(config);
  const currentMain = stripSuffix(values.ANTHROPIC_DEFAULT_SONNET_MODEL);
  const currentSmall = stripSuffix(values.ANTHROPIC_DEFAULT_HAIKU_MODEL);
  const apiKey = config.ANTHROPIC_AUTH_TOKEN;

  for (;;) {
    write(`  ${c.gray('Main model  :')} ${c.green(currentMain)} ${c.gray(`— ${describeContext(currentMain)}`)}`);
    write(`  ${c.gray('Small model :')} ${c.green(currentSmall)} ${c.gray(`— ${describeContext(currentSmall)}`)}`);
    write('');

    const how = await select({
      message: 'How do you want to choose the models?',
      choices: [
        {
          name: 'Use the defaults',
          value: 'default',
          hint: `— ${stripSuffix(DEFAULTS.ANTHROPIC_DEFAULT_SONNET_MODEL)} and ${stripSuffix(DEFAULTS.ANTHROPIC_DEFAULT_HAIKU_MODEL)}`,
        },
        {
          name: 'Pick from the models this key can use',
          value: 'list',
          hint: apiKey ? '— asks the server for the list' : c.gray('— needs an API key first'),
          disabled: !apiKey,
        },
        { name: 'Type the model ids by hand', value: 'manual' },
        separator(),
        { name: 'Back', value: null },
      ],
    });

    if (how === null) return null;

    if (how === 'default') {
      return {
        main: DEFAULTS.ANTHROPIC_DEFAULT_SONNET_MODEL,
        small: DEFAULTS.ANTHROPIC_DEFAULT_HAIKU_MODEL,
      };
    }

    if (how === 'list') {
      const main = await pickFromList(apiKey, values.ANTHROPIC_BASE_URL, 'Main model — used for ordinary work', currentMain);
      if (main === undefined) continue;
      if (main === null) continue;
      write('');
      const small = await pickFromList(apiKey, values.ANTHROPIC_BASE_URL, 'Small model — used for cheap background tasks', currentSmall);
      if (small === undefined || small === null) continue;
      return { main, small };
    }

    write('');
    const main = await input({
      message: 'Main model id',
      defaultValue: currentMain,
      validate: (value) => (value.trim() ? true : 'A model id is required'),
    });
    const small = await input({
      message: 'Small model id',
      defaultValue: currentSmall,
      validate: (value) => (value.trim() ? true : 'A model id is required'),
    });
    return { main, small };
  }
}

/**
 * Write a model pair into the config. The `[1m]` suffix and the auto-compact
 * window are derived here so the two can never contradict each other.
 */
function applyModels (config, { main, small }) {
  const next = { ...config };
  next.ANTHROPIC_DEFAULT_SONNET_MODEL = formatForClaudeCode(main);
  next.ANTHROPIC_DEFAULT_OPUS_MODEL = formatForClaudeCode(main);
  next.ANTHROPIC_DEFAULT_HAIKU_MODEL = formatForClaudeCode(small);
  next.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(contextWindowFor(main));
  return next;
}

// ── advanced ──────────────────────────────────────────────────────────────

async function advancedMenu (version, config) {
  let current = config;

  for (;;) {
    const values = effective(current);
    header(version, 'Advanced options');
    write(c.gray('  These map one-to-one onto environment variables Claude Code reads.'));
    write('');

    const action = await select({
      message: 'Which setting do you want to change?',
      choices: [
        {
          name: 'Request timeout',
          value: 'timeout',
          hint: `— API_TIMEOUT_MS = ${formatTokens(values.API_TIMEOUT_MS)} ms`,
        },
        {
          name: 'Non-essential traffic',
          value: 'traffic',
          hint: values.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === '1' ? '— switched off' : '— left at the Claude Code default',
        },
        {
          name: 'Auto-compact window',
          value: 'compact',
          hint: `— CLAUDE_CODE_AUTO_COMPACT_WINDOW = ${formatTokens(values.CLAUDE_CODE_AUTO_COMPACT_WINDOW)} tokens`,
        },
        separator(),
        { name: 'Back', value: null },
      ],
    });

    if (action === null) return current;

    if (action === 'timeout') {
      write('');
      write(c.gray('  How long Claude Code waits for a single reply. 3000000 ms is 50 minutes.'));
      write('');
      const ms = await input({
        message: 'Timeout in milliseconds',
        defaultValue: values.API_TIMEOUT_MS,
        validate: (value) => (/^\d+$/.test(value) && Number(value) > 0 ? true : 'Enter a positive whole number'),
      });
      current = { ...current, API_TIMEOUT_MS: ms };
      save(current);
    }

    if (action === 'traffic') {
      write('');
      const off = await select({
        message: 'Optional telemetry and update pings',
        choices: [
          { name: 'Switch off non-essential traffic', value: '1', hint: '— sets the variable to 1' },
          { name: 'Leave Claude Code at its default', value: '', hint: '— omits the variable entirely' },
        ],
        initial: values.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === '1' ? 0 : 1,
      });
      current = { ...current, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: off };
      save(current);
    }

    if (action === 'compact') {
      const mainModel = stripSuffix(values.ANTHROPIC_DEFAULT_SONNET_MODEL);
      const matching = String(contextWindowFor(mainModel));
      write('');
      write(c.gray('  Claude Code compacts the conversation once it reaches this many tokens.'));
      write(c.yellow('  Note: changing the main model recalculates this value.'));
      write('');
      const mode = await select({
        message: 'Auto-compact window',
        choices: [
          {
            name: 'Match the main model',
            value: 'auto',
            hint: `— ${formatTokens(matching)} tokens for ${mainModel}`,
          },
          { name: 'Custom value', value: 'custom' },
          separator(),
          { name: 'Back', value: null },
        ],
        initial: values.CLAUDE_CODE_AUTO_COMPACT_WINDOW === matching ? 0 : 1,
      });
      if (mode === 'auto') {
        current = { ...current, CLAUDE_CODE_AUTO_COMPACT_WINDOW: matching };
        save(current);
      } else if (mode === 'custom') {
        write('');
        const tokens = await input({
          message: 'Tokens',
          defaultValue: values.CLAUDE_CODE_AUTO_COMPACT_WINDOW,
          validate: (value) => (/^\d+$/.test(value) && Number(value) > 0 ? true : 'Enter a positive whole number'),
        });
        current = { ...current, CLAUDE_CODE_AUTO_COMPACT_WINDOW: tokens };
        save(current);
      }
    }
  }
}

// ── health check ──────────────────────────────────────────────────────────

function commandExists (name) {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [name], { encoding: 'utf-8', windowsHide: true })
    : spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf-8' });
  return probe.status === 0 && String(probe.stdout || '').trim().length > 0;
}

/**
 * Claude Code applies the `env` block of ~/.claude/settings.json on top of the
 * inherited environment, so anything glm exports can be silently overridden
 * there. This only reads that file and reports what it finds.
 */
function inspectClaudeSettings () {
  const file = path.join(os.homedir(), '.claude', 'settings.json');
  if (!fs.existsSync(file)) return { file, exists: false, overrides: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const env = parsed?.env && typeof parsed.env === 'object' ? parsed.env : {};
    const managed = FIELDS.map(f => f.key);
    const overrides = Object.keys(env).filter(key => managed.includes(key) || key === 'ANTHROPIC_API_KEY');
    return { file, exists: true, overrides };
  } catch (error) {
    return { file, exists: true, overrides: [], error: String(error?.message || error) };
  }
}

export async function runDoctor () {
  const config = load();
  const values = effective(config);
  const results = [];
  const add = (name, passed, message) => results.push({ name, passed, message });

  const check = spinner('Checking configuration files…');
  add('Configuration files', fs.existsSync(JSON_PATH) && fs.existsSync(ENV_PATH),
    fs.existsSync(JSON_PATH) && fs.existsSync(ENV_PATH)
      ? undefined
      : 'One of the two files is missing — run `glm -c` to regenerate them');

  const complete = isComplete(config);
  add('Required settings', complete, complete ? undefined : `Missing: ${missingKeys(config).join(', ')}`);

  check.update('Looking for the claude executable…');
  const claudeFound = commandExists('claude');
  add('claude on PATH', claudeFound, claudeFound ? undefined : 'Install it with `npm install -g @anthropic-ai/claude-code`');

  if (process.platform === 'win32') {
    check.update('Looking for git…');
    const gitFound = commandExists('git');
    add('git on PATH', gitFound, gitFound ? undefined : 'Claude Code needs Git for Windows for its shell tools');
  }

  check.update('Checking the API key and the endpoint…');
  if (!config.ANTHROPIC_AUTH_TOKEN) {
    add('API key', false, 'No key stored — run `glm -c`');
  } else {
    const result = await validateApiKey(config.ANTHROPIC_AUTH_TOKEN, values.ANTHROPIC_BASE_URL);
    add(`Endpoint ${values.ANTHROPIC_BASE_URL}`, result.valid, result.valid ? undefined : result.message);
  }

  check.update('Checking the selected models…');
  if (config.ANTHROPIC_AUTH_TOKEN) {
    const result = await listModels(config.ANTHROPIC_AUTH_TOKEN, values.ANTHROPIC_BASE_URL);
    if (result.models) {
      const wanted = [
        ['Main model', stripSuffix(values.ANTHROPIC_DEFAULT_SONNET_MODEL)],
        ['Small model', stripSuffix(values.ANTHROPIC_DEFAULT_HAIKU_MODEL)],
      ];
      for (const [label, model] of wanted) {
        const known = result.models.includes(model);
        add(`${label} ${model}`, known, known ? undefined : 'The server did not list this model id');
      }
    }
  }

  check.update('Checking for settings that would override glm…');
  const settings = inspectClaudeSettings();
  if (settings.error) {
    add('Claude Code settings.json', false, `Could not be parsed: ${settings.error}`);
  } else if (settings.overrides.length > 0) {
    add('Claude Code settings.json', false,
      `Its "env" block sets ${settings.overrides.join(', ')}, which wins over what glm exports. `
      + `Remove those keys from ${settings.file} — glm never edits that file.`);
  } else {
    add('Claude Code settings.json', true);
  }

  const strayKey = process.env.ANTHROPIC_API_KEY;
  add('ANTHROPIC_API_KEY not set globally', !strayKey,
    strayKey ? 'This variable is set in your shell and Claude Code may prefer it over the key glm exports' : undefined);

  check.stop();

  write('');
  write(c.bold('Health check'));
  write('');
  let allPassed = true;
  for (const result of results) {
    write(`  ${result.passed ? c.green('✔') : c.red('✘')} ${result.name}`);
    if (result.message) write(`      ${c.gray(result.message)}`);
    if (!result.passed) allPassed = false;
  }
  write('');
  if (allPassed) write(c.green('  Everything looks fine.'));
  else write(c.gray('  Run `glm -c` to fix the settings glm owns; the notes above say where anything else lives.'));
  write('');
  return allPassed;
}

// ── setup wizard ──────────────────────────────────────────────────────────

/**
 * First-run flow: endpoint, then key, then models. Saves as it goes so a
 * half-finished run still leaves something useful behind.
 */
export async function runSetup (version, { reason } = {}) {
  let config = load();

  header(version, 'Setup');
  if (reason) {
    write(c.yellow(`  ${reason}`));
    write('');
  }
  write(c.gray('  Three questions: which server, which key, which models.'));
  write(c.gray(`  Answers are stored in ${JSON_PATH}`));
  write(c.gray('  Claude Code\'s own configuration is left untouched.'));
  write('');

  const baseUrl = await pickEndpoint(effective(config).ANTHROPIC_BASE_URL);
  if (baseUrl === null) return null;
  config = { ...config, ANTHROPIC_BASE_URL: baseUrl };
  save(config);

  header(version, 'Setup — API key');
  const key = await askApiKey(baseUrl, config.ANTHROPIC_AUTH_TOKEN);
  if (!key) {
    write(c.red('\n  Without an API key Claude Code cannot start.'));
    write('');
    return null;
  }
  config = { ...config, ANTHROPIC_AUTH_TOKEN: key };
  save(config);

  header(version, 'Setup — models');
  const models = await pickModels(config);
  if (models) {
    config = applyModels(config, models);
    save(config);
  }

  header(version, 'Setup complete');
  printStatus(config);
  write(c.green('  Saved. Run `glm` to start Claude Code with these settings.'));
  write('');
  return config;
}

// ── main menu ─────────────────────────────────────────────────────────────

export async function runMainMenu (version) {
  let config = load();

  for (;;) {
    header(version);
    printStatus(config);

    const action = await select({
      message: 'What do you want to do?',
      choices: [
        { name: 'Run the setup wizard', value: 'setup', hint: '— endpoint, key and models in one pass' },
        { name: 'Change the API endpoint', value: 'endpoint' },
        { name: 'Change the API key', value: 'key' },
        { name: 'Change the models', value: 'models' },
        { name: 'Advanced options', value: 'advanced', hint: '— timeout, telemetry, compact window' },
        separator(),
        { name: 'Health check', value: 'doctor', hint: '— verify the key, the endpoint and the models' },
        { name: 'Remove the glm configuration', value: 'remove' },
        separator(),
        { name: 'Exit', value: 'exit' },
      ],
    });

    if (action === 'exit') {
      write('');
      return;
    }

    if (action === 'setup') {
      const updated = await runSetup(version);
      if (updated) config = updated;
      await pause();
      continue;
    }

    if (action === 'endpoint') {
      header(version, 'API endpoint');
      const baseUrl = await pickEndpoint(effective(config).ANTHROPIC_BASE_URL);
      if (baseUrl) {
        config = { ...config, ANTHROPIC_BASE_URL: baseUrl };
        save(config);
        write('');
        if (config.ANTHROPIC_AUTH_TOKEN) {
          const check = spinner('Re-checking the stored key against the new endpoint…');
          const result = await validateApiKey(config.ANTHROPIC_AUTH_TOKEN, baseUrl);
          if (result.valid) check.succeed('The stored key works with this endpoint');
          else check.warn(`The stored key does not work here: ${result.message}`);
        } else {
          write(c.yellow('  No API key stored yet — set one from the main menu.'));
        }
        write('');
        await pause();
      }
      continue;
    }

    if (action === 'key') {
      header(version, 'API key');
      const key = await askApiKey(effective(config).ANTHROPIC_BASE_URL, config.ANTHROPIC_AUTH_TOKEN);
      if (key) {
        config = { ...config, ANTHROPIC_AUTH_TOKEN: key };
        save(config);
        write(c.green('\n  Saved.'));
        write('');
        await pause();
      }
      continue;
    }

    if (action === 'models') {
      header(version, 'Models');
      const models = await pickModels(config);
      if (models) {
        config = applyModels(config, models);
        save(config);
        const values = effective(config);
        write('');
        write(c.green(`  Main model  : ${values.ANTHROPIC_DEFAULT_SONNET_MODEL}`));
        write(c.green(`  Small model : ${values.ANTHROPIC_DEFAULT_HAIKU_MODEL}`));
        write(c.gray(`  Auto-compact window set to ${formatTokens(values.CLAUDE_CODE_AUTO_COMPACT_WINDOW)} tokens.`));
        write('');
        await pause();
      }
      continue;
    }

    if (action === 'advanced') {
      config = await advancedMenu(version, config);
      continue;
    }

    if (action === 'doctor') {
      header(version, 'Health check');
      await runDoctor();
      await pause();
      continue;
    }

    if (action === 'remove') {
      header(version, 'Remove the glm configuration');
      write(c.gray('  This deletes both glm files. Claude Code and its own settings stay as they are.'));
      write(c.gray(`    ${JSON_PATH}`));
      write(c.gray(`    ${ENV_PATH}`));
      write('');
      const sure = await confirm({ message: 'Delete them?', defaultValue: false });
      if (sure) {
        const removed = removeAll();
        write('');
        if (removed.length === 0) write(c.gray('  Nothing to delete.'));
        else removed.forEach(file => write(c.green(`  Deleted ${file}`)));
        write(c.gray('  The next `glm` run will ask you to set things up again.'));
        config = {};
      }
      write('');
      await pause();
    }
  }
}
