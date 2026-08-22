---
name: ai-saas-prd-writer
description: Research-grade workflow for drafting production-ready Product Requirements Documents (PRDs) for AI/LLM-powered SaaS features, agents, and products. Use this skill whenever the user asks to write, draft, spec out, or update a PRD, requirements doc, or product spec for an AI feature, AI agent, AI copilot, or AI SaaS product — including phrasing like "write a PRD for X", "spec out this agent", "document requirements for this feature", "help me plan this AI product", or "create a PRD template". Also use it when a user pastes a rough feature idea and asks for it to be turned into a structured document. This skill classifies the product into an AI-product category to select the right sections, drives a human-in-the-loop interview instead of guessing, reads the actual codebase for grounding before asking questions, and grades the finished PRD against a bundled quality benchmark before handing it off. Do not use for general project-management docs, non-AI features, or one-off status updates — this skill is specifically tuned for AI/LLM-powered product requirements.
---

# AI SaaS PRD Writer

## What this skill is for

A PRD for a normal software feature can get away with "what does it do, who's it for, when does it ship." A PRD for an AI feature can't stop there, because AI features fail differently than normal software: they degrade gracefully or ungracefully instead of throwing a clean error, they cost money per request instead of being free to run, their quality is a distribution instead of a boolean, and a wrong answer delivered confidently is usually worse than no answer at all. A PRD that doesn't pin down evaluation thresholds, guardrails, fallback behavior, and unit economics isn't a lighter version of an AI PRD — it's missing the parts that make it an AI PRD.

This skill exists to make sure none of that gets skipped, while still producing a document a real team would actually read (not a 40-field form nobody fills in). It runs as a loop, not a template fill: **ground in the real codebase → classify the product → interview the human for what the code can't tell you → draft → self-grade against the benchmark → iterate → hand off.**

Read `references/ai-prd-best-practices.md` once per session before drafting — it's the substantive "why" behind every section below and is worth having fresh in context.

## The workflow

### Step 1 — Orient before asking anything

Before writing a single question, check what's already answered:

- Re-read the user's own message(s) for anything they already told you (problem, users, constraints, timeline). Never ask for something already stated.
- If the conversation or workspace has memory/context files about this project, check those too.
- Look for an existing PRD, spec, or `/docs` folder for this feature — if one exists, this is an *update*, not a fresh draft. Say so, and diff against it rather than starting over.

### Step 2 — Ground in the actual codebase

Do this even if the user didn't ask for it. A PRD that contradicts the codebase (proposing an endpoint that already exists, picking a model provider that isn't in the dependency tree, inventing a data model that duplicates an existing schema) is actively worse than one that's silent on those points, because it erodes trust in the whole document the moment an engineer reads it.

Follow `references/codebase-review-checklist.md` for exactly what to look at and in what order. The short version: README and docs first, then dependency manifests (to see what AI/LLM SDKs and frameworks are already committed to), then schema/data models, then existing API routes, then config/env variable *names* (never values), then any existing PRDs. Budget this as a real pass, not a token glance — 2–3 minutes of `view`/`grep` here saves several rounds of avoidable questions later.

Everything you learn here should either (a) get folded straight into the draft with no need to ask, or (b) sharpen the specific question you still need to ask ("I see you're already on LangGraph with a Postgres checkpointer — is the new agent a new graph, or a node added to the existing one?" beats "what's your tech stack?").

### Step 3 — Classify the product

Read `references/product-categories.md` and pick the closest match: Copilot/Assistant, Autonomous Agent, Workflow Automation, Generative Content Tool, Data/Analytics Copilot, Search & Retrieval (RAG), or Embedded AI Feature. This choice isn't cosmetic — it determines which sections of the template actually matter. An embedded autocomplete feature doesn't need an autonomy-boundary section; an agent that can call tools and take irreversible actions absolutely does.

If it's obvious from the codebase pass and the user's framing, state your classification and move on ("This reads as an Autonomous Agent — it plans steps and calls tools without a human approving each one"). If it's genuinely ambiguous (e.g., could be a copilot or a light agent depending on one decision), ask — this is a case where a wrong guess would silently produce the wrong PRD, so it's worth a single targeted question rather than a hedge.

### Step 4 — Interview (this is where HITL lives)

This is the core of the skill, so take it seriously rather than rushing to draft. The goal is not to interrogate the user with every question in the bank — it's to close every gap that would otherwise force you to invent an answer.

