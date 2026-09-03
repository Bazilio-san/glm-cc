#!/usr/bin/env node
// Configuration front-end for @bazilio-san/glm-cc.
//
// Invoked when the user runs:
//   glm -c | --glm-config   → interactive configuration menu
//   glm --glm-show          → print the current settings
//   glm --glm-doctor        → health check
//   glm --glm-version       → print the glm version
//   glm --glm-help          → list the glm-specific flags
// Or internally by glm.cmd / glm.sh on first launch (--setup) to create
// ~/.glm-claude-code.env from ~/.glm-claude-code.json.
//
// CRITICAL: this Node process must NOT stay alive while `claude` runs. glm's
// entry point is a shell script that sets the environment variables and then
// tail-calls claude directly; a Node process sitting in between would break
// the parent terminal's ConPty session and with it Claude Code's raw keyboard
// input. Everything here therefore finishes and exits before claude starts.

import { createRequire } from 'node:module';

import { ENV_PATH, JSON_PATH, isComplete, missingKeys, refreshEnv, load } from './lib/config.js';
import { runDoctor, runMainMenu, runSetup, showConfig } from './lib/wizard.js';
import { c, write } from './lib/ui.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

function printHelp () {
  write('');
  write(c.bold(`glm v${pkg.version}`));
  write(c.gray('  Runs Claude Code against a GLM-compatible API endpoint.'));
  write('');
  write(c.bold('glm-specific flags'));
  write(`  ${'-c, --glm-config'.padEnd(20)} open the configuration menu`);
  write(`  ${'--glm-show'.padEnd(20)} print the current settings`);
  write(`  ${'--glm-doctor'.padEnd(20)} check the key, the endpoint and the models`);
  write(`  ${'--glm-version'.padEnd(20)} print the glm version`);
  write(`  ${'--glm-help'.padEnd(20)} this list`);
  write('');
  write(c.gray('  Every other argument is passed straight through to `claude`,'));
  write(c.gray('  so `glm -p "hello"` and `glm mcp serve` behave as usual.'));
  write(c.gray('  Note that -c is taken by glm and never reaches claude.'));
  write('');
  write(c.bold('Files glm owns'));
  write(c.gray(`  ${JSON_PATH}`));
  write(c.gray(`  ${ENV_PATH}`));
  write(c.gray('  Claude Code\'s own configuration is never modified.'));
  write('');
}

async function main () {
  const args = process.argv.slice(2);
  const has = (flag) => args.includes(flag);

  if (has('--glm-version')) {
    write(`glm v${pkg.version}`);
    return 0;
  }

  if (has('--glm-help')) {
    printHelp();
    return 0;
  }

  if (has('--glm-show')) {
    showConfig();
    return 0;
  }

  if (has('--glm-doctor')) {
    const healthy = await runDoctor();
    return healthy ? 0 : 1;
  }

  if (has('--setup')) {
    // Called by glm.cmd / glm.sh when ~/.glm-claude-code.env is missing.
    // A complete JSON just needs the sidecar rewritten; anything else means
    // the user has to answer the setup questions.
    const config = load();
    if (isComplete(config)) {
      refreshEnv();
      return 0;
    }
    const reason = Object.keys(config).length === 0
      ? 'No glm configuration found yet.'
      : `Some settings are missing: ${missingKeys(config).join(', ')}`;
    const result = await runSetup(pkg.version, { reason });
    return result ? 0 : 1;
  }

  await runMainMenu(pkg.version);
  return 0;
}

main()
  .then((code) => { process.exit(code); })
  .catch((error) => {
    write(c.red(`glm: ${error?.message || error}`));
    process.exit(1);
  });
