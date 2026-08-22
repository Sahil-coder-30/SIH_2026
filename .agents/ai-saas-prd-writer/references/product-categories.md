# AI Product Categories

Why this matters: "AI feature" is not one shape of product. A one-line autocomplete suggestion and a multi-step agent that files refunds have almost nothing in common operationally, even though both are "AI." Picking the right category before drafting is what keeps the PRD from either missing something critical (shipping an agent with no autonomy boundary defined) or drowning a small feature in sections it doesn't need (a unit-economics deep-dive for a feature that costs a fraction of a cent per use).

Classify the product into exactly one primary category. If it's a blend, pick the one that describes its *riskiest* behavior — e.g., a tool that's mostly a copilot but can autonomously send an email without review should be treated as an Agent for guardrail purposes, even if 90% of its surface area is copilot-shaped.

---

## 1. Copilot / Assistant

**Shape:** Sits inline in an existing human workflow. Suggests, drafts, or answers; a human stays the one who decides and acts. The AI never has independent effect on the world.

**Examples:** inline code completion, email/reply drafting, "ask AI" sidebars, writing assistants, meeting-notes summarizers.

**Emphasize in the PRD:**
- Acceptance/rejection/edit-rate as a first-class success metric (not just "did they see it")
- Latency budget is usually tight and synchronous (this sits in the user's typing/reading flow)
- Dismissal UX — how a bad suggestion gets out of the way without friction
- Low autonomy-boundary need (the human is already the safeguard) — don't over-build this section

**De-emphasize:** irreversible-action guardrails, multi-step planning sections — they don't apply because the AI never acts alone.

---

## 2. Autonomous / Semi-Autonomous Agent

**Shape:** Plans multiple steps, calls tools or APIs, and can take actions with real-world effect (send, delete, purchase, deploy, modify data) with reduced or no human review per step.

**Examples:** a coding agent that opens PRs, a support agent that can issue refunds, a browser agent that fills out forms, an ops agent that restarts services.

**Emphasize in the PRD:**
- **Autonomy boundary**, explicitly: which actions are fully autonomous, which require approval, which are forbidden outright. This is the single most important section for this category — treat it as required, not optional.
- Tool/permission scope (exact list of tools/APIs it can call, and the blast radius of each)
- Human-in-the-loop checkpoints for irreversible or high-cost actions
- Cost per task (agent loops can burn tokens unpredictably — this is where unit economics matters most)
- Failure/rollback behavior — what happens if it's mid-task when it errors or is interrupted
- Sandboxing/isolation if it executes code or has filesystem/network access

**De-emphasize:** nothing — agents are the category where under-scoping this document causes the most real damage. If time is short, this is the category to spend the most of it on.

---

## 3. Workflow / Process Automation

**Shape:** A defined, mostly-deterministic pipeline where one or more steps use AI (classification, extraction, drafting) inside an otherwise fixed process, usually triggered by an event rather than a live user request.

**Examples:** inbound-lead enrichment, invoice data extraction, ticket auto-tagging, content-moderation pipelines.

**Emphasize in the PRD:**
- Trigger and SLA (this often runs async/batch — the latency budget is "minutes," not "milliseconds," which changes the whole non-functional section)
- Error handling for the pipeline as a whole, not just the AI step — what happens downstream if the AI step returns low-confidence or malformed output
- Human review queue design for anything below a confidence threshold
- Idempotency and retry behavior

**De-emphasize:** real-time latency sections (usually not the constraint here); heavy conversational-UX detail (often no chat surface at all).

---

## 4. Generative Content Tool

**Shape:** Produces a persistent artifact the user keeps, edits, publishes, or ships — text, image, code, video, audio, design.

**Examples:** blog-post generators, image/design generators, code scaffolding tools, ad-copy generators.

**Emphasize in the PRD:**
- Brand/style/quality guardrails (this is where "guardrails" means creative-quality control, not just safety)
- IP/copyright risk and originality checks if output resembles training data or existing brand assets
- Content moderation for generated output (not just user input)
- Revision/regeneration UX — how the user iterates toward a keeper

**De-emphasize:** real-time latency (usually generation can be async with a progress state); multi-step autonomy sections.

---

## 5. Data / Analytics Copilot

**Shape:** Natural-language interface over structured data — ask a question, get a chart, table, or number back. Often text-to-SQL or text-to-query under the hood.

**Examples:** "ask your data" dashboards, natural-language BI tools, spreadsheet copilots.

**Emphasize in the PRD:**
- Correctness verification — does the answer get shown with the underlying query/data so the user can check it, or is it a black box?
- Schema/data-source scope (what tables/data it can and can't touch — this doubles as a security boundary)
- Handling of ambiguous or unanswerable questions (graceful "I can't answer that from this data" vs. a confidently wrong number)
- Numeric accuracy is existential here — a wrong chart is worse than a wrong sentence, because it looks authoritative

**De-emphasize:** creative-quality guardrails (not relevant); tone/style sections.

---

## 6. Search & Retrieval (RAG)

**Shape:** Answers questions grounded in a specific knowledge base (docs, tickets, wiki, codebase) rather than the model's general knowledge.

**Examples:** internal knowledge-base Q&A, docs chatbots, codebase Q&A assistants.

**Emphasize in the PRD:**
- Retrieval quality metrics (recall@k, groundedness/faithfulness — is the answer actually supported by retrieved sources?), not just end-to-end answer quality
- Citation/source-attribution UX — can the user verify where an answer came from?
- Index freshness — how current is the knowledge base relative to the source of truth, and what happens on stale data
- Out-of-scope handling — what it says when the answer genuinely isn't in the corpus (this should not silently fall back to the model's general knowledge unless that's an explicit, disclosed decision)

**De-emphasize:** unit economics is usually lower-stakes here than for agents (retrieval + one generation call, not a loop).

---

## 7. Embedded AI Feature

**Shape:** A small AI-powered enhancement bolted onto an otherwise non-AI product surface — most users may not even register it as "AI."

**Examples:** smart search ranking, auto-categorization, "suggested reply," anomaly flags in a dashboard.

**Emphasize in the PRD:**
- Feature-flag / staged-rollout plan and a clean fallback to the pre-AI behavior if disabled
- Minimal-footprint UX — it should degrade invisibly, not break the surrounding non-AI experience
- Guardrail metrics tied to the *existing* product's core metrics (this is the category most likely to silently regress something the team wasn't watching)

**De-emphasize:** dedicated AI-native UX sections (there usually isn't a standalone AI surface to design).

---

## Quick classification heuristic

Ask these in order; the first "yes" usually settles it:

1. Does it take actions with real-world effect (send/delete/purchase/deploy) without a human approving each one? → **Agent**
2. Is it triggered by an event/batch rather than a live user request, with no real-time chat surface? → **Workflow Automation**
3. Does it produce a persistent artifact the user keeps or publishes? → **Generative Content Tool**
4. Does it answer questions grounded in a specific private knowledge base? → **RAG / Search**
5. Does it answer questions over structured/tabular data? → **Data/Analytics Copilot**
6. Is it a small enhancement inside an existing non-AI feature that most users wouldn't notice as "AI"? → **Embedded AI Feature**
7. Otherwise, if a human stays in the loop suggesting/drafting/assisting live → **Copilot/Assistant**
