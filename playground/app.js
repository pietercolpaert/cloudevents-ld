// The CloudEvents-LD playground UI. The processing itself is in pipeline.js.
import * as pipeline from './pipeline.js';
import mainContextText from '../context.jsonld';
import shapesText from '../shapes.ttl';
import termsText from '../terms.ttl';
import alignmentsText from '../alignments.ttl';
import { examples, targets } from 'cloudevents-ld:manifest';

const CodeMirror = window.CodeMirror;
const $ = (id) => document.getElementById(id);
const mainContext = JSON.parse(mainContextText)['@context'];
const background = `${termsText}\n${alignmentsText}`;
const SEVERITIES = ['Violation', 'Warning', 'Info'];

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

const editor = (id, mode, readOnly = false) => CodeMirror($(id), {
  mode, readOnly, theme: 'pietercolpaert', lineNumbers: true, lineWrapping: true,
  // Read-only outputs render fully, so that they can be sized to their content.
  viewportMargin: readOnly ? Infinity : 10,
});
const json = { name: 'javascript', json: true };
const eventsCm = editor('events-editor', json);
const contextCm = editor('context-editor', json);
const logCm = editor('log-editor', 'text/turtle', true);
const alignedCm = editor('aligned-editor', 'text/turtle', true);

// Output editors fit their content, up to 28rem; longer content scrolls.
const OUTPUT_MAX_REM = 28;
function showOutput(cm, text) {
  cm.setValue(text);
  // Measure the full content first: a cap set before measuring would clip the
  // content without making it scrollable.
  cm.setSize(null, 'auto');
  cm.refresh();
  const max = OUTPUT_MAX_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
  if (cm.getWrapperElement().offsetHeight > max) cm.setSize(null, max);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
const element = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

function setStatus(text, kind = '') {
  const status = $('status');
  status.textContent = text;
  status.className = kind;
}

// An IRI as a prefixed name when a prefix applies.
function compact(iri, prefixes) {
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (iri.startsWith(namespace) && /^[\w.-]*$/.test(iri.slice(namespace.length))) return `${prefix}:${iri.slice(namespace.length)}`;
  }
  return `<${iri}>`;
}

function termText(term, prefixes) {
  if (!term) return '';
  if (term.termType === 'NamedNode') return compact(term.value, prefixes);
  if (term.termType === 'BlankNode') return '[]';
  const value = term.value.length > 80 ? `${term.value.slice(0, 77)}…` : term.value;
  return JSON.stringify(value);
}

// Inline Markdown from the READMEs: `code` and [text](link), as safe DOM nodes.
function inlineMarkdown(text) {
  const fragment = document.createDocumentFragment();
  text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split(/(`[^`]+`)/).forEach((part) => {
    fragment.append(part.startsWith('`') ? element('code', { textContent: part.slice(1, -1) }) : part);
  });
  return fragment;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderValidation(container, results, messageCount, prefixes) {
  container.replaceChildren();
  const summary = element('div', { className: 'validation-summary' });
  container.append(summary);
  if (!results.length) {
    summary.append(element('span', { className: 'badge ok', textContent: `✓ All ${plural(messageCount, 'message')} conform` }));
    return;
  }
  for (const severity of SEVERITIES) {
    const count = results.filter((r) => r.severity === severity).length;
    if (count) summary.append(element('span', { className: `badge ${severity}`, textContent: plural(count, severity.toLowerCase()) }));
  }
  if (!results.some((r) => r.severity === 'Violation')) {
    summary.append(element('span', { className: 'badge ok', textContent: '✓ No violations' }));
  }
  const rows = [...results].sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.event - b.event);
  const table = element('table', { className: 'results' },
    element('thead', {}, element('tr', {}, ...['Event', 'Severity', 'Path', 'Value', 'Message'].map((h) => element('th', { textContent: h })))),
    element('tbody', {}, ...rows.map((r) => element('tr', {},
      element('td', { textContent: String(r.event) }),
      element('td', { className: `severity ${r.severity}`, textContent: r.severity }),
      element('td', {}, r.path ? element('code', { textContent: compact(r.path, prefixes) }) : null),
      element('td', {}, r.value ? element('code', { textContent: termText(r.value, prefixes) }) : null),
      element('td', { textContent: r.message }),
    ))));
  container.append(table);
}

