// Builds the playground into _site/: bundles playground/app.js (with jsonld, n3 and
// eyemind) and copies the page, its styling and the vocabulary files it links to.
// The examples and alignment targets are read from examples/ and alignment-shapes/,
// so adding a folder there adds it to the playground.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8');
const readIf = (...parts) => (existsSync(path.join(root, ...parts)) ? read(...parts) : '');

// The first paragraph of a Markdown text.
function firstParagraph(markdown) {
  const lines = markdown.split('\n');
  let at = 0;
  while (at < lines.length && !lines[at].trim()) at++;
  const paragraph = [];
  for (; at < lines.length && lines[at].trim() && !/^(#|```|\||\* )/.test(lines[at]); at++) paragraph.push(lines[at].trim());
  return paragraph.join(' ');
}

// The paragraph under the title of a README.
const introduction = (readme) => firstParagraph(readme.split(/^# .*$/m)[1] ?? '');

// A readable name for the payload format of a CloudEvent.
function payloadFormat(event) {
  if (event.data_base64 !== undefined) return 'binary';
  if (event.data === undefined || event.data === null) return 'no payload';
  const type = (event.datacontenttype ?? '').split(';')[0].trim().toLowerCase();
  if (!type) return 'JSON';
  if (type === 'application/ld+json') return 'JSON-LD';
  if (type === 'application/json' || type.endsWith('+json')) return 'JSON';
  if (type.endsWith('/xml') || type.endsWith('+xml')) return 'XML';
  if (type === 'application/avro') return 'Avro';
  return type;
}

// What an example contains: events, payload formats and content types, and the
// extension attributes only its producer-specific context maps.
function facts(eventsText) {
  const parsed = JSON.parse(eventsText);
  const events = Array.isArray(parsed) ? parsed : [parsed];
  const known = new Set(Object.keys(JSON.parse(read('context.jsonld'))['@context']));
  const unique = (values) => [...new Set(values)];
  return {
    events: events.length,
    formats: unique(events.map(payloadFormat)),
    contentTypes: unique(events.map((e) => e.datacontenttype ?? (e.data !== undefined ? 'application/json, implied' : null)).filter(Boolean)),
    extensions: unique(events.flatMap((e) => Object.keys(e).filter((k) => !k.startsWith('@') && !known.has(k)))),
  };
}

function examples() {
  // The order and short producer names of the examples index table.
  const index = read('examples', 'README.md');
  const rows = [...index.matchAll(/^\| \[([^\]]+)\]\(([^)]+)\/\) \| ([^|]+) \|/gm)];
  return rows.map(([, , folder, producer]) => {
    const readme = read('examples', folder, 'README.md');
    const events = read('examples', folder, 'events.json');
    return {
      id: folder,
      label: producer.trim(),
      title: readme.match(/^# (.+)$/m)?.[1] ?? folder,
      description: introduction(readme),
      facts: facts(events),
      events,
      context: readIf('examples', folder, 'context.jsonld'),
    };
  });
}

function targets() {
  const dir = path.join(root, 'alignment-shapes');
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map(({ name }) => {
    const readme = read('alignment-shapes', name, 'README.md');
    const model = readme.split('## Model')[1] ?? '';
    const afterCode = model.split('```')[2] ?? '';
    return {
      id: name,
      label: readme.match(/^# .*→ (.+)$/m)?.[1] ?? name,
      model: firstParagraph(model),
      explanation: firstParagraph(afterCode),
      shapes: read('alignment-shapes', name, 'shapes.ttl'),
    };
  });
}

// `import { examples, targets } from 'cloudevents-ld:manifest'` in the app.
const manifest = {
  name: 'manifest',
  setup(build) {
    build.onResolve({ filter: /^cloudevents-ld:manifest$/ }, (args) => ({ path: args.path, namespace: 'manifest' }));
    build.onLoad({ filter: /.*/, namespace: 'manifest' }, () => ({
      contents: JSON.stringify({ examples: examples(), targets: targets() }),
      loader: 'json',
    }));
  },
};

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'playground', 'app.js')],
  outfile: path.join(site, 'playground.js'),
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  loader: { '.ttl': 'text', '.jsonld': 'text' },
  plugins: [manifest],
  logLevel: 'warning',
});

for (const file of ['index.html', 'style.css', 'favicon.svg']) cpSync(path.join(root, 'playground', file), path.join(site, file));
// The vocabulary files, so that the page can link to what it uses.
for (const file of ['terms.ttl', 'context.jsonld', 'shapes.ttl', 'alignments.ttl']) cpSync(path.join(root, file), path.join(site, file));
for (const target of targets()) {
  mkdirSync(path.join(site, 'alignment-shapes', target.id), { recursive: true });
  cpSync(path.join(root, 'alignment-shapes', target.id, 'shapes.ttl'), path.join(site, 'alignment-shapes', target.id, 'shapes.ttl'));
}
console.log(`Built the playground in ${path.relative(process.cwd(), site) || site}`);
