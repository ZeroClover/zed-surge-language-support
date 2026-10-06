import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cli = process.argv[2] || '/Applications/Surge.app/Contents/Applications/surge-cli';
// Run surge-cli through the same bridge Zed launches.
const bridge = fileURLToPath(new URL('../server/surge-lsp.mjs', import.meta.url));
const help = execFileSync(process.execPath, [bridge, 'check', cli], { encoding: 'utf8' });
assert.match(help, /Usage:\s*(?:surge-cli\s+)?lsp[^\r\n]*--stdio/);
const folder = mkdtempSync(path.join(tmpdir(), 'zed-surge-lsp-'));
const rootUri = pathToFileURL(folder).href;
assert.throws(() => execFileSync(process.execPath, [bridge, 'check', '/usr/bin/false'], { stdio: 'pipe' }));
const child = spawn(process.execPath, [bridge, 'serve', cli, 'lsp', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
const registrations = [];
let bytes = Buffer.alloc(0);
let stderr = '';
let nextId = 1;
const messages = [];
const pending = new Map();
const waiters = new Set();
const send = message => {
  const data = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
  child.stdin.write(`Content-Length: ${data.length}\r\n\r\n`);
  child.stdin.write(data);
};
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out: ${stderr}`)); }, 8000);
    pending.set(id, { resolve, reject, timer });
    send({ id, method, params });
  });
}
function diagnostics(uri, predicate) {
  return new Promise((resolve, reject) => {
    const entry = { uri, predicate, resolve, timer: setTimeout(() => {
      waiters.delete(entry);
      reject(new Error(`No expected diagnostics for ${uri}: ${JSON.stringify(messages)}`));
    }, 8000) };
    waiters.add(entry);
  });
}
child.stderr.on('data', data => { stderr += data; });
child.stdout.on('data', data => {
  bytes = Buffer.concat([bytes, data]);
  for (;;) {
    const split = bytes.indexOf('\r\n\r\n');
    if (split < 0) return;
    const match = /Content-Length:\s*(\d+)/i.exec(bytes.subarray(0, split).toString());
    assert(match, 'Missing Content-Length');
    const size = Number(match[1]);
    if (bytes.length < split + 4 + size) return;
    const message = JSON.parse(bytes.subarray(split + 4, split + 4 + size));
    bytes = bytes.subarray(split + 4 + size);
    if (message.method && message.id !== undefined) {
      console.log('Server request:', message.method, JSON.stringify(message.params));
      if (message.method === 'client/registerCapability') registrations.push(...message.params.registrations);
      send({ id: message.id, result: message.method === 'workspace/configuration' ? message.params.items.map(() => null) : null });
    } else if (pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
    } else if (message.method === 'textDocument/publishDiagnostics') {
      messages.push(message.params);
      for (const entry of waiters) {
        if (entry.uri === message.params.uri && entry.predicate(message.params.diagnostics)) {
          clearTimeout(entry.timer);
          waiters.delete(entry);
          entry.resolve(message.params);
        }
      }
    }
  }
});
try {
  const initialized = await request('initialize', {
    processId: process.pid, rootUri,
    workspaceFolders: [{ uri: rootUri, name: 'Synthetic Surge tests' }],
    capabilities: { workspace: { didChangeWatchedFiles: { dynamicRegistration: true } }, textDocument: { publishDiagnostics: { versionSupport: true } } },
  });
  console.log('Server capabilities:', JSON.stringify(initialized.capabilities));
  send({ method: 'initialized', params: {} });
  await new Promise(resolve => setTimeout(resolve, 500));
  assert(registrations.some(r => r.method === 'workspace/didChangeWatchedFiles' &&
    r.registerOptions.watchers.some(w => w.globPattern === '**/*')), 'bridge registers the include watcher');
  for (const [languageId, filename, invalid, valid] of [
    ['surge', 'test.sgconf', '[General]\nnot-a-surge-setting = true\n[Rule]\nFINAL,DIRECT\n', '[General]\nloglevel = notify\n[Rule]\nFINAL,DIRECT\n'],
    ['surge-module', 'test.sgmodule', '#!name=Test\n[General]\nnot-a-surge-setting = true\n', '#!name=Test\n[General]\nloglevel = notify\n'],
    ['surge-ruleset', 'test.list', 'IP-CIDR,not-an-ip\n', 'DOMAIN,example.com\n'],
  ]) {
    const uri = pathToFileURL(path.join(folder, filename)).href;
    const bad = diagnostics(uri, items => items.length > 0);
    send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId, version: 1, text: invalid } } });
    const result = await bad;
    console.log(`${languageId}: rejected invalid text:`, result.diagnostics.map(d => d.message).join('; '));
    const good = diagnostics(uri, items => items.length === 0);
    send({ method: 'textDocument/didChange', params: { textDocument: { uri, version: 2 }, contentChanges: [{ text: valid }] } });
    await good;
    console.log(`${languageId}: diagnostics cleared after unsaved edit`);
    send({ method: 'textDocument/didClose', params: { textDocument: { uri } } });
  }
  const mainPath = path.join(folder, 'Main.sgconf');
  const detachedPath = path.join(folder, 'Rules.dconf');
  const mainUri = pathToFileURL(mainPath).href;
  const detachedUri = pathToFileURL(detachedPath).href;
  const mainText = '[Proxy]\nKnown = direct\n[Rule]\n#!include Rules.dconf\nFINAL,DIRECT\n';
  const detachedText = '[Rule]\nDOMAIN,example.com,Known\n';
  writeFileSync(mainPath, mainText);
  writeFileSync(detachedPath, detachedText);
  const mainReady = diagnostics(mainUri, items => items.length === 0);
  send({ method: 'textDocument/didOpen', params: { textDocument: { uri: mainUri, languageId: 'surge', version: 1, text: mainText } } });
  await mainReady;
  const includedReady = diagnostics(detachedUri, items => items.length === 0);
  send({ method: 'textDocument/didOpen', params: { textDocument: { uri: detachedUri, languageId: 'surge', version: 1, text: detachedText } } });
  await includedReady;
  const missingPolicy = diagnostics(detachedUri, items => items.length > 0);
  send({ method: 'textDocument/didChange', params: { textDocument: { uri: detachedUri, version: 2 }, contentChanges: [{ text: '[Rule]\nDOMAIN,example.com,MissingPolicy\n' }] } });
  const missingResult = await missingPolicy;
  console.log('Detached profile context:', missingResult.diagnostics.map(d => d.message).join('; '));
  const repairedPolicy = diagnostics(detachedUri, items => items.length === 0);
  send({ method: 'textDocument/didChange', params: { textDocument: { uri: detachedUri, version: 3 }, contentChanges: [{ text: detachedText }] } });
  await repairedPolicy;
  console.log('PASS: detached profile resolves a policy from the open main profile.');

  // An unopened include changes on disk: the watcher notification alone refreshes the open profile.
  const watchedPath = path.join(folder, 'Watched.sgconf');
  const includePath = path.join(folder, 'Proxies.dconf');
  const watchedUri = pathToFileURL(watchedPath).href;
  const watchedText = '[Proxy]\n#!include Proxies.dconf\n[Rule]\nDOMAIN,example.com,Later\nFINAL,DIRECT\n';
  writeFileSync(includePath, '[Proxy]\nOther = direct\n');
  writeFileSync(watchedPath, watchedText);
  const stale = diagnostics(watchedUri, items => items.length > 0);
  send({ method: 'textDocument/didOpen', params: { textDocument: { uri: watchedUri, languageId: 'surge', version: 1, text: watchedText } } });
  await stale;
  const refreshed = diagnostics(watchedUri, items => items.length === 0);
  writeFileSync(includePath, '[Proxy]\nLater = direct\n');
  send({ method: 'workspace/didChangeWatchedFiles', params: { changes: [{ uri: pathToFileURL(includePath).href, type: 2 }] } });
  await refreshed;
  console.log('PASS: a watched include change refreshes the open profile without editing it.');
  // Surge build 12460 requires object params, including for shutdown/exit.
  await request('shutdown', {});
  send({ method: 'exit', params: {} });
  console.log('PASS: real Surge CLI through the bridge: check, initialize, three language IDs, live diagnostics, shutdown.');
} finally {
  child.kill();
  for (const item of [...pending.values(), ...waiters]) clearTimeout(item.timer);
  rmSync(folder, { recursive: true, force: true });
}
