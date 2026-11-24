# CloudEvents-LD → schema.org

[`shapes.ttl`](shapes.ttl) describes the [schema.org](https://schema.org/) description of a CloudEvent that a conversion of CloudEvents-LD produces with OWL 2 RL over `terms.ttl` and [`alignments.ttl`](../../alignments.ttl).

## Model

A CloudEvent is a `schema:Message`, "a single message from a sender to one or more organizations or people": it goes from its producer to its consumers. OWL 2 RL derives the whole description, without rules.

```turtle
<event> a schema:Message ;
    schema:identifier "…" ;                  # = ce:id
    schema:about "…" ;                       # = ce:subject
    schema:schemaVersion <schema> ;          # = ce:dataschema
    schema:sender <producer> .               # = ce:producedBy, if known
```

The namespace is `http://schema.org/`, the one schema.org's own JSON-LD context uses. `schema:about` expects a `Thing`, but schema.org accepts text where a `Thing` is expected, which is what `ce:subject` holds. The conversion adds to the CloudEvents-LD graph and does not replace it, so the event keeps its `ce:` attributes.

## Mapping

| CloudEvents-LD | schema.org | Notes |
|---|---|---|
| the event | `a schema:Message` | Not `schema:Event`: that is the happening itself, not a record of it. |
| `ce:id` | `schema:identifier` | Unique within `ce:source`. |
| `ce:subject` | `schema:about` | "The subject matter of the content." |
| `ce:dataschema` | `schema:schemaVersion` | "A particular version of a schema used in some CreativeWork": the payload, part of the message, uses this schema. |
| `ce:producedBy` | `schema:sender` | The producer sends the message. |

Deliberately not mapped:
* **`ce:time` to `schema:dateSent` or `schema:dateCreated`.** Those are moments in the life of the message; `ce:time` is the time of the occurrence. schema.org has no property for the time a message's occurrence happened.
* **`ce:datacontenttype` to `schema:encodingFormat`.** On a `schema:Message`, that would be the format of the message itself, while `ce:datacontenttype` is the payload's.
* **`ce:source` and `ce:type`.** schema.org has no property for the context a message comes from or for its kind.
