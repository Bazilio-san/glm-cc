#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const c = '\x1b[35m';
const y = '\x1b[33m';
const r = '\x1b[31m';
const g = '\x1b[32m';
const c0 = '\x1b[0m';

function log(color, msg) {
  process.stdout.write(`${color}${msg}${c0}\n`);
}

function run(cmd, opts = {}) {
  try {
    const result = execSync(cmd, { encoding: 'utf-8', stdio: opts.stdio || 'pipe', cwd: opts.cwd || projectRoot });
    return result ? result.trim() : '';
  } catch (e) {
    if (opts.ignoreError) return '';
    log(r, `**** ERROR running: ${cmd} ****`);
    log(r, e.stderr || e.message);
    throw e;
  }
}

function fail(msg) {
  log(r, msg);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function bumpPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function setJsonVersion(filePath, newVer) {
  const content = readFileSync(filePath, 'utf-8');
  writeFileSync(filePath, content.replace(/("version"\s*:\s*")[\d.]+(")/, `$1${newVer}$2`), 'utf-8');
}

// ── Main ──

const expectedBranch = 'master';

const branch = run('git symbolic-ref --short HEAD');
if (branch !== expectedBranch) {
  fail(`**** git branch should be ${expectedBranch}, current: ${branch} ****`);
}

// 1. Bump version
const pkgPath = join(projectRoot, 'package.json');
const pkg = readJson(pkgPath);
const oldVersion = pkg.version;
const newVersion = bumpPatch(oldVersion);
const repoName = pkg.name;

log(c, `**** Bumping ${repoName}: ${oldVersion} -> ${newVersion} ****`);
setJsonVersion(pkgPath, newVersion);

// 2. Commit & push
run('git add -A');
run(`git commit --no-verify -m "${newVersion}"`);
run(`git push origin refs/heads/${expectedBranch}:${expectedBranch}`);
log(g, '**** Pushed commit ****');

// 3. npm publish
log(c, '**** Publishing to npm ****');
run('npm publish', { stdio: 'inherit' });

log(g, `\n**** Done: ${repoName}@${newVersion} ****`);
