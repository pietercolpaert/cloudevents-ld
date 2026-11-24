// The CloudEvents-LD pipeline behind the playground, independent of the UI so
// that it runs in the browser and in Node alike:
//   1. CloudEvents JSON → RDF Message Log, one message per event (JSON-LD contexts)
//   2. SHACL validation of each message (eyemind)
//   3. Alignment with another vocabulary: OWL 2 RL over terms.ttl + alignments.ttl,
//      planned by a SHACL input shape and a SHACL output shape (eyemind)
import jsonld from 'jsonld';
import { Parser, Writer } from 'n3';
import { run } from 'eyemind';
import { loadInputs, loadMessageReasoner, writeConclusions } from 'eyemind/formats';
import { parseRdfMessages } from 'eyemind/messages';
import { writeRdf } from 'eyemind/rdf';

// The bounds eyemind's command line uses for compiled RDF programs.
const LIMITS = { maxDepth: 1000000, maxIterations: 100000, maxInferences: 1000000000 };

const SH = 'http://www.w3.org/ns/shacl#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const CE_DATA = 'https://w3id.org/cloudevents#data';
export const BASE_PREFIXES = {
  ce: 'https://w3id.org/cloudevents#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
};

// An error in what the user typed, as opposed to a bug.
const inputError = (message) => Object.assign(new Error(message), { userInput: true });

// A JSON document holding one CloudEvent, or a JSON batch of them.
export function readEvents(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw inputError(`The CloudEvents are not valid JSON: ${error.message}.`);
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (events.some((event) => event === null || typeof event !== 'object' || Array.isArray(event))) {
    throw inputError('Expected a CloudEvent (a JSON object) or a JSON batch (an array of objects).');
  }
  return events;
}

// The '@context' value of a context document, or null for an empty editor.
export function readContext(text, label) {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed['@context'] ?? parsed;
  } catch (error) {
    throw inputError(`The ${label} is not valid JSON: ${error.message}.`);
  }
}

