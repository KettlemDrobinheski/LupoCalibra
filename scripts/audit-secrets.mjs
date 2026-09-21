import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const patterns = [
  ['public-firebase-web-api-key', /AIza[0-9A-Za-z_-]{35}/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ['service-account-json', /["']type["']\s*:\s*["']service_account["']/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ['cloud-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['jwt-candidate', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g],
  ['credentialed-url', /https?:\/\/[^\s/:'"<>]+:[^\s/@'"<>]+@/g],
  ['sensitive-assignment', /(?:["']?(?:password|passwd|senha|secret|client_secret|private_key|access_token|refresh_token|api_token|firebase_token)["']?)\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi],
];
const findings = [];
function scan(content, location) {
  if (content.includes('\0')) return;
  for (const [category, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      if (category === 'sensitive-assignment' && /^(?:your[-_ ]|example|placeholder|process\.env|test[-_]|current-password)/i.test(match[1])) continue;
      findings.push({ location, line: content.slice(0, match.index).split('\n').length, category });
    }
  }
}

try {
  const files = execFileSync('rg', ['--files', '--hidden', '--no-ignore', '-g', '!.git', '-g', '!node_modules', '-g', '!.next', '-g', '!.vercel', '-g', '!*-debug.log*'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split(/\r?\n/).filter(Boolean);
  for (const file of files) scan(readFileSync(file, 'utf8'), `worktree:${file}`);
  scan(git(['config', '--local', '--list']), 'git-local-config');
  const seen = new Set();
  const revisions = git(['rev-list', '--all']).trim().split(/\r?\n/).filter(Boolean);
  for (const revision of revisions) {
    const entries = git(['ls-tree', '-r', revision]).trim().split(/\r?\n/).filter(Boolean);
    for (const entry of entries) {
      const match = entry.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      scan(git(['cat-file', 'blob', match[1]]), `history:${revision.slice(0, 8)}:${match[2]}`);
    }
  }
  console.log(JSON.stringify({ scannedWorktreeFiles: files.length, scannedCommits: revisions.length, scannedHistoricalBlobs: seen.size, findings }, null, 2));
  if (findings.some(item => item.category !== 'public-firebase-web-api-key')) process.exitCode = 1;
} catch {
  console.error('Audit could not complete. Check git/rg availability and subprocess permissions; no file contents were printed.');
  process.exitCode = 2;
}