**How to run it:**

- Pull from `references/clarifying-questions-bank.md`, but treat it as a menu you select from based on the gaps you actually have after Steps 1–3, not a script to read top to bottom.
- Batch related questions together in one turn instead of one-at-a-time ping-pong — ask everything you need for a topic cluster (e.g., success metrics + guardrail metrics together) in a single pass.
- Ask as many rounds as the document genuinely needs. If the draft surfaces a new gap later (Step 5), go back and ask — a PRD is allowed to cost more than one round-trip. Don't pad the interview with questions you can already answer just to look thorough, and don't stop early just because you've asked once.
- Prioritize by what the answer actually changes. Some answers change which sections exist at all (product category, whether this is high-stakes/regulated). Some change specific numbers (latency budget, cost ceiling). Some are polish (exact copy for an empty state). Ask in roughly that order of leverage.

**Where to hold the line vs. where to move on:**

- For anything that changes the safety posture, the eval bar, or the autonomy boundary of the product (confidence thresholds, what happens on a wrong answer, whether the agent can take irreversible actions unsupervised, whether PII/regulated data is involved) — do not guess, and do not accept a shrug. Ask directly, and if the user genuinely doesn't know yet, write it into the Decision Log as an open, owned question rather than picking a number yourself.
- For lower-stakes specifics the user waves off ("you decide," "whatever's standard"), pick a sensible default, state it plainly in the draft, and log it as an assumption rather than blocking. Momentum matters too.
- Never fabricate a metric, persona detail, or research finding to fill a blank. A section that honestly says "TBD — needs a decision from [X]" is more production-grade than one with a confident, made-up number, because the fake number is the one that survives into a launch deck unchallenged.

### Step 5 — Draft

Use `references/prd-master-template.md` as the shape. It's the standard PRD skeleton (objective, success metrics, users, solution, product flow, timeline, dependencies) with the AI-specific sections woven in at the points where they belong, not bolted on as an appendix — evaluation criteria sits next to success metrics, guardrails sit next to the solution, unit economics sits next to dependencies. Include only the category-conditional sections that apply per Step 3's classification (the template marks these).

Write in specifics gathered from Steps 2–4, not filler. If a number is genuinely unknown after asking, write "TBD" with an owner and don't disguise it as a decided fact.

Save the file into whatever location the codebase already uses for docs (`docs/prd/`, `/specs`, etc. — this is one of the things Step 2 should have told you); if there's no existing convention, ask once rather than guessing a structure the team doesn't use.

### Step 6 — Self-grade against the benchmark

Run the bundled scorer before showing the document to the user:

```bash
python3 scripts/prd_benchmark.py <path-to-prd.md> --category <category-from-step-3>
```

Read the report. For every failed check, either fix the draft or — if the check genuinely doesn't apply to this product (e.g., a "unit economics" check on a feature with zero marginal LLM cost) — leave it out deliberately and say so when you hand off, rather than silently accepting a low score or padding the doc with a section that doesn't mean anything for this product. Re-run after fixing until the score clears the bar the script reports, or until every remaining gap is a deliberate, explained exclusion.

### Step 7 — Hand off

Present the PRD along with:
- The benchmark score and a one-line summary of what it checked.
- Any open items you logged in the Decision Log instead of guessing — these need a human decision before the doc is truly final.
- Anything you deliberately left out because it didn't apply to this product's category, and why.

A PRD produced this way is a draft for review, not a finished artifact the user should sign off on sight-unseen — say so plainly, especially for anything you marked TBD.

## Reference files

Read these as needed rather than all upfront — they're kept separate so this file stays short:

- `references/ai-prd-best-practices.md` — the substantive guidance behind every AI-specific section (why AI PRDs need eval frameworks, guardrails, unit economics, etc.). Read this before drafting Step 5 if it isn't already fresh in context.
- `references/product-categories.md` — the classification taxonomy for Step 3, with per-category section guidance.
- `references/prd-master-template.md` — the actual template skeleton used in Step 5.
- `references/clarifying-questions-bank.md` — the question menu for Step 4.
- `references/codebase-review-checklist.md` — what to check and in what order for Step 2.
- `scripts/prd_benchmark.py` — the quality scorer used in Step 6. Run with `--help` for all flags.
- `assets/example-prd-support-triage-copilot.md` — one fully-filled example PRD (a support-ticket triage copilot) to calibrate tone, specificity, and depth. Skim this if unsure how detailed a section should be.