// Turtle prefixes: every context term that maps to a namespace IRI.
export function prefixesOf(contexts) {
  const prefixes = { ...BASE_PREFIXES };
  for (const context of contexts) {
    for (const [term, value] of Object.entries(context)) {
      if (!term.startsWith('@') && typeof value === 'string' && /[#/]$/.test(value)) prefixes[term] = value;
    }
  }
  return prefixes;
}

// Members of the events that none of the contexts maps, and that JSON-LD drops.
export function unmappedMembers(events, contexts) {
  const known = new Set(contexts.flatMap((context) => Object.keys(context)));
  const unmapped = new Set();
  for (const event of events) {
    for (const [key, value] of Object.entries(event)) {
      if (!key.startsWith('@') && !known.has(key) && value !== null) unmapped.add(key);
    }
  }
  return [...unmapped];
}

const turtleOf = (quads, prefixes) => new Promise((resolve, reject) => {
  const writer = new Writer({ prefixes });
  writer.addQuads(quads);
  writer.end((error, text) => (error ? reject(error) : resolve(text)));
});
const withoutPrefixes = (text) => text.split('\n').filter((line) => !/^(@prefix|PREFIX)\s/i.test(line)).join('\n').trim();
const prefixLines = (prefixes) => Object.entries(prefixes).map(([p, iri]) => `@prefix ${p}: <${iri}> .`).join('\n');

// 1. One RDF Message per CloudEvent, applying the contexts in order.
export async function toMessageLog(events, contexts) {
  const prefixes = prefixesOf(contexts);
  const messages = [];
  for (const [index, event] of events.entries()) {
    const nquads = await jsonld.toRDF(event, {
      expandContext: { '@context': contexts },
      // No base IRI: a relative dataref or dataschema is dropped, not resolved
      // against wherever this page happens to be served.
      base: null,
      format: 'application/n-quads',
    });
    const quads = new Parser({ format: 'N-Quads', blankNodePrefix: `e${index + 1}_` }).parse(nquads)
      // The envelope first, the (often long) payload last.
      .sort((a, b) => (a.predicate.value === CE_DATA) - (b.predicate.value === CE_DATA));
    messages.push({ index, quads, turtle: withoutPrefixes(await turtleOf(quads, prefixes)) });
  }
  const text = `@version "1.1-messages" .\n${prefixLines(prefixes)}\n\n` +
    messages.map((m) => `# CloudEvent ${m.index + 1}\n${m.turtle}`).join('\n@message .\n\n') + '\n';
  return { text, messages, prefixes, triples: messages.reduce((n, m) => n + m.quads.length, 0) };
}

// 2. SHACL validation of one graph, with eyemind. Returns the results.
export function validate(dataTurtle, shapesTurtle) {
  const loaded = loadInputs([[shapesTurtle, 'shapes.ttl'], [dataTurtle, 'data.ttl']], null, { shacl: true });
  const report = writeConclusions(loaded, run(loaded.program, LIMITS), { format: 'turtle' }) ?? '';
  const quads = new Parser().parse(report);
  const value = (subject, predicate) => quads.find((q) => q.subject.equals(subject) && q.predicate.value === predicate)?.object;
  return quads
    .filter((q) => q.predicate.value === RDF_TYPE && q.object.value === SH + 'ValidationResult')
    .map(({ subject }) => ({
      severity: (value(subject, SH + 'resultSeverity')?.value ?? SH + 'Violation').slice(SH.length),
      path: value(subject, SH + 'resultPath')?.value ?? null,
      value: value(subject, SH + 'value') ?? null,
      message: value(subject, SH + 'resultMessage')?.value ?? value(subject, SH + 'sourceConstraintComponent')?.value ?? '',
    }));
}

// Validates each message on its own, so every result belongs to one event.
export function validateMessages(messages, shapesTurtle, prefixes) {
  const header = prefixLines(prefixes);
  return messages.map((m) => validate(`${header}\n${m.turtle}`, shapesTurtle).map((r) => ({ ...r, event: m.index + 1 })));
}

// 3. An aligner for one target vocabulary: OWL 2 RL over the background (terms.ttl
// and alignments.ttl), planned by the SHACL input shape and the target's SHACL output
// shape. Setting up takes a moment: closing the background once, and specializing
// the rules for the first message of each shape. Keep the aligner and reuse it, as a
// stream of messages would: mapping a message afterwards is fast.
export function createAligner({ background, shapesIn, shapesOut }) {
  const reasoner = loadMessageReasoner([[background, 'background.ttl']], null, {
    owl2rl: true,
    shaclIn: [[shapesIn, 'shapes.ttl']],
    shaclOut: [[shapesOut, 'target-shapes.ttl']],
    limits: LIMITS,
  });
  const state = { warm: false };
  return (logText) => align(reasoner, state, logText);
}

// Maps one message, and the time that took. Two one-offs are left out of that time:
// the first message closes the background, and the first message of each shape may
// have the rules specialized for it. Such a message is mapped again to time the
// mapping alone.
function mapMessage(reasoner, state, quads) {
  let started = performance.now();
  let result = reasoner.infer(quads, LIMITS);
  if (!state.warm || result.sources) {
    state.warm = true;
    started = performance.now();
    result = reasoner.infer(quads, LIMITS);
  }
  return { result, ms: performance.now() - started };
}

// Writes eyemind quads with N3.js, so that triples are grouped per subject and the
// (often long) ce:data comes last.
async function grouped(eyemindQuads, options) {
  const quads = new Parser({ blankNodePrefix: '' }).parse(writeRdf(eyemindQuads, options))
    .sort((a, b) => (a.predicate.value === CE_DATA) - (b.predicate.value === CE_DATA));
  return { quads, turtle: withoutPrefixes(await turtleOf(quads, options.prefixes)) };
}

// For each message, derives what the SHACL output shape asks for. Returns, per
// message, its full closure: the CloudEvents-LD triples together with what was
// derived, as text for display and as Turtle for validation.
async function align(reasoner, state, logText) {
  const { messages } = parseRdfMessages(logText, { format: 'turtle' });
  const prefixes = { ...reasoner.prefixes };
  const results = [];
  for (const [index, message] of messages.entries()) {
    const { result, ms } = mapMessage(reasoner, state, message.quads);
    Object.assign(prefixes, message.prefixes);
    const options = { format: 'turtle', prefixes: { ...reasoner.prefixes, ...message.prefixes }, blankNodePrefix: `e${index + 1}_` };
    const given = await grouped(message.quads, options);
    const derived = await grouped(result.quads, options);
    results.push({
      index,
      ms,
      givenCount: given.quads.length,
      derivedCount: derived.quads.length,
      closure: `${given.turtle}\n# Derived by eyemind\n${derived.turtle || '# (nothing)'}`,
      merged: writeRdf([...message.quads, ...result.quads], options),
    });
  }
  // Prefixes used as prefixed names, not merely mentioned inside a literal.
  const used = Object.fromEntries(Object.entries(prefixes).filter(([p]) => results.some((r) => new RegExp(`(^|[\\s;,(\\[^])${p}:`, 'm').test(r.closure))));
  const text = `@version "1.1-messages" .\n${prefixLines(used)}\n\n` +
    results.map((r) => `# CloudEvent ${r.index + 1}\n${r.closure}`).join('\n@message .\n\n') + '\n';
  return {
    text,
    messages: results,
    triples: results.reduce((n, r) => n + r.givenCount + r.derivedCount, 0),
    derived: results.reduce((n, r) => n + r.derivedCount, 0),
    averageMs: results.reduce((n, r) => n + r.ms, 0) / Math.max(results.length, 1),
  };
}
