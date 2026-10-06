import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), 'surge-grammar-'));
const run = (...args) => execFileSync(path.join(root, 'node_modules/.bin/tree-sitter'), args, {
  cwd: path.join(root, 'tree-sitter-surge'), encoding: 'utf8',
  env: { ...process.env, XDG_CACHE_HOME: path.join(temp, 'cache') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
// `tree-sitter parse` exits non-zero on syntax errors; keep the tree for the report.
const parse = file => {
  try {
    return run('parse', file);
  } catch (error) {
    return error.stdout;
  }
};
const write = (name, text) => {
  const file = path.join(temp, name);
  writeFileSync(file, text);
  return file;
};

// Zed keeps a stack of captures in iteration order; the most recent one
// covering a position wins. Captures starting with "_" are predicate helpers.
function highlights(file) {
  const captures = [];
  for (const line of run('query', '--captures', path.join(root, 'languages/surge/highlights.scm'), file).split('\n')) {
    const match = /capture: \d+ - ([\w.]+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\)/.exec(line);
    if (match && !match[1].startsWith('_')) captures.push({ name: match[1], start: [+match[2], +match[3]], end: [+match[4], +match[5]] });
  }
  const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  return position => captures.filter(c => !before(position, c.start) && before(position, c.end)).at(-1)?.name;
}

function check(name, text, { nodes = [], absent = [], colors = [] }) {
  const file = write(`${name}.sgconf`, text);
  const tree = parse(file);
  assert.doesNotMatch(tree, /\b(ERROR|MISSING)\b/, `${name}:\n${tree}`);
  for (const node of nodes) assert(tree.includes(`(${node} `) || tree.includes(` ${node} `), `${name}: expected ${node}\n${tree}`);
  for (const node of absent) assert(!tree.includes(`(${node} `), `${name}: unexpected ${node}\n${tree}`);
  const lines = text.split(/\r\n|\n|\r/);
  const at = highlights(file);
  for (const [row, fragment, expected, occurrence = 0] of colors) {
    let index = -1;
    for (let i = 0; i <= occurrence; i++) index = lines[row].indexOf(fragment, index + 1);
    assert(index >= 0, `${name}: '${fragment}' not on line ${row}`);
    const column = Buffer.byteLength(lines[row].slice(0, index));
    assert.equal(at([row, column]), expected, `${name}: '${fragment}' on line ${row}`);
  }
}

try {
  const cases = [
    ['comments', '#\n; test\n// test\n  # test\n[General]\na = b;c # comment\nb = https://x.com/#a // tail\n', {
      colors: [[0, '#', 'comment'], [1, ';', 'comment'], [2, '//', 'comment'], [5, 'b;c', 'string'], [5, '#', 'comment'],
        [6, 'https', 'link_uri'], [6, '//', 'comment', 1]],
    }],
    ['top-level-section', '[General]\nipv6 = true', { nodes: ['section'], colors: [[0, 'General', 'title'], [1, 'true', 'boolean']] }],
    ['crlf-bom', '\ufeff#!name=Test\r\n[General]\r\nipv6 = true\r\n', { nodes: ['directive', 'section', 'assignment'] }],
    ['generic', '[General]\ndns-server = system, 1.1.1.1\nskip-proxy = 192.168.0.0/16, localhost\n[MITM]\nhostname = %APPEND% *.example.com\n[Host]\n*.local = server:system\n', {
      colors: [[1, 'dns-server', 'property'], [1, '1.1.1.1', 'number'], [2, '192.168', 'number'], [4, '%APPEND%', 'keyword'],
        [4, '*.example', 'string'], [6, '*.local', 'property']],
    }],
    ['proxy', "[Proxy]\n香港 节点 = socks5, 127.0.0.1, 1080\nZero's Proxy = ss, a.com, 443, password=it's, obfs-host=\"x,y\"\nDIRECT = direct\n", {
      nodes: ['proxy_section', 'proxy'],
      colors: [[1, '香港', 'function'], [1, 'socks5', 'type'], [1, '1080', 'number'], [2, "Zero's", 'function'], [2, 'ss', 'type'],
        [2, 'password', 'property'], [2, "it's", 'string'], [2, 'obfs-host', 'property'], [3, 'direct', 'type']],
    }],
    ['proxy-group', '[Proxy Group]\nAuto = url-test, HK A, DIRECT, url=http://www.gstatic.com/generate_204, interval=600, policy-regex-filter=(HK|SG)\n', {
      nodes: ['proxy_group_section', 'policy'],
      colors: [[1, 'Auto', 'function'], [1, 'url-test', 'type'], [1, 'HK', 'function'], [1, 'A,', 'function'], [1, 'DIRECT', 'constant.builtin'],
        [1, 'url=', 'property'], [1, 'http://', 'link_uri'], [1, '600', 'number'], [1, '(HK|SG)', 'string.regex']],
    }],
    ['rules', '[Rule]\nDOMAIN-SUFFIX,example.com,My Proxy\nIP-CIDR,10.0.0.0/8,DIRECT,no-resolve # lan\nURL-REGEX,^https://a\\.com/(x|y),REJECT\nURL-REGEX,"^https://e.com/a,b",DIRECT\nRULE-SET,https://e.com/r.list,Proxy,extended-matching\nFINAL,Proxy,dns-failed\n', {
      nodes: ['rule_section', 'policy'],
      colors: [[1, 'DOMAIN-SUFFIX', 'keyword'], [1, 'example.com', 'string'], [1, 'My', 'function'], [1, 'Proxy', 'function'],
        [2, '10.0.0.0/8', 'number'], [2, 'DIRECT', 'constant.builtin'], [2, 'no-resolve', 'attribute'], [2, '#', 'comment'],
        [3, '^https', 'string.regex'], [3, '(x|y)', 'string.regex'], [3, 'REJECT', 'constant.builtin'], [4, '"^https', 'string.regex'],
        [5, 'https', 'link_uri'], [5, 'Proxy', 'function'], [5, 'extended', 'attribute'], [6, 'FINAL', 'keyword'], [6, 'Proxy', 'function'],
        [6, 'dns-failed', 'attribute']],
    }],
    ['logical', '[Rule]\nAND,((DOMAIN,example.com),(NOT,((DEST-PORT,80)))),DIRECT\nOR,((PROCESS-NAME,Google Chrome), (SRC-IP,192.168.1.2)),Proxy\n', {
      nodes: ['conditions', 'condition'],
      colors: [[1, 'AND', 'keyword'], [1, 'DOMAIN', 'keyword'], [1, 'NOT', 'keyword'], [1, '80', 'number'], [1, 'DIRECT', 'constant.builtin'],
        [2, 'Google', 'string'], [2, 'Proxy', 'function']],
    }],
    ['ruleset-file', '# rule set\nDOMAIN,example.com\nIP-CIDR,192.0.2.0/24,no-resolve\nAND,((DOMAIN,a.com),(DEST-PORT,443))\nURL-REGEX,"^https://example.com/a,b#fragment"\n', {
      nodes: ['rule'], absent: ['policy'],
      colors: [[1, 'DOMAIN', 'keyword'], [1, 'example.com', 'string'], [2, 'no-resolve', 'attribute'], [4, '"^https', 'string.regex']],
    }],
    ['inline-ruleset', '[Ruleset LAN]\nDOMAIN-SUFFIX,local\nIP-CIDR,10.0.0.0/8,no-resolve\n', {
      nodes: ['ruleset_section'], absent: ['policy'], colors: [[0, 'Ruleset LAN', 'title'], [2, 'no-resolve', 'attribute']],
    }],
    ['script', '[Script]\ndemo = type=cron, cronexp="0 * * * *", pattern=^https://x\\.com/api\\?a=1&b=(c|d), script-path=https://e.com/s.js#v1\n', {
      nodes: ['param'],
      colors: [[1, 'demo', 'function'], [1, 'type', 'property'], [1, 'cron', 'type'], [1, 'cronexp', 'property'], [1, 'pattern', 'property'],
        [1, '^https', 'string.regex'], [1, 'a=1', 'string.regex'], [1, 'script-path', 'property'], [1, 'https://e', 'link_uri']],
    }],
    ['url-rewrite', '[URL Rewrite]\n^https://old.example.com/(.*) https://new.example.com/$1 302\n^https://x.com/path?a=b https://y.com/ header # c\n', {
      nodes: ['url_rewrite', 'capture'], absent: ['assignment'],
      colors: [[1, '^https', 'string.regex'], [1, '(.*)', 'string.regex'], [1, 'https://new', 'string'], [1, '$1', 'variable.special'],
        [1, '302', 'keyword'], [2, 'a=b', 'string.regex'], [2, 'header', 'keyword'], [2, '#', 'comment']],
    }],
    ['header-rewrite', '[Header Rewrite]\nhttp-request example.com header-replace X-Token a=b\n^https://a.com header-add Foo bar baz\nhttp-response ^https://b.com header-del Server\n', {
      nodes: ['header_rewrite'], absent: ['assignment', 'key'],
      colors: [[1, 'http-request', 'keyword'], [1, 'example.com', 'string.regex'], [1, 'header-replace', 'keyword'], [1, 'X-Token', 'variable.parameter'],
        [1, 'a=b', 'string'], [2, '^https', 'string.regex'], [2, 'header-add', 'keyword'], [3, 'http-response', 'keyword']],
    }],
    ['body-rewrite', "[Body Rewrite]\nhttp-response ^https://x\\.com/api \"a\" \"b\" (\\d+)-(\\d+) $2-$1\nhttp-response-jq ^https://example.com/ '.enabled = true'\n", {
      nodes: ['body_rewrite', 'capture'],
      colors: [[1, 'http-response', 'keyword'], [1, '^https', 'string.regex'], [1, '"a"', 'string'], [1, '(\\d', 'string.regex'], [1, '$2', 'variable.special'],
        [2, 'http-response-jq', 'keyword'], [2, "'.enabled", 'string']],
    }],
    ['map-local', '[Map Local]\n^https://a.com/x data-type=text data="{}" status-code=200\n', {
      nodes: ['map_local', 'param'], colors: [[1, '^https', 'string.regex'], [1, 'data-type', 'property'], [1, '200', 'number']],
    }],
    ['module', '#!name=示例\n#!arguments=hostname:example.com\n[General]\na = "{{{arg}}}"\n[Rule]\nDOMAIN,{{{hostname}}},DIRECT\n', {
      nodes: ['directive', 'placeholder'],
      colors: [[0, '#!', 'preproc'], [0, 'name', 'preproc'], [3, '{{{', 'variable.special'], [5, '{{{', 'variable.special']],
    }],
    ['includes', '[Proxy]\n#!include Proxy.dconf\n#!MANAGED-CONFIG https://example.com/profile interval=86400\n', { nodes: ['directive', 'proxy_section'] }],
    ['empty-values', '[General]\na =\nb = true # yes', { nodes: ['assignment', 'comment'] }],
    ['unknown-lines', '[Proxy]\nnot a proxy line\n[Rule]\nlowercase text\n', { nodes: ['text_line'] }],
  ];
  for (const [name, text, expectations] of cases) check(name, text, expectations);

  // A malformed line stays local instead of swallowing its section.
  const broken = parse(write('broken.sgconf', '[Rule]\nDOMAIN,a.com,DIRECT\nDOMAIN,(,x\nDOMAIN,b.com,DIRECT\n'));
  assert.equal((broken.match(/\(rule /g) || []).length >= 2, true, broken);

  const fixtures = readdirSync(path.join(root, 'examples')).map(file => path.join(root, 'examples', file));
  for (const file of fixtures) assert.doesNotMatch(parse(file), /\b(ERROR|MISSING)\b/, file);
  for (const language of ['surge', 'surge-module', 'surge-ruleset']) {
    for (const query of ['highlights.scm', 'brackets.scm', 'outline.scm', 'overrides.scm', 'redactions.scm']) {
      run('query', path.join(root, 'languages', language, query), ...fixtures);
      assert.equal(readFileSync(path.join(root, 'languages', language, query), 'utf8'), readFileSync(path.join(root, 'languages/surge', query), 'utf8'));
    }
  }
  // first_line_pattern uses Rust regex syntax; \x{FEFF} is the only construct JS spells differently.
  const firstLine = language => new RegExp(/first_line_pattern = '([^']+)'/.exec(
    readFileSync(path.join(root, 'languages', language, 'config.toml'), 'utf8'))[1].replace('\\x{FEFF}', '\\u{FEFF}'), 'u');
  for (const [language, matches, misses] of [
    ['surge', ['#!MANAGED-CONFIG https://e.com/a.conf interval=3600', '\ufeff#!MANAGED-CONFIG x'], ['[General]', '# comment']],
    ['surge-module', ['#!name=Test', '  #!name = Test'], ['#!desc=Test', '[General]']],
    ['surge-ruleset', ['DOMAIN,example.com', 'IP-CIDR6, ::1/128', 'AND,((DOMAIN,a.com))'], ['FINAL,DIRECT', 'DOMAIN = x', 'payload:']],
  ]) {
    for (const line of matches) assert.match(line, firstLine(language), `${language}: ${line}`);
    for (const line of misses) assert.doesNotMatch(line, firstLine(language), `${language}: ${line}`);
  }
  const outline = run('query', path.join(root, 'languages/surge/outline.scm'), path.join(root, 'examples/Surge.conf'));
  for (const name of ['General', 'Proxy Group', 'Rule', '自动选择', 'demo']) assert(outline.includes(`text: \`${name}\``), `outline: ${name}`);
  const secrets = write('secrets.sgconf', '[General]\nhttp-api = key@127.0.0.1:6166\nloglevel = notify\n[Proxy]\nA = ss, a.com, 443, encrypt-method=aes-128-gcm, password="p,w"\n[MITM]\nca-passphrase = 1234\n');
  const redacted = [...run('query', '--captures', path.join(root, 'languages/surge/redactions.scm'), secrets)
    .matchAll(/capture: \d+ - redact, .*text: `([^`]*)`/g)].map(match => match[1]);
  assert.deepEqual(redacted, ['key@127.0.0.1:6166', '"p,w"', '1234']);
  // Zed fetches the grammar at the pinned rev, so committed grammar changes must move it.
  const rev = /\[grammars\.surge\][^[]*?rev = "([0-9a-f]+)"/.exec(readFileSync(path.join(root, 'extension.toml'), 'utf8'))[1];
  const grammarCommit = execFileSync('git', ['-C', root, 'log', '-1', '--format=%H', '--', 'tree-sitter-surge'], { encoding: 'utf8' }).trim();
  assert.equal(rev, grammarCommit, 'Set rev in extension.toml to the latest commit that changed tree-sitter-surge/');
  console.log(`PASS: ${cases.length} syntax and highlight cases, ${fixtures.length} examples, 15 Zed queries.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
