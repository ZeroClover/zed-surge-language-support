import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'tree-sitter-surge');
const repo = path.join(root, '.build', 'grammar-repository');
for (const language of ['surge-module', 'surge-ruleset']) {
  for (const query of ['highlights.scm', 'brackets.scm', 'outline.scm', 'overrides.scm', 'redactions.scm']) {
    cpSync(path.join(root, 'languages/surge', query), path.join(root, 'languages', language, query));
  }
}
if (!existsSync(path.join(source, 'src', 'parser.c'))) throw new Error('Run npm ci && npm run generate first.');
mkdirSync(repo, { recursive: true });
for (const name of ['src', 'grammar.js', 'tree-sitter.json']) cpSync(path.join(source, name), path.join(repo, name), { recursive: true });
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
if (!existsSync(path.join(repo, '.git'))) git('init', '--quiet');
git('add', '.');
// Commit only the disposable grammar snapshot, never the user's workspace.
if (git('status', '--porcelain')) {
  git('-c', 'user.name=Surge grammar builder', '-c', 'user.email=local@invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Local Surge grammar snapshot');
}
const manifest = path.join(root, 'extension.toml');
const text = readFileSync(manifest, 'utf8').replace(/\[grammars\.surge\][\s\S]*$/, `[grammars.surge]\nrepository = ${JSON.stringify(pathToFileURL(repo).href)}\nrev = "${git('rev-parse', 'HEAD')}"\n`);
writeFileSync(manifest, text);
console.log(`Ready for Zed: Install Dev Extension → ${root}`);
