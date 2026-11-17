#!/usr/bin/env node
// Git credential helper: prints the GitHub username for Username prompts
// and the PAT (read at runtime from the mode-600 file) for Password prompts.
// Never prints anything else. Used as GIT_ASKPASS for pushes.
import fs from 'node:fs';
const prompt = process.argv[2] || '';
if (/username/i.test(prompt)) {
  process.stdout.write('coral-fox-12');
} else {
  process.stdout.write(fs.readFileSync('/home/hatch/workspace/makefun/github-pat.txt', 'utf8').trim());
}
