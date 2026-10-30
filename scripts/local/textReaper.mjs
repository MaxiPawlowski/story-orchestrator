import fs from 'node:fs';
import path from 'node:path';
import { createLedger, runReaper } from './orphans.mjs';

const [ledgerFile, binary, owner] = process.argv.slice(2);
const ownerPid = Number(owner);
if (!ledgerFile || !binary || !Number.isInteger(ownerPid)) throw new Error('Usage: node scripts/local/textReaper.mjs <ledger.json> <llama-server path> <controller pid>');
const logFile = path.join(path.dirname(ledgerFile), 'text-reaper.log');
const log = (line) => { try { fs.appendFileSync(logFile, `${new Date().toISOString()} controller ${ownerPid}: ${line}\n`); } catch {} };
let started = false;
const reap = () => {
    if (started) return;
    started = true;
    void runReaper({ ledger: createLedger(ledgerFile), binary, ownerPid, log })
        .then((result) => { if (result.reaped.length || result.survivors.length) log(`reaped ${result.reaped.join(', ') || 'none'}; still running ${result.survivors.join(', ') || 'none'}`); })
        .catch((error) => log(`reaper failed: ${error.message}`))
        .finally(() => process.exit(0));
};
process.stdin.on('end', reap);
process.stdin.on('close', reap);
process.stdin.on('error', reap);
process.stdin.resume();
