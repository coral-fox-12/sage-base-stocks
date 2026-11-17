// Log in to Surge non-interactively using the saved account in the ledger.
// Reads email+password from ~/workspace/makefun/accounts-created.json
// (accounts.surge) and pipes them to `surge login` stdin. Prints ONLY
// status lines — never the password or the token.
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const LEDGER = '/home/hatch/workspace/makefun/accounts-created.json';
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const acct = ledger.accounts?.surge;
if (!acct?.email || !acct?.password) {
  console.error('LOGIN FAIL: surge account not in ledger');
  process.exit(1);
}

function run(cmd, args, input, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { p.kill('SIGKILL'); resolve({ code: null, out, err: err + '\n[TIMEOUT]' }); }, timeoutMs);
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: null, out, err: String(e) }); });
    if (input) { p.stdin.write(input); p.stdin.end(); }
  });
}

const login = await run('surge', ['login'], `${acct.email}\n${acct.password}\n`);
console.log('login exit:', login.code);
// Scrub any accidental credential echo from the output before printing.
const scrub = (s) => s.split(acct.password).join('[password]').split(acct.email).join('[email]');
console.log('login stdout:', scrub(login.out).slice(0, 500));
console.log('login stderr:', scrub(login.err).slice(0, 500));
console.log('.netrc exists:', fs.existsSync('/home/hatch/.netrc'));

const who = await run('surge', ['whoami'], null, 30000);
console.log('whoami exit:', who.code);
console.log('whoami stdout:', scrub(who.out).slice(0, 300));
console.log('whoami stderr:', scrub(who.err).slice(0, 300));
process.exit(who.code === 0 ? 0 : 1);
