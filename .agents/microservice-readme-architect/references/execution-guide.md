# Execution Guide — Documenting N Microservices Consistently

This is the playbook for filling out `assets/README_TEMPLATE.md` across a set of services (7, in the running example) without the set contradicting itself. Read this before starting a multi-service documentation pass.

## Table of Contents
1. [Phase 0 — Build the Service Inventory Matrix first](#phase-0--build-the-service-inventory-matrix-first)
2. [Phase 1 — Fill section-by-section across all N, not service-by-service](#phase-1--fill-section-by-section-across-all-n-not-service-by-service)
3. [Decision framework A — Why does this deserve its own microservice?](#decision-framework-a--why-does-this-deserve-its-own-microservice)
4. [Decision framework B — Choosing a data isolation strategy](#decision-framework-b--choosing-a-data-isolation-strategy)
5. [Decision framework C — Who is "the User"?](#decision-framework-c--who-is-the-user)
6. [Design pattern glossary](#design-pattern-glossary)
7. [Naming conventions](#naming-conventions)
8. [SemVer rules for microservices](#semver-rules-for-microservices)
9. [Team consistency checklist](#team-consistency-checklist)
10. [Common anti-patterns to avoid](#common-anti-patterns-to-avoid)

---

## Phase 0 — Build the Service Inventory Matrix first

Before writing a single README, build one shared table listing every service in the system. This is a working document for the team, not something that ships inside any individual README.

| Service | Bounded Context (one line) | Primary Datastore | Sync Role (who it serves over REST/gRPC) | Async Role (produces / consumes) | Current Status |
|---|---|---|---|---|---|
| [Insert] | [Insert] | [Insert] | [Insert] | [Insert] | [Insert] |
| ...one row per service... | | | | | |

**Why this comes first:** the "Why" and "User" sections of every individual README are relational claims — "this service scales independently of X" only means something if X is named and real, and "this service owns this data" only means something if you can confirm no other row in the table claims the same thing. Skipping this step and writing README 1 through 7 in isolation is how two services end up with a silent, undocumented claim to the same responsibility.

## Phase 1 — Fill section-by-section across all N, not service-by-service

Draft the same section for every service in one sitting, then move to the next section — rather than writing one service's README top-to-bottom before starting the next.

**Why:** writing all N "Why" sections back to back forces a direct comparison of bounded contexts in the same sitting, which is exactly when contradictions surface. Writing README top-to-bottom per service hides this — by the time you reach service #5's "Why," the exact phrasing used for service #2 has faded, and near-duplicate justifications slip through unnoticed.

Suggested round order:
1. **Overview & Why** — all N. This is where copy-paste boilerplate is most tempting and most damaging; comparing all N side by side is the main defense against it.
2. **The "User" table** — all N, immediately after Why (they're answering related questions).
3. **Built Features & Current State** — all N.
4. **Architecture & Design Patterns** — all N.
5. **Usage & Setup** — all N.
6. **Communication & Contracts** — all N, done together deliberately: event and endpoint naming has to agree across every producer/consumer pair, and that's only checkable if you're looking at all the contracts at once.
7. **Production Readiness** — all N.
8. **Changelog** — all N.

## Decision framework A — Why does this deserve its own microservice?

Run each service through these tests. If a service fails most of them, the honest answer might be "this belongs inside another service as a module, not as its own microservice" — write that conclusion into the doc rather than force a justification that doesn't hold up.

| Test | Question to answer |
|---|---|
| **Bounded context** | Is there one specific business capability this service — and only this service — owns and decides about? |
| **Scaling asymmetry** | Does this workload's resource profile (CPU-bound, I/O-bound, bursty, steady) genuinely differ from its neighbors, such that scaling them together would waste resources or under-provision one of them? |
| **Deploy cadence** | Does this change on a meaningfully different schedule than the services around it — fast-iterating vs. stable — such that coupling deploys would slow one of them down? |
| **Team/ownership** | Is there a specific team or person who owns this and only this, with a different on-call rotation or release process than its neighbors? |
| **Blast radius** | If this service goes down, does something meaningfully continue working that wouldn't if this were a module inside a bigger service? |
| **Data shape** | Does this service's data access pattern (append-only log, high-write cache, relational transaction) genuinely differ from its neighbors' in a way that justifies a separate store? |

## Decision framework B — Choosing a data isolation strategy

- **Database-per-service (default, recommended):** each service owns its schema exclusively; no other service ever opens a direct connection to it. Cross-service reads happen through the owning service's API or its emitted events — never a shared connection string. This is the default because it's the only strategy that actually delivers the "independent deployability" claimed in Framework A; a shared schema means every migration is a cross-team negotiation.
- **Shared database (anti-pattern — but sometimes real):** acceptable only as a temporary bridge during a monolith-to-microservices migration. If a service genuinely has this today, document it honestly under "Known technical debt" along with a concrete plan (and ideally a date) to break the coupling — an undocumented shared database becomes a permanent one.
- **Event-carried state transfer / CQRS read projection:** when a service needs a local, read-only copy of another service's data to avoid a synchronous call on its hot path, it subscribes to that owner's events and maintains its own projection. This is a legitimate way to get "database-per-service" isolation while still having fast local reads — document it as a projection, not as shared ownership.

**Standing rule regardless of strategy:** cross-service reads only through the owning service's API or its emitted events, never a direct database connection into another service's store. This belongs in the system-wide architecture notes, not repeated as a per-service decision.

## Decision framework C — Who is "the User"?

Work through this in order for each caller of the service:

1. Does a human's browser or app call this service directly? → **End consumer.** (Rare for an internal microservice — usually means this service is itself gateway-adjacent.)
2. Does an API Gateway / BFF aggregate this service's response for a frontend? → **Gateway/BFF.**
3. Does another named internal service call this synchronously (REST/gRPC) as part of its own request path? → **Internal service (sync)** — name the specific service, not "other services."
4. Does this service only react to messages, with no caller waiting on a response? → **Event producer (async)** — name the specific service that publishes the event, not "the queue." The queue is the transport; the producer is the actual caller whose behavior this service depends on.

A service commonly has more than one row in its User table — that's expected and should be shown as a table (see the template), not collapsed into a single vague sentence.

## Design pattern glossary

Short, practical definitions — "use it when," not textbook theory. Only name a pattern in a README's "How it was built" section if it's genuinely present in the code; naming patterns that aren't actually there is worse than naming none.

- **Repository pattern** — isolate the ORM/query layer behind an interface. Use it when you want business logic to be testable without a real database, or expect to swap the underlying store later.
- **CQRS (Command Query Responsibility Segregation)** — separate the write path (commands, validated and consistency-checked) from the read path (optimized projections). Use it when read and write load have very different shapes or scaling needs — not by default, since it adds real complexity.
- **Event sourcing** — persist state as an append-only log of events rather than a current-state row, deriving current state by replay. Use it when an audit trail of *how* something reached its current state matters as much as the current state itself.
- **Outbox pattern** — write the domain change and the "event to publish" in the same local transaction, then a separate relay process publishes from that outbox. Use it whenever a service both writes to its own database *and* publishes an event about that write — without it, a crash between the commit and the publish silently drops the event.
- **Saga / choreography** — coordinate a transaction that spans multiple services without a distributed 2-phase commit, either via a central orchestrator (saga) or via each service reacting to the previous one's event (choreography). Use it whenever a single business operation touches more than one service's data.
- **Circuit breaker** — stop calling a downstream dependency for a cooldown period after it starts failing, instead of retrying into a service that's already struggling. Use it for any synchronous call to a service that isn't guaranteed to be healthy.
- **Dependency injection** — pass in implementations (a mailer, a DB client, an LLM provider) rather than constructing them inline. Use it when you expect to swap an implementation later (e.g. for tests, or to change providers) without touching the logic that uses it. Note in the README whether this is done via a framework (tsyringe, InversifyJS) or plain constructor injection — both count, and a small service often doesn't need the framework.

## Naming conventions

Apply these identically across every service so the Communication & Contracts round (Phase 1, step 6) actually converges instead of drifting:

- **Event naming:** `<owning-service>.<entity>.<past-tense-verb>` — e.g. `auth-service.user.registered`. Name the event after its owner/producer, never after a specific consumer (a new consumer shouldn't require renaming the event).
- **REST endpoint naming:** resource-based, plural nouns, versioned prefix for any contract another team depends on: `/api/v1/<resource>`.
- **Shared environment variables:** when a value is genuinely shared across services (e.g. a JWT signing key every service must verify against), use the identical variable name, byte-for-byte, in every service's env table — a variant name is how one service silently ends up misconfigured.

## SemVer rules for microservices

Version the *contract*, not the implementation:

- **MAJOR** — any change that breaks an existing consumer: a REST response shape change, an event payload schema change, a removed field. This applies even if the internal code change was small.
- **MINOR** — additive and backward-compatible: a new endpoint, a new optional field, a new event type nobody is forced to consume yet.
- **PATCH** — internal-only fix with zero contract change.
- A total internal rewrite that preserves the exact same API/event surface can stay on the same MINOR/PATCH track — the version number describes what callers can rely on, not how much code moved.

## Team consistency checklist

Run this across the full set before treating the documentation as done:

- [ ] Every service's "Why" names a concrete, specific pressure — none of them read as interchangeable with another service's
- [ ] No two services' Bounded Context lines claim the same responsibility
- [ ] Event names across every service follow the same `<owner>.<entity>.<verb>` convention
- [ ] No real secrets, connection strings, or tokens anywhere in any env var table
- [ ] `node scripts/validate_readme.js <services-directory>` returns a passing score for every service
- [ ] The set of section headers matches across all services (the validator's directory mode checks this automatically)

## Common anti-patterns to avoid

- **The "why" paragraph reads nearly identical across multiple services** — a strong sign it was adapted from a template rather than reasoned through for this specific service.
- **"Built Features" describes the whole platform's vision instead of this one service's actual working endpoints** — scope creep in the doc usually mirrors scope confusion in the service itself.
- **A shared database "for now" with no migration-away plan or date** — undocumented, this becomes permanent.
- **Real credentials pasted into an env var table "just for local dev convenience"** — strip them before the file is ever committed, not after.
- **A README that hasn't been touched since a breaking contract change shipped** — the changelog is the first place staleness becomes visible to the next reader.

---

See `assets/EXAMPLE_FILLED_README.md` for a complete worked example built to this standard, and `scripts/validate_readme.js` to check any README (or a whole directory of them) against it mechanically.
