# Alignment shapes

Target shapes for converting CloudEvents-LD into other models, one folder per target. Each folder contains:
* `shapes.ttl`: the SHACL shapes the converted graph must conform to;
* `README.md`: the mapping from CloudEvents-LD, including what cannot be derived and what is deliberately not mapped.

| Folder | Target | What OWL 2 RL derives |
|---|---|---|
| [dcterms](dcterms/) | [DCMI Metadata Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) | The CloudEvent described with `dct:identifier`, `dct:date`, `dct:subject`, `dct:references`, `dct:relation` and `dct:creator`. |
| [prov-o](prov-o/) | [PROV-O](https://www.w3.org/TR/prov-o/) | The CloudEvent as a `prov:Entity` (the record), and its producer. Not the occurrence it describes, which would need a new node. |

## How a conversion runs

A conversion is OWL 2 RL reasoning, per RDF Message, over [`../terms.ttl`](../terms.ttl) and [`../alignments.ttl`](../alignments.ttl), on the output of [`../context.jsonld`](../context.jsonld). It is planned by two SHACL shapes: [`../shapes.ttl`](../shapes.ttl) describes each incoming message, and the target's `shapes.ttl` what must be derived. The [playground](../playground/) runs it with [eyemind](https://github.com/eyereasoner/eyemind); on the command line:

```sh
eyemind --owl2rl --stream-messages --shacl-in shapes.ttl --shacl-out alignment-shapes/dcterms/shapes.ttl \
  terms.ttl alignments.ttl events.ttl
```

OWL 2 RL only adds triples between nodes that already exist, and cannot turn a literal into an IRI. What a target needs beyond that is documented in its README, not added with extra rules.

The conversions add triples to the CloudEvents-LD graph and do not replace it. The shapes target every subject of `ce:id`, so they also check that every event in the input was converted. The conversions only use the envelope; the payload stays an `rdf:JSON` literal.