function renderUnmapped(members) {
  const notice = $('unmapped');
  notice.hidden = !members.length;
  if (!members.length) return;
  notice.replaceChildren(
    `Not mapped by any context, so left out of the RDF: `,
    ...members.flatMap((m, i) => [i ? ', ' : '', element('code', { textContent: m })]),
    '. These are producer-specific extension attributes: map them in the producer-specific context below to keep them.',
  );
}

function renderTargetInfo(target) {
  const info = $('target-info');
  info.hidden = !target;
  if (!target) return;
  info.replaceChildren(
    element('p', {}, inlineMarkdown(target.model)),
    element('p', {}, inlineMarkdown(target.explanation)),
    element('p', {}, element('a', { href: `./alignment-shapes/${target.id}/shapes.ttl`, textContent: `The ${target.label} target shapes` })),
  );
}

function renderSnippets(producer, target) {
  const contexts = producer ? 'cloudEventsLd, producerContext' : 'cloudEventsLd';
  $('code-js').textContent = `import jsonld from 'jsonld';

// cloudEventsLd: the '@context' of context.jsonld${producer ? '\n// producerContext: the producer-specific context' : ''}
for (const event of events) {
  const nquads = await jsonld.toRDF(event, {
    expandContext: { '@context': [${contexts}] },
    base: null, // a relative dataref or dataschema is dropped, not resolved
    format: 'application/n-quads'
  });
  // one RDF Message per CloudEvent
}`;
  const folder = `alignment-shapes/${target ? target.id : 'dcterms'}`;
  $('code-cli').textContent = `# events.ttl: the RDF Message Log of step 2
# Align each message with ${target ? target.label : 'another vocabulary'}
npx eyemind --owl2rl --stream-messages \\
  --shacl-in shapes.ttl --shacl-out ${folder}/shapes.ttl \\
  terms.ttl alignments.ttl events.ttl`;
}

// ---------------------------------------------------------------------------
// State: the selected example and target, kept in the URL fragment
// ---------------------------------------------------------------------------

const state = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const saveState = () => history.replaceState(null, '', `#${new URLSearchParams(Object.entries(state).filter(([, v]) => v))}`);
const aligners = new Map();
let current = null;
let runId = 0;
let suppressEdits = false;

// What an example contains, as a row of small facts.
function renderFacts(facts) {
  const fact = (label, value, title = '') => element('li', { title }, `${label} `, element('strong', { textContent: value }));
  const extensions = facts.extensions;
  $('example-facts').replaceChildren(
    fact('CloudEvents:', String(facts.events)),
    fact('Payload:', facts.formats.join(', ')),
    fact('Content type:', facts.contentTypes.join(', ') || 'none'),
    fact('Producer-specific extensions:', extensions.length > 3 ? `${extensions.slice(0, 3).join(', ')} and ${extensions.length - 3} more` : extensions.join(', ') || 'none', extensions.join(', ')),
  );
}

function loadExample(id) {
  const example = examples.find((e) => e.id === id) ?? examples[0];
  state.example = example.id;
  saveState();
  $('example').value = example.id;
  $('example-description').replaceChildren(element('strong', { textContent: example.title }), example.description ? ' — ' : '', inlineMarkdown(example.description));
  renderFacts(example.facts);
  suppressEdits = true;
  eventsCm.setValue(example.events);
  contextCm.setValue(example.context);
  suppressEdits = false;
  $('producer-hint').textContent = example.context ? '(used by this example)' : '(none needed for this example)';
  update();
}

// ---------------------------------------------------------------------------
// The pipeline, step by step
// ---------------------------------------------------------------------------

