# PRD Master Template

Use this as the shape of the drafted document in Step 5. Sections marked **[Always]** appear in every PRD regardless of category. Sections marked **[Category-conditional]** only appear when the classification from Step 3 calls for them — see `product-categories.md` for which categories need which. Don't leave a conditional section in in name only ("Autonomy Boundary: N/A") — omit it entirely if it doesn't apply, and say so in the hand-off instead.

Everything in `{brackets}` is a prompt for what goes there, not literal text to keep in the output.

---

```markdown
# [Product/Feature Name] — PRD

| | |
|---|---|
| **Status** | {Draft / In Review / Approved} |
| **Date & Version** | {date, v0.1} |
| **Product POC** | {name} |
| **Design POC** | {name or N/A} |
| **Tech POC** | {name} |
| **AI/ML POC** | {name or N/A — who owns eval quality post-launch} |
| **Product Category** | {Copilot / Agent / Workflow Automation / Generative Content / Data Copilot / RAG / Embedded Feature} |

## Why (Objective) — [Always]

**Business case:** {what business outcome this drives, and — per best-practices §1 — why this specifically needs an AI/probabilistic approach rather than deterministic logic}

**User case:** {what the user can't do today; the workaround they use now, if any}

## Non-Goals — [Always]

{Explicitly excluded from this release. Include capability the model is technically able to do but that the product intentionally won't expose yet — this is the scope-creep firewall for AI features specifically.}

## How We Measure Success — [Always]

**North star metric:** {the one metric this feature is judged on}
**Supporting metrics:** {secondary success signals}
**Guardrail / do-not-disturb metrics:** {metrics that must not regress even if the north star improves}

## Evaluation Framework — [Always for anything with model-generated output]

**Quality metric(s):** {accuracy / precision / recall / groundedness / task-completion — pick what's meaningful for this category}
**Minimum shipping threshold:** {e.g. "≥0.85 confidence for auto-surfaced answers"}
**Eval set construction:** {golden examples + sampled real traffic — how it's built and kept current}
**Example prompts & expected outputs:** {at least one typical case, one edge case}

## Who Are the Users — [Always]

**Persona(s):** {specific, behavioral — not "our users"}
**Problem / Jobs-to-be-done:** {the need, stated as a job the user is trying to get done}
**Evidence this problem is real:** {research, support-ticket volume, interviews, usage data — not assumed}

## Solution — [Always]

**Brief:** {what's being built, in plain language}
**Alternatives considered:** {other approaches, including non-AI ones, and why they were ruled out — this is where §1's "why AI specifically" gets defended with real trade-offs}

## Autonomy Boundary — [Category-conditional: Agent]

**Fully autonomous actions:** {what it can do with zero human review}
**Requires approval:** {what it proposes but a human must confirm before it executes}
**Forbidden:** {what it must never do in this release, regardless of confidence}
**Tool/permission scope:** {exact list of tools/APIs/systems it can call, and the blast radius if misused}
**Failure/rollback behavior:** {what happens if it errors or is interrupted mid-task}

## Guardrails & Safety — [Always]

**Risk tier:** {critical / moderate / low — how bad is a wrong output here, concretely}
**Content safety:** {PII handling/masking, input & output moderation, what data reaches a model provider}
**Fallback behavior below the confidence floor:** {route to human / disclaim / refuse / deterministic fallback}
**Adversarial & edge-case input handling:** {empty input, prompt injection, off-topic requests, malicious input}

## Human-in-the-Loop UX — [Always unless category is a low-stakes Embedded Feature with no user-facing AI surface]

**Review checkpoints:** {what a human reviews, in what UI, before what happens}
**Reviewer's available actions:** {approve / edit / reject / escalate}
**What happens on no action:** {timeout behavior — does it proceed, hold, or expire}

## Product Flow — [Always]

**User/agent journey:** {step by step}
**Wireframes / flow diagrams:** {link}
**User stories:** {as a {persona}, I want {capability}, so that {outcome}}
**Acceptance criteria:** {per story — objectively checkable, includes the quality threshold from the eval section where relevant}
**Edge cases:** {beyond adversarial input — empty states, partial data, concurrent use}
**Event tracking plan:** {what gets logged to measure the metrics above}

## Non-Functional Requirements — [Always]

**Latency budget:** {time-to-first-token and total completion time; sync vs. async}
**Model/provider dependency:** {which model(s)/provider(s); fallback if unavailable; versioning approach}
**Token/context limits:** {what happens when real input exceeds them}
**Data model:** {what's persisted, what's ephemeral, how it maps onto existing schema}

## Data & Compliance — [Category-conditional: anything touching regulated, sensitive, or externally-sourced data]

**Data sourcing/provenance:** {inputs, and any fine-tuning/retrieval data}
**Labeling standards:** {if applicable}
**Regulatory surface:** {GDPR / HIPAA / CCPA / none — flagged explicitly either way}
**PII handling:** {masked/scrubbed before reaching the model? retained in logs?}

## Unit Economics — [Category-conditional: Agent, Workflow Automation, high-volume Copilot — anything with meaningful per-use compute cost]

**Cost per interaction:** {rough token/compute cost estimate}
**Cost ceiling:** {per user or per request, that the team is comfortable with}
**Cost scaling factors:** {what user behavior drives cost up — also a product lever, not just a finance number}

## Tentative Timeline — [Always]

| Milestone | Date |
|---|---|
| Leadership approval | |
| Design ready | |
| Eval set / golden examples ready | |
| Prototype testing | |
| Development starts | |
| Beta launch | |

## Dependencies — [Always]

**Open questions:** {logged from Step 4 — genuinely undecided items, each with an owner}
**Infra requirements:** {}
**Budget approvals:** {}
**Partner/API dependencies:** {including the model provider itself}
**Internal dependencies:** {other teams, other in-flight work}

## Decision Log — [Always]

{Running log of assumptions made when the user deferred a decision, and open items still needing sign-off. This is what turns "TBD" into a tracked commitment instead of a silently forgotten gap.}

## Related Documents — [Always]

{Tech design doc, design file, go-to-market doc — links}
```
