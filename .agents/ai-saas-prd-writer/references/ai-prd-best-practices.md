# AI SaaS PRD — Best Practices

This is the "why" behind the template and the benchmark. Read it before drafting, not just when something goes wrong — most weak AI PRDs aren't wrong, they're just thin in ways that don't show up until an engineer or a launch review pushes on them.

## 1. Frame the problem around the user, not the model

The core problem statement should never contain the word "AI" as the reason something is broken. "Users can't get support answers fast enough at 2am" is a problem. "We lack an AI chatbot" is not — it's a solution wearing a problem's clothes, and it quietly forecloses better non-AI solutions before anyone's compared them.

Two disciplines that keep this honest:

- **Ask why AI specifically, not just why this feature.** If the underlying task could be solved cleanly with a lookup table, a rules engine, or a database query, it probably should be — AI adds latency, cost, and a probabilistic failure mode that deterministic code doesn't have. The PRD should state, in one or two sentences, why the problem resists a deterministic solution (unstructured input, open-ended generation, judgment calls at a scale humans can't cover).
- **State non-goals explicitly.** For an AI feature this matters more than for ordinary software, because the model is *capable* of doing far more than the product should let it do in v1. "This agent will not modify billing records in this release" is a non-goal that prevents scope creep from the model's raw capability, not just from stakeholder requests.

Anchor the objective to a measurable business or user outcome and a named persona down to specific behavior ("support agents who currently re-answer the same 12 questions daily," not "our users"). A hypothesis you can't falsify isn't a hypothesis.

## 2. Define AI-specific functional requirements

Ordinary functional requirements ("the button does X") aren't enough because the input space is open-ended. Pin down:

- **Exact input/context definition.** What does the model actually see at inference time — user text only, or also account history, connected-tool data, prior turns, retrieved documents? Vague context definitions are the single most common cause of a feature that demos well and fails in production, because the demo's context was hand-picked.
- **Golden examples.** Concrete example inputs paired with the expected output, for the common case *and* for at least one tricky case. These do double duty — they clarify intent for engineering, and they become the seed of the eval set.
- **Handling of weird, malicious, or off-topic input.** What happens on an empty input, a wall of text, a prompt-injection attempt embedded in retrieved content, a request wildly outside scope, or an attempt to extract the system prompt? "The model will refuse politely and log it" is a real answer; silence on this is not.

## 3. Build an evaluation framework, not a vibe check

An AI feature doesn't have a simple pass/fail state the way a button does. Without explicit thresholds, "is it good enough to ship" becomes a subjective argument in a launch review instead of a measurement. Define, with numbers wherever possible:

- The metric that defines quality for this specific product (accuracy, factual correctness, precision/recall, groundedness, task-completion rate — pick what's actually meaningful for the category, see `product-categories.md`).
- A minimum threshold for shipping (e.g., "≥ 0.85 confidence for answers surfaced without human review; below that, route to fallback").
- How the eval set itself is built and kept honest — golden examples plus a sample of real traffic, not just the cases the team thought of in the room.
- A **guardrail/do-not-disturb list**: metrics that must not regress even if the primary metric improves (e.g., a summarizer that gets more "helpful" but starts hallucinating more has not actually improved).

## 4. Design guardrails and the human-in-the-loop UX together

Guardrails and HITL are one design problem, not two separate checkboxes: guardrails decide *when* the system shouldn't be trusted alone, and HITL is *what happens* at that moment.

- **Risk-tier the output first.** Not every wrong answer matters equally. A miscategorized internal ticket and an incorrect medical or financial figure are not the same severity, and the PRD should say so explicitly rather than applying one blanket review policy everywhere.
- **Define the confidence floor and what happens below it** — route to a human, show a lower-confidence disclaimer, refuse and explain, or fall back to a simpler deterministic path. Silence here means engineering will pick one under deadline pressure, and it usually won't be the safest option.
- **Make the human's job in the loop concrete.** "A human reviews it" is not a spec. Reviews what, in what UI, with what context, able to take what actions (approve/edit/reject), and what happens if they do nothing?
- **Cover content safety plainly**: PII exposure/masking, moderation for both input and generated output, and what data — if any — leaves the system to reach a model provider.

## 5. Specify the non-functional/technical envelope

These are easy to skip because they feel like "engineering's problem," but they're product decisions with real trade-offs the PRD should own:

- **Latency budget**, split into time-to-first-token (for streaming UX) and total completion time, and whether the interaction is synchronous (user is waiting, blocking) or async (background, notify on completion) — this single decision reshapes the whole UX.
- **Model/provider dependency and fallback.** What happens if the primary model provider is down, rate-limited, or deprecates the model version being used? "We haven't decided" is an honest draft answer; "we assume it never goes down" is not.
- **Token/context limits** and what happens when real input exceeds them (truncate, summarize, reject, chunk).
- **Data model and state.** Where conversation/session state lives, what's persisted vs. ephemeral, and how it maps onto the existing schema (this is where the codebase-grounding pass in Step 2 of the skill pays off — don't invent a data model that duplicates one that already exists).

## 6. Own the data and compliance surface

AI features are only as good as what feeds them, and this is also where legal/compliance risk concentrates:

- **Data sourcing and provenance** — where inputs and any fine-tuning/retrieval data come from, and whether the org has the rights to use it this way.
- **Labeling/quality standards**, if applicable, for any dataset backing eval or fine-tuning.
- **Regulatory surface** — flag plainly if the feature touches data covered by GDPR, HIPAA, CCPA, or similar, and what that implies (data residency, deletion guarantees, consent). This doesn't need a legal opinion in the PRD, but it needs to be flagged, not silently assumed away.
- **PII handling** — is anything masked or scrubbed before it reaches a model provider, and is anything retained afterward for logging/eval that shouldn't be.

## 7. Put unit economics in the PRD, not just the eng budget

This is the section most non-AI PRDs don't have at all, and it's often the one that kills an otherwise-good AI feature post-launch. LLM calls cost money per use in a way that "add a button" never did.

- Rough **token/compute cost per interaction**, and how it scales with usage patterns (a single-shot answer vs. an agent loop that might call the model a dozen times per task have very different cost profiles).
- A **cost ceiling** the team is comfortable with per user or per request, so a feature that's technically working doesn't quietly become a margin problem at scale.
- Whether cost scales with something the user directly controls (message length, number of documents, task complexity) — if so, that's also a product-design lever, not just a finance line.

## 8. Prefer honest gaps over confident fabrication

Every section above will occasionally hit a genuine unknown — the team hasn't picked a confidence threshold yet, or doesn't have a cost estimate. The instinct to fill that blank with a plausible-sounding number is the single biggest way PRDs quietly become unreliable: a fabricated "≥ 0.9 accuracy target" that nobody actually committed to gets treated as a real requirement by the next person who reads it. Write "TBD — needs a decision from [owner]" instead, and log it. A PRD with three honest TBDs and an owner for each is more production-grade than one with zero TBDs and three invented numbers.
