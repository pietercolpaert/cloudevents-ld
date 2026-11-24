# CloudEvents-LD → PROV-O

[`shapes.ttl`](shapes.ttl) describes the [PROV-O](https://www.w3.org/TR/prov-o/) graph that a conversion of CloudEvents-LD produces with OWL 2 RL over `terms.ttl` and [`alignments.ttl`](../../alignments.ttl), as the [playground](../../playground/) does with [eyemind](https://github.com/eyereasoner/eyemind).

## Model

PROV-O separates a record from what happened. The CloudEvent is the record, a `prov:Entity`, and OWL 2 RL derives that much for every event, together with when the record was created and by whom, when the event says so.

```turtle
<event> a prov:Entity ;                       # the CloudEvent: a record
    prov:generatedAtTime "…"^^xsd:dateTimeStamp ;  # = ce:recordedtime, if present
    prov:wasAttributedTo <producer> .         # only if ce:producedBy is known
```

That is all OWL 2 RL can derive. In PROV-O, the time and place of what happened belong to a separate `prov:Activity`: the occurrence the record describes (`ce:describesOccurrence`). CloudEvents-LD has no node for that occurrence, and OWL 2 RL cannot create one, because its rules only add triples between nodes that already exist. So `ce:time` and `ce:source` have no place in this PROV-O description, and the examples show the record only. When data does describe the occurrence, for example as a Linked Data enrichment, the shapes check it too.

The conversion adds to the CloudEvents-LD graph and does not replace it, so the event keeps its `ce:` attributes, including `ce:time` and `ce:source`.

## The occurrence, when the data describes it

```turtle
<event> ce:describesOccurrence <occurrence> .

<occurrence> a ce:Occurrence ;               # ce:Occurrence ⊑ prov:Activity (alignments.ttl)
    prov:startedAtTime "…"^^xsd:dateTime ;
    prov:endedAtTime   "…"^^xsd:dateTime ;   # equal: a CloudEvent records an instant
    prov:atLocation <location> .

<location> a prov:Location .
```

## Mapping

| CloudEvents-LD | PROV-O | How |
|---|---|---|
| the event | `a prov:Entity` | `ce:CloudEvent` ⊑ `prov:Entity` in `alignments.ttl` |
| `ce:recordedtime` | `prov:generatedAtTime` | `ce:recordedtime` ⊑ `prov:generatedAtTime`: both are when the record was created |
| `ce:producedBy` | `prov:wasAttributedTo`, typed `prov:Agent` | `ce:producedBy` ⊑ `prov:wasAttributedTo` and `ce:Producer` ⊑ `prov:Agent` |
| `ce:Occurrence`, if the data has one | `prov:Activity` | `ce:Occurrence` ⊑ `prov:Activity` |
| `ce:time` | — | Would be `prov:startedAtTime` and `prov:endedAtTime` of the occurrence, which OWL 2 RL cannot create. |
| `ce:source` | — | Would be `prov:atLocation` of the occurrence, and needs an IRI where `ce:source` is a literal. |

Not mapped: `ce:id`, `ce:specversion`, `ce:type`, `ce:subject`, `ce:datacontenttype`, `ce:dataschema`, `ce:data` and extension attributes. They stay as CloudEvents-LD. See the [dcterms](../dcterms/) target for a description that does include identifier, time and subject.

Deliberately not produced:
* **`prov:generatedAtTime` from `ce:time`, also not as a fallback when `ce:recordedtime` is missing.** `prov:generatedAtTime` is when the record was created; `ce:time` is when the occurrence happened. The two differ whenever an occurrence is recorded later, as in a migration or backfill, so the fallback would be wrong for exactly those events. OWL 2 RL cannot express a default based on a missing value anyway.
* **`prov:wasGeneratedBy` from the record to the occurrence.** In CloudEvents, the producer creates the record, not the occurrence.