async function update() {
  const id = ++runId;
  try {
    setStatus('Converting the CloudEvents…', 'busy');
    const events = pipeline.readEvents(eventsCm.getValue());
    const producer = pipeline.readContext(contextCm.getValue(), 'producer-specific context');
    const contexts = producer ? [mainContext, producer] : [mainContext];
    const log = await pipeline.toMessageLog(events, contexts);
    if (id !== runId) return;
    current = { log, producer };
    document.body.classList.remove('stale');
    showOutput(logCm, log.text);
    $('log-hint').textContent = `${plural(log.messages.length, 'message')}, ${plural(log.triples, 'triple')}, with ${producer ? 'context.jsonld and the producer-specific context' : 'context.jsonld'}`;
    renderUnmapped(pipeline.unmappedMembers(events, contexts));
    renderSnippets(producer, targets.find((t) => t.id === state.target));
    setStatus(`${plural(log.messages.length, 'CloudEvent')} converted into ${plural(log.triples, 'triple')}.`);

    if (state.target) await align(id);
  } catch (error) {
    if (id !== runId) return;
    if (!error.userInput) console.error(error);
    document.body.classList.add('stale');
    setStatus(`${error.message}${error.details?.code ? ` (${error.details.code})` : ''} The results below are from the last successful run.`, 'error');
  }
}

async function align(id) {
  const target = targets.find((t) => t.id === state.target);
  if (!target || !current) return;
  setStatus(aligners.has(target.id)
    ? `Aligning with ${target.label}…`
    : `eyemind is planning the rules for ${target.label}; the first run takes a few seconds…`, 'busy');
  await nextFrame();
  if (id !== runId) return;
  if (!aligners.has(target.id)) {
    aligners.set(target.id, pipeline.createAligner({ background, shapesIn: shapesText, shapesOut: target.shapes }));
  }
  const result = await aligners.get(target.id)(current.log.text);
  $('align-result').hidden = false;
  showOutput(alignedCm, result.text);
  // The one-off set-up (closing the background, specializing the rules per message
  // shape) is left out: over a stream of messages, the mapping is what counts.
  const ms = result.averageMs < 10 ? result.averageMs.toFixed(1) : Math.round(result.averageMs);
  $('aligned-hint').textContent = `${plural(result.triples, 'triple')}, of which ${result.derived} derived by eyemind; ${ms} ms per message on average`;
  const targetPrefixes = Object.fromEntries([...target.shapes.matchAll(/@prefix\s+([\w-]*):\s*<([^>]+)>/g)].map((m) => [m[1], m[2]]));
  const prefixes = { ...targetPrefixes, ...current.log.prefixes };
  const results = result.messages.flatMap((m) => pipeline.validate(m.merged, target.shapes).map((r) => ({ ...r, event: m.index + 1 })));
  renderValidation($('align-validation'), results, result.messages.length, prefixes);
  $('align-validation-hint').textContent = `of each CloudEvent with what was derived, against the ${target.label} target shapes`;
  const violations = results.filter((r) => r.severity === 'Violation').length;
  setStatus(`Aligned with ${target.label}: ${plural(result.derived, 'triple')} derived; ${violations
    ? `${plural(violations, 'violation')} of the target shapes, see the explanation in step 3.`
    : 'the result conforms to the target shapes.'}`);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

for (const example of examples) {
  $('example').append(element('option', { value: example.id, textContent: `${example.label} — ${example.facts.formats.join(', ')}` }));
}
$('example').addEventListener('change', () => loadExample($('example').value));

for (const target of targets) $('target').append(element('option', { value: target.id, textContent: target.label }));
$('target').value = targets.some((t) => t.id === state.target) ? state.target : '';
state.target = $('target').value;
renderTargetInfo(targets.find((t) => t.id === state.target));
$('target').addEventListener('change', () => {
  state.target = $('target').value;
  saveState();
  const target = targets.find((t) => t.id === state.target);
  renderTargetInfo(target);
  $('align-result').hidden = true;
  renderSnippets(current?.producer, target);
  if (target) align(++runId);
});

let timer = null;
const scheduleUpdate = () => {
  if (suppressEdits) return;
  clearTimeout(timer);
  timer = setTimeout(update, 500);
};
eventsCm.on('change', scheduleUpdate);
contextCm.on('change', scheduleUpdate);
$('producer-context').addEventListener('toggle', () => contextCm.refresh());

for (const button of document.querySelectorAll('.copy-btn')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($(button.dataset.target).textContent);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 1500);
  });
}

loadExample(state.example);
