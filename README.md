# CloudEvents-LD

A Linked Data vocabulary for CloudEvents to ensure we can become interoperable with other vocabularies, such as PROV-O, ActivityStreams, etc.

## Files

 * `terms.ttl` contains all the newly defined terms.
 * `shapes.ttl` contains a SHACL shape
 * `context.jsonld` contains a JSON-LD context that can be used as an external context on any cloudevents. It maps the event envelope; the `data` payload becomes an opaque `rdf:JSON` literal (see [Scope](#scope-cloudevents-describe-the-envelope-not-the-data-payload)). Extension attributes that CloudEvents does not define are left out; add a producer-specific context for those (see [Extension attributes](#extension-attributes)).
 * `alignments.ttl` contains the OWL declarations and alignments with other vocabularies such as PROV-O; it is imported by `terms.ttl`.
 * `alignment-shapes/` contains, per target model (dcterms, PROV-O, schema.org), the SHACL shapes and mapping for converting CloudEvents-LD into that model with OWL 2 RL. See the [alignment shapes index](alignment-shapes/README.md).
 * `examples/` contains real CloudEvents and their RDF, such as the [Flemish address register example](examples/flanders-grar/). See the [examples index](examples/README.md).
 * `scripts/build-examples.js` generates every `examples/*/events.ttl` from its `events.json`.
 * `spec.bs` the source of the specification which tells you how to use CloudEvents in combination with RDF tooling.
 * `playground/` the demonstrator: a page that converts CloudEvents with `context.jsonld` and aligns them with the `alignment-shapes/`, using [eyemind](https://github.com/eyereasoner/eyemind). `npm start` builds it into `_site/`.

## Scope: CloudEvents describe the envelope, not the data payload

CloudEvents-LD maps the CloudEvents **envelope**: its context attributes, such as `id`, `source`, `type` and `time`, and the extension attributes documented by CloudEvents. The JSON-LD context keeps the **payload** opaque:

| JSON member | RDF |
|---|---|
| `data` | `ce:data`, an `rdf:JSON` literal holding the JSON value (for non-JSON content such as XML, the JSON string that carries it) |
| `data_base64` | `ce:data`, an `xsd:base64Binary` literal |

To interpret the payload as RDF, parse `ce:data` in a separate step, using its `datacontenttype` and `dataschema`.

We do it this way because the payload cannot be mapped well within the same JSON-LD context:

* **The right mapping depends on the payload.** A JSON-LD term has exactly one mapping. It cannot change based on `datacontenttype` (JSON, XML, binary, …) or `dataschema`, which sit next to `data` in the event.
* **The envelope and the payload get in each other's way.**
  * Mapped as RDF, the payload inherits the envelope's context: payload keys such as `type` and `id` would get their CloudEvents meaning, and a payload that brings its own `@context` clashes with the envelope's protected terms.
  * Without a separate graph per event, successive states of the same resource, as in a change feed, merge into one graph and contradict each other.
  * With a graph per event, a payload that has its own named graphs breaks, because RDF datasets cannot nest graphs.
* **Plain JSON and text payloads would disappear silently.** Mapping a payload without a context as RDF drops it; `rdf:JSON` keeps everything. JSON-LD does sort the keys and remove whitespace, so the JSON is not byte-identical.
* **The envelope stays simple.** Any JSON-LD processor can turn existing CloudEvents into RDF by applying `context.jsonld` externally (`expandContext`, or an HTTP `Link` header), without changing the events.

A separate payload step can choose a mapping per `datacontenttype` and `dataschema`, such as an RML mapping or a payload-specific JSON-LD context. It can also keep each event and its payload together, for example as one RDF Message.

## Extension attributes

`context.jsonld` maps the core attributes and the extension attributes that CloudEvents v1.0.2 documents (`dataref`, `traceparent`, `tracestate`, `partitionkey`, `sampledrate`, `sequence`, `sequencetype`) to terms in `terms.ttl`. It also maps `recordedtime`, documented after v1.0.2, which records when the producer created the event, as opposed to `time`, when the occurrence happened.

Producers define other extension attributes, such as Debezium's `iodebezium*` or Keptn's `shkeptncontext`. Their meaning is up to the producer, so CloudEvents-LD does not mint IRIs for them, and JSON-LD drops them unless a context maps them.

To keep them, apply a second, producer-specific context after `context.jsonld`, which maps them to predicates in the producer's namespace. The [examples](examples/) do this with placeholder namespaces under `https://example.org/`, for example `debezium:` for Debezium. A producer can describe its predicates with `ce:attributeName` and `ce:attributeType`.

`context.jsonld` is protected, so a producer-specific context can add terms but cannot redefine the CloudEvents ones.

## Demo

I also publish a demo (built with github pages) at https://www.pieter.pm/cloudevents-ld/

What the demo does:
 1. You can see different examples of cloudevents from different vendors and as a result from different protocols (see examples/ folder)
 2. By adding the fixed JSON-LD of CE in this repo, and your optional additional context, you can see a Turtle representation of the RDF message produced from your JSON.
 3. You can interpret a JSON array of cloud events as an RDF Message Log, and feed it into a reasoner (I use [eyemind](https://github.com/eyereasoner/eyemind)) to turn the messages into the shape you need, whether that’s PROV-O, dcterms, or something else.

The examples are real examples from implemented initiatives.

## Building

Github actions builds - want to test this locally? Run `npm start`

On every push to `main`, the [Playground workflow](.github/workflows/pages.yml) builds the playground and publishes it on GitHub Pages, together with the vocabulary files it links to. It fails when an `examples/*/events.ttl` is not what `npm run build:examples` generates, so the published RDF always matches its JSON. For the first deployment, set *Settings → Pages → Source* to *GitHub Actions* in the repository.

`npm start` regenerates the RDF of the examples, builds the playground into `_site/` (`npm run build:playground`) and serves it. The playground takes its examples from `examples/` and its alignment targets from `alignment-shapes/`, so a new folder there shows up in the playground after a rebuild.

To regenerate the RDF of the examples:

```sh
npm install
npm run build:examples
```

For each folder in `examples/`, this applies `context.jsonld` and, if present, the folder's own `context.jsonld` to `events.json`, and writes `events.ttl`. The generated files must not be edited by hand.

## FAQ

### How does CloudEvents-LD relate to Linked Data Event Streams (LDES)?

[Linked Data Event Streams](https://w3id.org/ldes/specification) (LDES) is a SEMIC specification for publishing an event log as Linked Data. It takes a different approach from CloudEvents: CloudEvents wraps each event's data in an envelope of metadata, whereas LDES leaves the members as they are and describes, on the event stream, where in each member that metadata can be found.

For example, `ce:time` holds the time of the occurrence in the envelope, whereas `ldes:timestampPath` is a SHACL property path to whichever property in a member holds its timestamp. LDES therefore does not need an envelope. CloudEvents-LD events can still be published in an LDES, with `ldes:timestampPath ce:time`, provided that:

* **each event has an IRI.** `tree:member` must point to an IRI, while `context.jsonld` produces blank nodes. Mint the IRI from `source` and `id` together, as `id` alone is only unique within its source.
* **every event has a `time`.** The attribute is optional in CloudEvents.
* **events are published in time order.** With `ldes:timestampPath` set, an LDES does not accept a member with a timestamp earlier than the latest one published, whereas CloudEvents producers may send events late or retransmit them.

The `sequence` extension fits `ldes:sequencePath`, which orders members with the same timestamp, or all members if there is no timestamp path. `ce:sequence` is a string by design: CloudEvents v1.0.2 requires a "lexicographically-orderable string", so values sort correctly by plain string comparison, which is how XPath compares them. Integers therefore have to be zero-padded (`"001"`, `"002"`, …). The exception is v1.0.2's `sequencetype` `Integer`: its values are unpadded (`"10"` sorts before `"9"`) and wrap around after 2,147,483,647, so they cannot serve as an `ldes:sequencePath`. The unreleased work in progress towards CloudEvents 1.0.3 (the specification repository's `main` branch) drops `sequencetype` and makes the zero-padding requirement explicit.

LDES paths can only reach the envelope: the payload stays an `rdf:JSON` literal (see [Scope](#scope-cloudevents-describe-the-envelope-not-the-data-payload)). A path into the payload, such as `ldes:versionOfPath`, needs the payload to be mapped to RDF first.

### Does this demo support RDF Messages?

Yes, but not with JSON-LD alone. A batch of CloudEvents is a JSON array, one event per element (the JSON batch format, `application/cloudevents-batch+json`). A JSON-LD processor that applies `context.jsonld` to that array produces one RDF graph with the triples of all events. The boundaries between the events are lost: nothing in the result says which triples belong to which event, and when two events mention the same resource, their triples merge.

The playground and `npm run build:examples` therefore apply the context to each element of the array separately, outside JSON-LD. The playground writes the results as an [RDF Message](https://w3c-cg.github.io/rsp/spec/messages) Log, one message per event:

```turtle
@version "1.1-messages" .
@prefix ce: <https://w3id.org/cloudevents#> .

_:e1_b0 ce:id "1" ; ce:type "basisregisters.address.create.v1" ; … .
@message .
_:e2_b0 ce:id "2" ; … .
```

[eyemind](https://github.com/eyereasoner/eyemind) then aligns each message on its own (`--stream-messages`), so each event's alignment only sees that event.

To get the same result from a JSON-LD processor and an external context alone, JSON-LD needs a way to say that the elements of an array are separate RDF Messages. [w3c-cg/rsp#52](https://github.com/w3c-cg/rsp/issues/52) proposes this: a `@messages` container, which makes each element of an array its own message, and a way to apply such a container to a top-level array. `context.jsonld` could then declare that a CloudEvents batch is a message log, for example like this (hypothetical syntax, still under discussion):

```json
{
  "@context": {
    "@version": 1.1,
    "@root": { "@container": "@messages" },
    "id": "ce:id",
    "…": "…"
  }
}
```

Existing CloudEvents APIs would then be readable as RDF Message Streams without changing their responses, and a JSON-LD parser could emit each event as soon as it has read it. The alternative discussed in [w3c-cg/rsp#53](https://github.com/w3c-cg/rsp/issues/53) is to declare message boundaries in an RML mapping instead.

## License and copyright

This is part of a task I’m doing for the [OSLO](https://data.vlaanderen.be) initiative in Flanders.

EUPL © Vlaamse Regio