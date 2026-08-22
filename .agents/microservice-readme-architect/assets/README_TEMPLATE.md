# 🧩 [Insert Service Name]

> [Insert one-line tagline — the single specific job this service does, in one breath. Not the platform's tagline — this service's.]

![Version](https://img.shields.io/badge/version-[Insert%20SemVer%2C%20e.g.%201.4.0]-blue)
![Status](https://img.shields.io/badge/status-[Insert%20Production%20%7C%20Beta%20%7C%20Development]-brightgreen)
![Runtime](https://img.shields.io/badge/runtime-[Insert%20e.g.%20Node%2020%20%2B%20TS%205]-informational)

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
[Insert 2-3 sentences describing the single, specific job this microservice performs. Describe only this service's slice — if the description could apply to the whole platform, it's not specific enough yet.]

### Why this is its own microservice (not part of a monolith)
> Every service here has to earn its independence. "Because microservices are the standard" is not an answer — name the actual pressure.

- **Bounded context:** [Insert the specific business capability this service owns exclusively — no other service is allowed to make this decision or own this data.]
- **Independent scaling need:** [Insert why this workload's scaling profile genuinely differs from the rest of the system — name the other service(s) it differs from.]
- **Independent deployability:** [Insert why this needs its own release cadence — e.g. it iterates daily while a neighboring service is stable for months at a time.]
- **Failure isolation:** [Insert what breaks — and, just as importantly, what stays up — if this service goes down.]
- **Data isolation strategy:** [Insert: Database-per-service (default) / Shared read replica (temporary, with a migration-away plan) / Event-carried state transfer — and the reason this service needs its own data boundary rather than sharing one.]

### The "User" of this service
> Define who calls this service. "The frontend" is not specific enough — name the actual caller and how it calls.

| Caller | Call type | Why it calls this service |
|---|---|---|
| [Insert caller, e.g. API Gateway / BFF] | [Insert: Sync REST / Sync gRPC] | [Insert reason] |
| [Insert caller, e.g. another named service] | [Insert: Async event / Queue message] | [Insert reason] |
| [Insert caller, e.g. end-user client] | [Insert: Direct / Indirect via gateway] | [Insert reason] |

---

## 🚧 Built Features & Current State

### Current state
| Field | Value |
|---|---|
| **Status** | [Insert: 🟢 Production / 🟡 Beta / 🔴 Development] |
| **Version** | [Insert SemVer, e.g. v1.4.0] |
| **Last deployed** | [Insert date] |
| **Owner(s)** | [Insert team or individual] |
| **Known technical debt** | [Insert an honest, specific debt item — not "none." If there's genuinely none, say what would have to change for that to stop being true.] |

### Features built (working today)
> List only what actually runs right now. Planned work goes in the changelog/roadmap, not here.

- `[Insert METHOD] [Insert /endpoint]` — [Insert what it does] — [Insert: ✅ done / 🚧 partial]
- `[Insert METHOD] [Insert /endpoint]` — [Insert what it does] — [Insert status]
- [Insert background job/consumer, e.g. "Consumes `[event.name]` → [does X] → emits `[event.name]`"]

### How it was built
- **Language/runtime:** [Insert, e.g. Node.js 20 + TypeScript 5]
- **Framework:** [Insert, e.g. Express / Fastify / NestJS]
- **Design patterns used:**
  - [Insert pattern] — [Insert the specific reason this pattern earns its place here, not a textbook definition]
  - [Insert pattern] — [Insert reason]
- **Key libraries:** [Insert, e.g. Zod for schema validation, Mongoose for MongoDB access, amqplib for RabbitMQ]

---

## 🏗️ Architecture & Design Patterns

[Insert a short paragraph on the internal shape of the service — layering convention (controller → service → repository), state machine, or event flow, whichever applies.]

```
[Insert folder structure or a link to a diagram, e.g.:
src/
├── controllers/
├── services/
├── repositories/
├── models/
├── events/       (producers + consumers)
└── config/
]
```

---

## ⚙️ Usage & Setup

### Environment variables
> Keys and fake example values only. Never a real secret, connection string, or token.

| Key | Required | Description | Example (fake) |
|---|---|---|---|
| `PORT` | ✅ | Port the service listens on | `4001` |
| `[Insert KEY]` | [Insert ✅/❌] | [Insert description] | `[Insert obviously-fake example]` |
| `[Insert KEY]` | [Insert ✅/❌] | [Insert description] | `[Insert obviously-fake example]` |

### Run locally
```bash
# 1. Install dependencies
[Insert exact command, e.g. npm install]

# 2. Configure environment
cp .env.example .env

# 3. Start in dev mode
[Insert exact command, e.g. npm run dev]

# 4. Run tests
[Insert exact command, e.g. npm test]
```

### Run via Docker / Skaffold
```bash
[Insert exact commands, e.g.:
docker build -t [service-name]:local .
skaffold dev -f skaffold.yaml]
```

---

## 🔌 Communication & Contracts

### Synchronous (REST/gRPC)
| Direction | Protocol | Endpoint / method | Counterpart |
|---|---|---|---|
| Inbound | [Insert] | [Insert] | [Insert who calls it] |
| Outbound | [Insert] | [Insert] | [Insert what it calls] |

### Asynchronous (event/queue)
| Event | Direction | Broker / topic | Payload schema ref |
|---|---|---|---|
| `[Insert event.name]` | Produces | [Insert, e.g. RabbitMQ `service.events`] | [Insert link/file] |
| `[Insert event.name]` | Consumes | [Insert] | [Insert] |

### Contract source of truth
[Insert: OpenAPI spec path / Postman collection link / proto file path — wherever the contract is actually defined, not just described here.]

---

## 🛡️ Production Readiness

### Health & observability
- **Liveness:** `GET /healthz` — [Insert what it checks]
- **Readiness:** `GET /ready` — [Insert what it checks, e.g. DB connection + queue connection]
- **Graceful shutdown:** [Insert: e.g. SIGTERM handling drains in-flight requests over Xs before exit]
- **Structured logging:** [Insert: Winston/Pino — fields logged, e.g. requestId, serviceName, traceId]
- **Tracing:** [Insert: OpenTelemetry exporter target]
- **Metrics:** [Insert: Prometheus endpoint, e.g. `/metrics`]

### Security & compliance
- **AuthN/AuthZ:** [Insert JWT verification strategy, token issuer, refresh handling]
- **CORS policy:** [Insert allowed-origin strategy]
- **Rate limiting:** [Insert strategy and library]
- **Hardening:** [Insert Helmet config notes / input validation library]
- **Secrets management:** [Insert: K8s Secrets / Vault / AWS Secrets Manager — never raw in the repo]

### CI/CD & deployment
- **Container:** [Insert Dockerfile path / base image]
- **Orchestration:** [Insert K8s namespace, Deployment name, Skaffold profile or Helm chart]
- **Pipeline:** [Insert CI workflow file and stages, e.g. lint → test → build → push → deploy]
- **Rollback strategy:** [Insert]

---

## 📝 Changelog & Migration State
> SemVer discipline: a break to the public contract (REST shape, event payload, gRPC message) is always MAJOR, regardless of how small the internal diff was.

| Version | Date | Change | Migration notes |
|---|---|---|---|
| `[Insert vX.X.X]` | [Insert date] | [Insert change] | [Insert: none / requires backfill script / requires consumer update] |

---

## 🤝 Ownership
- **Maintainer(s):** [Insert]
- **Escalation:** [Insert Slack channel / on-call rotation]
