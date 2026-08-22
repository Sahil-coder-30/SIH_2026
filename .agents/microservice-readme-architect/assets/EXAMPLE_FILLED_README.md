# 🧩 Notification Service

> Turns internal events from other services into delivered transactional emails — nothing else.

![Version](https://img.shields.io/badge/version-1.4.0-blue)
![Status](https://img.shields.io/badge/status-Beta-yellow)
![Runtime](https://img.shields.io/badge/runtime-Node%2020%20%2B%20TS%205-informational)

---

## 📖 Table of Contents
- [Overview & The "Why"](#-overview--the-why)
- [Built Features & Current State](#-built-features--current-state)
- [Architecture & Design Patterns](#-architecture--design-patterns)
- [Usage & Setup](#-usage--setup)
- [Communication & Contracts](#-communication--contracts)
- [Production Readiness](#-production-readiness)
- [Changelog & Migration State](#-changelog--migration-state)

---

## 🎯 Overview & The "Why"

### What this service does
Consumes domain events published by other services (user registration, agent escalations, execution failures) and turns each into a rendered, delivered transactional email. It owns nothing about *why* an email should be sent — only *how* to render and deliver one once told to.

### Why this is its own microservice (not part of a monolith)
- **Bounded context:** Email template rendering and SMTP delivery. No other service is allowed to talk to the SMTP provider directly — this is the only service with those credentials.
- **Independent scaling need:** SMTP delivery is I/O-bound and rate-limited by the provider (bursts during registration waves), which is a completely different scaling shape than the CPU-bound agent-orchestration service it sits next to. Scaling that service up to handle an LLM-heavy workload would do nothing for email throughput and vice versa.
- **Independent deployability:** Email template copy changes weekly (marketing/product tweaks wording); the services producing the underlying events change on a much slower, feature-driven cadence. Coupling the two would mean a copy typo forces a redeploy of the agent service.
- **Failure isolation:** If this service is down, queued events simply back up in RabbitMQ and are delivered once it recovers — no other service's request path depends on it synchronously, so nothing else degrades.
- **Data isolation strategy:** Database-per-service is not even needed here — this service is intentionally stateless beyond an idempotency-key cache (Redis, 24h TTL) used to dedupe redelivered messages. It never reads another service's database, and no other service reads its cache.

### The "User" of this service
| Caller | Call type | Why it calls this service |
|---|---|---|
| Auth Service | Async event (RabbitMQ) | Publishes `auth.user.registered` and `auth.password.reset_requested` — needs a welcome/reset email sent without waiting on delivery. |
| Orion Agent Service | Async event (RabbitMQ) | Publishes `agent.plan.escalated` when a human review gate fires — needs the reviewer notified. |
| Internal ops (human) | Sync REST (internal only, not public) | `POST /internal/test-send` lets an engineer trigger a one-off test email during template QA. |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | 🟡 Beta |
| **Version** | v1.4.0 |
| **Last deployed** | 2026-07-14 |
| **Owner(s)** | Platform team, on-call: notifications-oncall |
| **Known technical debt** | No outbox pattern on the producer side (that's the *other* services' responsibility, not this one) — but on this side, retry backoff is fixed (5 attempts, 2s apart) rather than exponential, so a prolonged SMTP outage still drops messages to the dead-letter queue faster than it should. Tracked, not yet fixed. |

### Features built (working today)
- `POST /internal/test-send` — sends a one-off test email using any registered template — ✅ done
- `GET /healthz`, `GET /ready` — ✅ done
- Consumes `auth.user.registered` → renders welcome email → sends via SMTP — ✅ done
- Consumes `auth.password.reset_requested` → renders reset-link email → sends — ✅ done
- Consumes `agent.plan.escalated` → renders reviewer-notification email → sends — ✅ done
- Consumes `agent.execution.failed` → renders failure-digest email → sends — 🚧 partial (digest batching not yet implemented; currently sends one email per failure, which is noisy under bulk failures)

### How it was built
- **Language/runtime:** Node.js 20 + TypeScript 5
- **Framework:** Express (only for the two internal HTTP routes — the bulk of the service is a queue consumer, not an HTTP server)
- **Design patterns used:**
  - **Strategy pattern** for template selection — each of the four action types maps to a template-building function behind a shared interface, so adding a fifth event type never touches the consumer's dispatch logic.
  - **Repository pattern** — the idempotency-key store is accessed only through a thin `DedupeStore` interface, so swapping Redis for something else later doesn't touch business logic.
  - **Dependency injection** (manual constructor injection, no DI framework — the object graph is small enough not to need one) — the SMTP transport is injected, which is what makes template QA testable without a real mail server.
- **Key libraries:** `amqplib` (RabbitMQ), `nodemailer` (SMTP delivery), `zod` (event payload validation before it's trusted), `pino` (structured logs)

---

## 🏗️ Architecture & Design Patterns

Consumer-first layout: the RabbitMQ consumer is the entry point, not an HTTP router. Each event type is validated against its Zod schema before any template logic runs — a malformed message is nacked to the dead-letter queue rather than crashing the consumer.

```
src/
├── consumers/       (one file per event type, thin — delegates to templates/ and mailer/)
├── templates/       (buildWelcomeEmail, buildResetEmail, buildEscalationEmail, buildFailureEmail)
├── mailer/          (SMTP transport wrapper, injected)
├── dedupe/          (Redis-backed idempotency-key store)
├── http/            (the two internal routes: test-send, healthz/ready)
└── config/
```

---

## ⚙️ Usage & Setup

### Environment variables
| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port for the internal HTTP routes | `4006` |
| `RABBITMQ_URL` | ✅ | AMQP connection string | `amqp://guest:guest@localhost:5672` |
| `SMTP_HOST` | ✅ | SMTP relay host | `smtp.example-provider.com` |
| `SMTP_PORT` | ✅ | SMTP relay port | `587` |
| `SMTP_USER` | ✅ | SMTP auth username | `notifications@example.com` |
| `SMTP_PASSWORD` | ✅ | SMTP auth password — pull from the secrets manager, never commit a real value | `REPLACE_WITH_VAULT_SECRET` |
| `REDIS_URL` | ✅ | Idempotency-key store | `redis://localhost:6379` |
| `LOG_LEVEL` | ❌ | Pino log level, defaults to `info` | `debug` |

### Run locally
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start in dev mode
npm run dev

# 4. Run tests
npm test
```

### Run via Docker / Skaffold
```bash
docker build -t notification-service:local .
skaffold dev -f skaffold.yaml
```

---

## 🔌 Communication & Contracts

### Synchronous (REST/gRPC)
| Direction | Protocol | Endpoint / method | Counterpart |
|---|---|---|---|
| Inbound | REST (internal only) | `POST /internal/test-send` | Engineers, during template QA |
| Inbound | REST | `GET /healthz`, `GET /ready` | Kubernetes kubelet |

### Asynchronous (event/queue)
| Event | Direction | Broker / topic | Payload schema ref |
|---|---|---|---|
| `auth.user.registered` | Consumes | RabbitMQ `notifications.inbound` | `src/consumers/schemas/authUserRegistered.ts` |
| `auth.password.reset_requested` | Consumes | RabbitMQ `notifications.inbound` | `src/consumers/schemas/passwordResetRequested.ts` |
| `agent.plan.escalated` | Consumes | RabbitMQ `notifications.inbound` | `src/consumers/schemas/planEscalated.ts` |
| `agent.execution.failed` | Consumes | RabbitMQ `notifications.inbound` | `src/consumers/schemas/executionFailed.ts` |
| `notification.email.failed` | Produces | RabbitMQ `notifications.outbound` (observability only, no consumer depends on it yet) | `src/events/schemas/emailFailed.ts` |

### Contract source of truth
Event payload schemas live as Zod schemas under `src/consumers/schemas/` and `src/events/schemas/` — these are the enforced contract, not this document.

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** `GET /healthz` — process is up and the event loop isn't blocked
- **Readiness:** `GET /ready` — RabbitMQ channel open AND Redis reachable AND SMTP transport verified
- **Graceful shutdown:** on SIGTERM, stops consuming new messages, finishes in-flight sends (10s budget), then closes the AMQP channel and exits
- **Structured logging:** Pino — every log line carries `service`, `eventType`, `messageId`, `traceId`
- **Tracing:** OpenTelemetry, exported to the shared Tempo instance
- **Metrics:** `/metrics` (Prometheus) — emails sent/failed by template, queue lag

### Security & compliance
- **AuthN/AuthZ:** `/internal/test-send` requires a service-to-service JWT signed by the internal auth issuer — not reachable outside the cluster network
- **CORS policy:** N/A — no browser ever calls this service directly
- **Rate limiting:** none on the internal HTTP routes (trusted network only); outbound SMTP send rate is throttled client-side to stay under the provider's per-minute cap
- **Hardening:** Helmet defaults on the Express app; all event payloads validated against Zod schemas before any template logic touches them
- **Secrets management:** SMTP credentials and the JWT verification key are pulled from Kubernetes Secrets at startup, never baked into the image

### CI/CD & deployment
- **Container:** `Dockerfile` at repo root, multi-stage, `node:20-alpine` base
- **Orchestration:** K8s namespace `platform`, Deployment `notification-service`, Skaffold profile `notification-service-dev`
- **Pipeline:** GitHub Actions — `lint → test → build → push → deploy-to-staging`; production deploy is a manual promotion of the same image
- **Rollback strategy:** previous image tag redeployed via `kubectl rollout undo`; no DB migrations to reverse since the service is stateless

---

## 📝 Changelog & Migration State

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `v1.4.0` | 2026-07-14 | Added `agent.execution.failed` consumer | None — additive, backward-compatible |
| `v1.3.0` | 2026-06-28 | Added `agent.plan.escalated` consumer | None |
| `v1.1.0` | 2026-06-10 | Added Redis-backed idempotency dedupe | None — internal only, no contract change |
| `v1.0.0` | 2026-05-30 | Initial release: `auth.user.registered` + `auth.password.reset_requested` consumers | Initial release |

---

## 🤝 Ownership
- **Maintainer(s):** Platform team
- **Escalation:** `#notifications-oncall` on Slack
