// Runs surge-cli for Zed.
//   check <cli>             print `surge-cli help lsp`, bounded like the VS Code extension
//   serve <cli> [args...]   relay LSP messages and register the file watcher that
//                           surge-cli reacts to but never requests, so edits to
//                           unopened include files refresh diagnostics.
import { execFileSync, spawn } from 'node:child_process';

const [mode, cli, ...args] = process.argv.slice(2);
const WATCH = 'surge-zed-watch-files';

if (mode === 'check') {
  try {
    process.stdout.write(execFileSync(cli, ['help', 'lsp'], {
      encoding: 'utf8', timeout: 3000, maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (error) {
    process.stderr.write(error.code === 'ETIMEDOUT' ? 'timed out after 3 seconds' : error.message);
    process.exit(1);
  }
} else if (mode === 'serve') {
  serve();
} else {
  process.stderr.write('Usage: surge-lsp.mjs check|serve <surge-cli> [args...]\n');
  process.exit(2);
}

function frames(stream, onMessage) {
  let buffer = Buffer.alloc(0);
  stream.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) return;
      const length = /Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString());
      if (!length) throw new Error('LSP message without Content-Length');
      const start = end + 4;
      if (buffer.length < start + Number(length[1])) return;
      onMessage(buffer.subarray(start, start + Number(length[1])));
      buffer = buffer.subarray(start + Number(length[1]));
    }
  });
}

function send(stream, body) {
  stream.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
}

function serve() {
  const server = spawn(cli, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let canWatch = false;
  frames(process.stdin, body => {
    const message = JSON.parse(body);
    if (message.id === WATCH && !message.method) {
      if (message.error) process.stderr.write(`Zed rejected the Surge file watcher: ${JSON.stringify(message.error)}\n`);
      return;
    }
    if (message.method === 'initialize') {
      canWatch = message.params?.capabilities?.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;
    }
    send(server.stdin, body);
    // Includes may use any extension, so watch the whole worktree as VS Code does.
    if (message.method === 'initialized' && canWatch) {
      send(process.stdout, Buffer.from(JSON.stringify({
        jsonrpc: '2.0', id: WATCH, method: 'client/registerCapability',
        params: { registrations: [{ id: WATCH, method: 'workspace/didChangeWatchedFiles', registerOptions: { watchers: [{ globPattern: '**/*' }] } }] },
      })));
    }
  });
  frames(server.stdout, body => send(process.stdout, body));
  process.stdin.on('end', () => server.stdin.end());
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => server.kill(signal));
  server.on('error', error => {
    process.stderr.write(`Cannot start ${cli}: ${error.message}\n`);
    process.exit(1);
  });
  server.on('exit', code => process.exit(code ?? 1));
}
