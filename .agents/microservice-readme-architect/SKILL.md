---
name: microservice-readme-architect
description: Generate and audit README.md documentation for individual microservices inside a distributed/MERN architecture (e.g. a system split into 7+ services on Kubernetes/EKS). Use whenever asked to write, create, fill out, review, or standardize a README for a microservice, backend service, API service, or one component of a larger distributed system - even if the user just says "document this service" or hands over a folder of several services. Produces a production-grade template covering the service's bounded-context justification ("the why"), who calls it, built features vs. current state, design patterns used, env vars, run commands, health checks, security, CI/CD, and changelog/SemVer. Also bundles a zero-dependency validator script (scripts/validate_readme.js) that scores a filled-in README against the standard and flags leftover placeholders, missing sections, or accidentally-committed secrets - run it after every fill, before telling the user the doc is done.
---

# Microservice README Architect

## What this skill does

Generates and audits `README.md` files for individual microservices that live inside a larger distributed system — the common case being a MERN/Node+TypeScript backend split into several services (7 is the running example throughout this skill, but the framework holds for any N). The template forces every service to justify its own existence, name its actual caller, separate what's built from what's planned, and document itself to a production-grade standard (health checks, security posture, CI/CD). A bundled Node script then grades any filled-in README against that standard, so drift across a growing set of services gets caught mechanically instead of by a human skimming seven documents and hoping to notice inconsistencies.

## When to use this

Use whenever asked to write, generate, fill, review, or standardize documentation for a microservice, backend service, or API service — or when handed a repo/folder containing several services and asked to "document these consistently." That second case is exactly the multi-service consistency problem this skill exists to solve. A README for a genuinely standalone single-repo app (no sibling services, no "why not a monolith" question) is a lighter case — this skill still applies, but its heavier sections (bounded-context justification, cross-service contracts) can be trimmed to a line or two rather than forced.

## Bundled resources

| File | Purpose | Read/use it... |
|---|---|---|
| `assets/README_TEMPLATE.md` | The blank template (Part 1) | Copy into the service's repo root as `README.md`. Every `[Insert ...]` placeholder must be replaced — none should ship. |
| `assets/EXAMPLE_FILLED_README.md` | A fully filled worked example (a RabbitMQ-backed notification service) | When it's unclear how much detail a section wants, or to show the user what "done" looks like. It's written to pass the validator at 100%. |
| `references/execution-guide.md` | The full playbook (Part 2): fill order across N services, the "why a separate service" decision framework, data-isolation strategy, the design-pattern glossary, naming conventions, and SemVer rules | Before starting a multi-service documentation pass — not just when stuck. |
| `scripts/validate_readme.js` | Zero-dependency Node script that scores a filled README against the standard | After every fill. Also accepts a directory to check a whole service set at once — run `node scripts/validate_readme.js --help` for flags. |

## Workflow

1. **Gather the facts before writing prose.** Don't invent the "why," the caller, or the endpoint list. Pull them from the service's actual code (routes/controllers, `package.json`, `.env.example`, Dockerfile/Skaffold manifests, existing OpenAPI/proto files) or ask the user directly. If something genuinely isn't decided yet — versioning hasn't started, there's no health check today — write that honestly. A confident-sounding guess is worse than an admitted gap, because the next engineer will trust the document.
2. **If this is one of several services**, read `references/execution-guide.md` first and build the Service Inventory Matrix it describes before touching any individual README. The "why" and "who calls this" sections are claims made *relative to the other services* — they only hold up once the whole set is visible at once. Writing seven READMEs top-to-bottom, one at a time, hides contradictions (two services quietly claiming the same responsibility, three different casing conventions for the same kind of event) that jump out immediately when the same section is drafted for all seven side by side.
3. Copy `assets/README_TEMPLATE.md` to the service's `README.md` and fill it in, using `assets/EXAMPLE_FILLED_README.md` to calibrate depth and tone.
4. Run the validator: `node scripts/validate_readme.js <path-to-README.md>` (or point it at a directory to check every service's README at once). Fix anything flagged. A README with leftover `[Insert ...]` markers or a leaked-looking secret is not done regardless of how complete the prose reads — treat those two as hard blockers, everything else as a quality signal to weigh.
5. Report the validator's score to the user rather than declaring the doc finished unilaterally. A clean structural score means nothing required is missing — it says nothing about whether the content is *true*, which only the person who owns the service can confirm.

## Non-negotiable principles

These are the parts most likely to get phoned in, because they're the parts that take actual thought rather than boilerplate:

- **The "why" must be specific to this service, not a copy-pasted microservices sermon.** "Enables independent scaling" isn't an answer by itself — independent scaling of *what workload*, compared to *which other service's* load profile? If there's no honest, specific pressure to name, say that plainly in the doc rather than papering over the gap with generic language. A visible gap is more useful to the next reader than a fabricated justification.
- **"Current State" reports what's actually running, not the roadmap.** A feature belongs under "Built Features" only if it works today. Planned or partial work belongs in the changelog/roadmap area, clearly separated — never blended into the same list as if both were equally real.
- **The env var table lists keys and obviously-fake example values only — never a real secret, connection string, or token**, even if the user pastes real credentials in for convenience. Strip them and substitute a clearly-fake stand-in before they end up in a committed file.
- **Health checks, structured logging, and graceful shutdown aren't optional flourishes in this template.** If a service genuinely lacks them, that's a real gap worth surfacing to the user directly — not something to paper over with a section that merely looks filled in.

## Consistency across N services

A 7-service documentation set fails in a specific, recognizable way: every README reads fine in isolation, but the set contradicts itself when read together — two services both implicitly claim ownership of the same data, event names use three different naming conventions, one service's stated "why" quietly implies the others shouldn't exist. `references/execution-guide.md` has the fill order and naming conventions that prevent this. Use them rather than drafting each service's document as an isolated task.
