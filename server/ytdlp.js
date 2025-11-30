import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appConfig } from './config.js';

/**
 * Spawns yt-dlp with the provided configuration and emits progress updates.
 * @param {object} options
 * @param {string} options.url
 * @param {string[]} options.args
 * @param {number} [options.maxFileSizeMb]
 * @returns {{ child: import('node:child_process').ChildProcessWithoutNullStreams, events: EventEmitter }}
 */
export function runYtDlp({ url, args, maxFileSizeMb = appConfig.download.maxFileSizeMb }) {
  const events = new EventEmitter();
  const sizeArgs =
    maxFileSizeMb && maxFileSizeMb > 0
      ? ['--max-filesize', `${maxFileSizeMb}M`]
      : [];
  const ytArgs = [url, '--newline', '--no-warnings', ...sizeArgs, ...args];
  const child = spawn('yt-dlp', ytArgs, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const parseProgress = (line) => {
    const match = line.match(/(\d+(?:\.\d+)?)%/);
    if (!match) return;
    const progress = Number.parseFloat(match[1]);
    if (!Number.isNaN(progress)) {
      events.emit('progress', progress);
    }
  };

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line) continue;
      events.emit('stdout', line);
      parseProgress(line);
    }
  });

  child.stderr.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line) continue;
      events.emit('stderr', line);
      parseProgress(line);
    }
  });

  child.on('error', (error) => events.emit('error', error));
  child.on('close', (code) => events.emit('close', code));

  return { child, events };
}
