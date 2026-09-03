// Minimal terminal UI toolkit for the glm configuration helper.
//
// Deliberately dependency-free: glm's whole value is that installing it pulls
// nothing but this package, so the arrow-key menus, masked input and spinner
// are implemented directly on top of node:readline and raw-mode stdin.

import process from 'node:process';
import readline from 'node:readline';

const ESC = '\x1b';

// No colour when the output is piped into a file or another program, when
// NO_COLOR is set, or on a terminal that cannot render escape sequences.
const colorEnabled = process.env.NO_COLOR == null
  && process.env.TERM !== 'dumb'
  && Boolean(process.stdout.isTTY);

const wrap = (open, close) => (s) => (colorEnabled ? `${ESC}[${open}m${s}${ESC}[${close}m` : String(s));

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

export function stripAnsi (s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

const width = () => process.stdout.columns || 80;

/** Cut a string to the terminal width without slicing an escape sequence apart. */
function fit (line) {
  const max = width() - 1;
  if (stripAnsi(line).length <= max) return line;
  let out = '';
  let visible = 0;
  let i = 0;
  while (i < line.length && visible < max - 1) {
    if (line[i] === ESC) {
      const end = line.indexOf('m', i);
      if (end === -1) break;
      out += line.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    out += line[i];
    visible += 1;
    i += 1;
  }
  return `${out}…${colorEnabled ? `${ESC}[0m` : ''}`;
}

/**
 * Print one line. Nothing is truncated here — only the in-place re-render of
 * `select` needs lines to fit on a single terminal row.
 */
export function write (line = '') {
  process.stdout.write(`${line}\n`);
}

export function clearScreen () {
  process.stdout.write(`${ESC}[2J${ESC}[H`);
}

const BOX_WIDTH = 66;

function centered (text, boxWidth) {
  const inner = boxWidth - 2;
  const len = stripAnsi(text).length;
  const left = Math.max(0, Math.floor((inner - len) / 2));
  const right = Math.max(0, inner - len - left);
  return `║${' '.repeat(left)}${text}${' '.repeat(right)}║`;
}

/** Draw a double-line box with a centred title. */
export function box (title, subtitle) {
  const top = `╔${'═'.repeat(BOX_WIDTH - 2)}╗`;
  const bottom = `╚${'═'.repeat(BOX_WIDTH - 2)}╝`;
  write('');
  write(c.cyan(top));
  write(c.cyan(centered(c.bold(title), BOX_WIDTH)));
  if (subtitle) write(c.cyan(centered(c.gray(subtitle), BOX_WIDTH)));
  write(c.cyan(bottom));
  write('');
}

export function separator () {
  return { separator: true };
}

function assertInteractive () {
  if (!process.stdin.isTTY) {
    throw new Error('glm configuration needs an interactive terminal. Run `glm -c` directly in your shell.');
  }
}

function onCancel () {
  process.stdout.write(`${ESC}[?25h\n`);
  process.stdout.write(`${c.gray('Cancelled.')}\n`);
  process.exit(130);
}

/**
 * Arrow-key list. Returns the `value` of the chosen entry.
 *
 * choices: array of { name, value, disabled?, hint? } or separator() markers.
 */
export function select ({ message, choices, pageSize = 12, initial = 0 }) {
  assertInteractive();

  const selectable = choices
    .map((ch, i) => ({ ch, i }))
    .filter(({ ch }) => !ch.separator && !ch.disabled)
    .map(({ i }) => i);

  if (selectable.length === 0) throw new Error('select() called without any selectable choice');

  let cursor = selectable.includes(initial) ? initial : selectable[0];
  let start = 0;
  let printed = 0;

  const visibleCount = Math.min(pageSize, choices.length);

  const ensureVisible = () => {
    if (cursor < start) start = cursor;
    if (cursor >= start + visibleCount) start = cursor - visibleCount + 1;
    start = Math.max(0, Math.min(start, choices.length - visibleCount));
  };

  const render = () => {
    ensureVisible();
    const lines = [];
    if (message) lines.push(c.bold(message));
    lines.push(c.gray('  Use ↑/↓ to move, Enter to confirm, Ctrl+C to cancel'));
    lines.push('');

    const slice = choices.slice(start, start + visibleCount);
    slice.forEach((ch, offset) => {
      const index = start + offset;
      if (ch.separator) {
        lines.push(c.gray('  ──────────────────────────────────────────────'));
        return;
      }
      const label = ch.hint ? `${ch.name} ${c.gray(ch.hint)}` : ch.name;
      if (ch.disabled) {
        lines.push(`    ${c.gray(stripAnsi(label))}`);
      } else if (index === cursor) {
        lines.push(c.cyan(`  ❯ ${label}`));
      } else {
        lines.push(`    ${label}`);
      }
    });

    if (choices.length > visibleCount) {
      const shown = `${start + 1}-${start + visibleCount} of ${choices.length}`;
      lines.push(c.gray(`  … ${shown}`));
    }

    if (printed) process.stdout.write(`${ESC}[${printed}A${ESC}[J`);
    process.stdout.write(`${lines.map(fit).join('\n')}\n`);
    printed = lines.length;
  };

  const move = (delta) => {
    const pos = selectable.indexOf(cursor);
    const next = (pos + delta + selectable.length) % selectable.length;
    cursor = selectable[next];
  };

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    process.stdout.write(`${ESC}[?25l`);
    render();

    const finish = (value) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      process.stdout.write(`${ESC}[?25h`);
      resolve(value);
    };

    const onData = (key) => {
      switch (key) {
        case '\x03': // Ctrl+C
          stdin.removeListener('data', onData);
          stdin.setRawMode(Boolean(wasRaw));
          onCancel();
          return;
        case `${ESC}[A`:
        case 'k':
          move(-1);
          render();
          return;
        case `${ESC}[B`:
        case 'j':
          move(1);
          render();
          return;
        case `${ESC}[5~`: // PageUp
          for (let n = 0; n < visibleCount; n += 1) move(-1);
          render();
          return;
        case `${ESC}[6~`: // PageDown
          for (let n = 0; n < visibleCount; n += 1) move(1);
          render();
          return;
        case `${ESC}[H`:
          cursor = selectable[0];
          render();
          return;
        case `${ESC}[F`:
          cursor = selectable[selectable.length - 1];
          render();
          return;
        case '\r':
        case '\n':
          finish(choices[cursor].value);
          return;
        default:
          break;
      }
      // Digits 1-9 jump straight to a selectable entry.
      if (/^[1-9]$/.test(key)) {
        const idx = selectable[Number(key) - 1];
        if (idx != null) {
          cursor = idx;
          render();
        }
      }
    };

    stdin.on('data', onData);
  });
}

