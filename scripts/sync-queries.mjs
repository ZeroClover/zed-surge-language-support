import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The three languages share one set of queries, maintained under languages/surge/.
const root = fileURLToPath(new URL('..', import.meta.url));
for (const language of ['surge-module', 'surge-ruleset']) {
  for (const query of ['highlights.scm', 'brackets.scm', 'outline.scm', 'overrides.scm', 'redactions.scm']) {
    cpSync(path.join(root, 'languages/surge', query), path.join(root, 'languages', language, query));
  }
}
