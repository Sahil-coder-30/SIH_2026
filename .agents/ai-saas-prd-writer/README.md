# ai-saas-prd-writer

A SKILL.md package for drafting production-grade PRDs for AI/LLM-powered SaaS features — with a human-in-the-loop interview, a codebase-grounding pass, product-category-aware sections, and a bundled quality benchmark.

## Install into Google Antigravity

Antigravity reads skills from two possible locations:

**Project/workspace scope** (only this repo) — recommended for this skill:
```bash
mkdir -p <your-project-root>/.agents/skills
cp -r ai-saas-prd-writer <your-project-root>/.agents/skills/
```

**Global scope** (every project on your machine):
```bash
mkdir -p ~/.gemini/config/skills
cp -r ai-saas-prd-writer ~/.gemini/config/skills/
```

Antigravity loads skills via progressive disclosure — it only pulls `SKILL.md` into context when your request matches its description, and only opens files under `references/`, `scripts/`, and `assets/` when `SKILL.md` points to them. You don't need to do anything else; just start a task like *"write a PRD for the new agent that auto-triages support tickets"* and it should trigger.

## Also works in Claude Code / Claude Skills

`SKILL.md` is an open, cross-agent format — the same folder works unmodified in Claude Code:

```bash
mkdir -p .claude/skills
cp -r ai-saas-prd-writer .claude/skills/
```

or globally at `~/.claude/skills/`. If you want one canonical copy shared between Antigravity and Claude Code in the same repo, keep it at `.agents/skills/` and symlink the other direction:

```bash
ln -s .agents/skills .claude/skills
```

## What's inside

```
ai-saas-prd-writer/
├── SKILL.md                                   — the workflow the agent follows
├── references/
│   ├── ai-prd-best-practices.md                — the "why" behind every AI-specific section
│   ├── product-categories.md                   — 7-way product taxonomy + per-category section guidance
│   ├── prd-master-template.md                  — the fillable PRD skeleton
│   ├── clarifying-questions-bank.md             — the HITL question menu
│   └── codebase-review-checklist.md             — what to check in the repo before asking the user anything
├── scripts/
│   └── prd_benchmark.py                        — scores a finished PRD.md against a 23-point weighted rubric
├── assets/
│   └── example-prd-support-triage-copilot.md   — a fully-worked golden example (scores 100/100)
└── tests/
    ├── fixtures/
    │   ├── partial_prd.md                      — a normal PM-style PRD missing AI-specific rigor (scores ~26/100)
    │   └── incomplete_prd.md                   — a near-empty PRD (scores 0/100)
    └── test_benchmark.py                       — asserts the benchmark actually discriminates between the three
```

## Using the benchmark standalone

You don't need the full agent workflow to use the scorer — point it at any PRD:

```bash
python3 scripts/prd_benchmark.py path/to/your-prd.md --category agent
python3 scripts/prd_benchmark.py path/to/your-prd.md --category agent --json   # for CI
```

Exit code is `0` if the score clears `--threshold` (default 80), `1` otherwise — so it can gate a PR that touches `docs/prd/` in CI, not just be a manual check.

Re-run the sanity suite any time you edit the rubric in `scripts/prd_benchmark.py`:

```bash
python3 tests/test_benchmark.py
```

## Why the categories matter

An AI SaaS product isn't one shape of thing. A support-triage agent that can autonomously re-route tickets needs an explicit autonomy boundary and a unit-economics section; a small "smart search ranking" tweak embedded in an existing product needs neither, but does need a feature-flag/fallback story. The skill classifies the product first (`references/product-categories.md`) so the benchmark and the template only hold the PRD to standards that actually apply to what's being built — see the `--category` flag above.
