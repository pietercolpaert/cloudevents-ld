# CloudEvents-LD → DCMI Metadata Terms

[`shapes.ttl`](shapes.ttl) describes the [DCMI Metadata Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) (`dct:`) description of a CloudEvent that a conversion of CloudEvents-LD must produce.

## Model

The CloudEvent is described as a resource with the generic DCMI properties: what identifies it, when it happened, what it is about, and what it refers to.

```turtle
<event> dct:identifier "…" ;                 # = ce:id
    dct:date "…"^^xsd:dateTimeStamp ;        # = ce:time
    dct:subject "…" ;                        # = ce:subject
    dct:references <payload> ;               # = ce:dataref
    dct:relation <schema> ;                  # = ce:dataschema
    dct:creator <producer> .                 # = ce:producedBy, if known
```

No rules are needed: every property follows from a sub-property axiom in [`alignments.ttl`](../../alignments.ttl), so OWL 2 RL reasoning over `terms.ttl` and `alignments.ttl` produces the whole description.

The conversion adds to the CloudEvents-LD graph and does not replace it, so the event keeps its `ce:` attributes.

## Mapping

| CloudEvents-LD | DCMI Metadata Terms | Notes |
|---|---|---|
| `ce:id` | `dct:identifier` | "An unambiguous reference to the resource within a given context": here the context is `ce:source`. |
| `ce:time` | `dct:date` | "A point or period of time associated with an event in the lifecycle of the resource": the generic time property. |
| `ce:subject` | `dct:subject` | DCMI allows "a literal value that identifies the subject" when no IRI is available. |
| `ce:dataref` | `dct:references` | The event points to where its payload is stored. |
| `ce:dataschema` | `dct:relation` | A related resource. Not `dct:conformsTo`: the payload conforms to the schema, not the event record. |
| `ce:producedBy` | `dct:creator` | The producer makes the event record. |

Deliberately not mapped:
* **`ce:time` to `dct:created`, `dct:issued` or `dct:modified`.** Those are specific moments in the life of the record; `ce:time` is the time of the occurrence.
* **`ce:source` to `dct:source`.** `dct:source` is a resource the described resource is derived from; `ce:source` names the context in which the occurrence happened.
* **`ce:type` to `dct:type`.** `ce:type` is a producer-defined string, not a class. A producer-specific rule can map known event types to a class.
* **`ce:datacontenttype` to `dct:format`.** It describes the payload, not the event, and `dct:format` expects a media-type resource, not a string.
