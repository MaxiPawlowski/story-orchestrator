import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

export const LOG_CHUNK = 1 << 20;
export const LOG_LINE_MAX = 1 << 16;

export const logBytes = (path: string): number => (existsSync(path) ? statSync(path).size : 0);

export function grepLog(path: string, keep: (line: string) => boolean, from = 0, chunk = LOG_CHUNK): string[] {
  if (!existsSync(path)) return [];
  const size = statSync(path).size;
  let at = from > size ? 0 : Math.max(0, from);
  const kept: string[] = [];
  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.alloc(chunk);
  let carry = '';
  let clipped = false;
  const take = (line: string) => { if (keep(line.replace(/\r$/, ''))) kept.push(line.replace(/\r$/, '')); };
  const fd = openSync(path, 'r');
  try {
    while (at < size) {
      const read = readSync(fd, buffer, 0, Math.min(chunk, size - at), at);
      if (read <= 0) break;
      at += read;
      const parts = (carry + decoder.write(buffer.subarray(0, read))).split('\n');
      carry = parts.pop() ?? '';
      parts.forEach((line, index) => { if (index > 0 || !clipped) take(line); });
      if (parts.length) clipped = false;
      if (carry.length > LOG_LINE_MAX) {
        if (!clipped) take(carry.slice(0, LOG_LINE_MAX));
        carry = '';
        clipped = true;
      }
    }
  } finally { closeSync(fd); }
  const rest = carry + decoder.end();
  if (rest && !clipped) take(rest);
  return kept;
}