/** Free-text question with full line editing, courtesy of readline. */
export function input ({ message, defaultValue = '', validate }) {
  assertInteractive();
  const hint = defaultValue ? ` ${c.gray(`[${defaultValue}]`)}` : '';

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const askOnce = () => {
      rl.question(`${c.bold(message)}${hint}: `, (answer) => {
        const value = answer.trim() === '' ? defaultValue : answer.trim();
        const problem = validate ? validate(value) : true;
        if (problem !== true) {
          process.stdout.write(`${c.red(`  ${problem}`)}\n`);
          askOnce();
          return;
        }
        rl.close();
        resolve(value);
      });
    };
    rl.on('SIGINT', () => { rl.close(); onCancel(); });
    askOnce();
  });
}

/** Hidden question. Typed characters show up as dots; backspace works. */
export function password ({ message, validate }) {
  assertInteractive();

  const askOnce = () => new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let buffer = '';

    process.stdout.write(`${c.bold(message)}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (key) => {
      if (key === '\x03') { // Ctrl+C
        stdin.removeListener('data', onData);
        stdin.setRawMode(Boolean(wasRaw));
        onCancel();
        return;
      }
      if (key === '\r' || key === '\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(Boolean(wasRaw));
        stdin.pause();
        process.stdout.write('\n');
        resolve(buffer);
        return;
      }
      if (key === '\x7f' || key === '\b') {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      // Ignore remaining control characters and escape sequences.
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x1f]/.test(key)) return;
      buffer += key;
      process.stdout.write('●'.repeat(key.length));
    };

    stdin.on('data', onData);
  });

  const loop = async () => {
    for (;;) {
      const value = (await askOnce()).trim();
      const problem = validate ? validate(value) : true;
      if (problem === true) return value;
      process.stdout.write(`${c.red(`  ${problem}`)}\n`);
    }
  };

  return loop();
}

export async function confirm ({ message, defaultValue = false }) {
  const answer = await select({
    message,
    choices: [
      { name: 'Yes', value: true },
      { name: 'No', value: false },
    ],
    initial: defaultValue ? 0 : 1,
  });
  return answer;
}

/** Wait for any single keypress. Ctrl+C still cancels. */
export function pause (text = 'Press any key to continue') {
  assertInteractive();
  process.stdout.write(`${c.gray(text)}`);

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (key) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      if (key === '\x03') {
        onCancel();
        return;
      }
      process.stdout.write('\n');
      resolve();
    };

    stdin.on('data', onData);
  });
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Small indeterminate progress indicator. When the output is not a terminal
 * there is nothing to animate in place, so it only prints the final line.
 */
export function spinner (text) {
  let frame = 0;
  let current = text;
  let timer = null;

  if (!process.stdout.isTTY) {
    return {
      update (next) { current = next; },
      succeed (line) { write(`✔ ${line ?? current}`); },
      fail (line) { write(`✘ ${line ?? current}`); },
      warn (line) { write(`! ${line ?? current}`); },
      stop () {},
    };
  }

  const paint = () => {
    process.stdout.write(`\r${ESC}[2K${c.cyan(SPINNER_FRAMES[frame])} ${current}`);
    frame = (frame + 1) % SPINNER_FRAMES.length;
  };

  const stopWith = (line) => {
    if (timer) clearInterval(timer);
    timer = null;
    process.stdout.write(`\r${ESC}[2K`);
    if (line) process.stdout.write(`${fit(line)}\n`);
    process.stdout.write(`${ESC}[?25h`);
  };

  process.stdout.write(`${ESC}[?25l`);
  paint();
  timer = setInterval(paint, 90);

  return {
    update (next) { current = next; },
    succeed (line) { stopWith(`${c.green('✔')} ${line ?? current}`); },
    fail (line) { stopWith(`${c.red('✘')} ${line ?? current}`); },
    warn (line) { stopWith(`${c.yellow('!')} ${line ?? current}`); },
    stop () { stopWith(null); },
  };
}

export const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
