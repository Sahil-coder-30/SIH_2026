# Kubernetes & Skaffold YAML Guide — Taksha Codespace Platform

> **Purpose**: This document is the canonical reference for any coding agent (or future developer) that needs to add a new microservice to this project.  
> Every pattern, naming convention, resource value, probe path, and Skaffold sync rule documented here was **hand-tuned and finalised** by the project owner after real debugging sessions.  
> **Never improvise — replicate what is here.**

---

## 1. Project Architecture Overview

### Generic Monorepo Template
```
<Project>/                       ← Monorepo root
├── skaffold.yml                 ← Single Skaffold config for ALL services
├── k8s/                         ← ALL Kubernetes manifests live here (flat, no subdirs)
│   ├── <service>.deployment.yml
│   ├── <service>.service.yml
│   ├── ingress.yml              ← ONE shared ingress (never per-service)
│   ├── secrets.yml              ← ALL secrets in one file (multi-doc YAML with ---)
│   └── secrets.yml.example      ← Safe-to-commit template with placeholder values
├── <Service>/
│   └── dockerfile               ← lowercase "dockerfile" (not "Dockerfile")
└── ...
```

### This Project — ATC Voice Simulator
```
ATC/                             ← Monorepo root
├── skaffold.yml
├── k8s/
│   ├── auth.deployment.yml
│   ├── auth.service.yml
│   ├── ai.deployment.yml
│   ├── ai.service.yml
│   ├── backend.deployment.yml
│   ├── backend.service.yml
│   ├── ingress.yml
│   ├── secrets.yml              ← gitignored, fill real values locally
│   └── secrets.yml.example     ← committed, safe placeholder template
├── Auth/
│   └── dockerfile               ← port 3000
├── Ai-service/
│   └── dockerfile               ← port 3000
└── Backend/
    └── dockerfile               ← port 4000
```

**Key rules from this structure:**
- All `k8s/` manifests are flat — no subdirectories.
- Dockerfile is **always lowercase** (`dockerfile`), never `Dockerfile`.
- One `skaffold.yml` at the root manages every service.
- One `k8s/ingress.yml` routes all services — never create a per-service ingress.
- One `k8s/secrets.yml` holds all secrets as multi-document YAML separated by `---`.
- `secrets.yml` is in `.gitignore` — commit only `secrets.yml.example` with placeholders.

---

## 2. Dockerfile Pattern (All Services)

Every service uses **exactly** this Dockerfile structure. No multi-stage build, no `npm ci`, no `--production` flag. Simple and predictable for local development with Skaffold hot-reload.

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE <PORT>

CMD ["npm" , "run" , "dev"]
```

| Service            | Port | Context path           |
|--------------------|------|------------------------|
| auth               | 3000 | `Auth/`                |
| ai-orchestration   | 3000 | `Ai_orchestration/`    |
| notification       | 4000 | `Notification/`        |
| payments           | 5051 | `Payments/`            |
| sandbox (server)   | 3000 | `Sandbox/server/`      |
| router             | 3000 | `Sandbox/router/`      |
| agent              | —    | `Sandbox/Agent/`       |
| template           | —    | `Sandbox/template/`    |
| sync-agent         | —    | `Sandbox/sync-agent/`  |

**Rules:**
- Base image: always `node:20-alpine`.
- `WORKDIR` is always `/app`.
- `COPY package*.json ./` first — so npm install is cached by Docker.
- `CMD` uses the `dev` npm script (nodemon / equivalent) so Skaffold file sync works.
- `ENV PORT=<PORT>` is optional but used in payments (`ENV PORT=5051`); other services rely on the k8s `env` block for PORT.

---

## 3. Skaffold Configuration (`skaffold.yml`)

### 3.1 Top-level structure

```yaml
# Comment explaining why we use Skaffold — fast iteration, no manual image rebuild
apiVersion: skaffold/v4beta2
kind: Config

build:
  tagPolicy:
    sha256: {}          # ← ALWAYS sha256, never gitCommit or dateTime
  artifacts:
    - ...               # one entry per service

manifests:
  rawYaml:
    - k8s/<file>.yml    # list every k8s file explicitly — no glob patterns
```

### 3.2 Artifact entry pattern

**Pattern A — services with a `src/` folder** (Auth, Notification, Ai_orchestration, Sandbox/server, Sandbox/Agent, Sandbox/router, Sandbox/template):

```yaml
- image: <image-name>
  context: <ServiceFolder>        # or Sandbox/<subfolder>
  docker:
    dockerfile: dockerfile        # always lowercase
  sync:
    infer:
      - "src/**"
```

**Pattern B — services with flat file structure** (Payments — no src/ folder, code is in top-level folders):

```yaml
- image: payments
  context: Payments
  docker:
    dockerfile: dockerfile
  sync:
    infer:
      - "app/**"
      - "config/**"
      - "controllers/**"
      - "middleware/**"
      - "models/**"
      - "routes/**"
      - "services/**"
      - "server.js"
      - "package.json"
```

**Pattern C — root-level JS files only** (sync-agent):

```yaml
- image: sync-agent
  context: Sandbox/sync-agent
  docker:
    dockerfile: dockerfile
  sync:
    infer:
      - "*.js"
      - "package.json"
```

### 3.3 `manifests.rawYaml` — exact ordering used in production

```yaml
manifests:
  rawYaml:
    - k8s/ai-deployment.yml
    - k8s/router-deployment.yml
    - k8s/sandbox-deployment.yml
    - k8s/ai-service.yml
    - k8s/router-service.yml
    - k8s/sandbox-service.yml
    - k8s/rabc.yml
    - k8s/ingress.yml
    - k8s/auth.deployment.yml
    - k8s/auth.service.yml
    - k8s/secrets.yml
    - k8s/notification-deployment.yml
    - k8s/notification-service.yml
    - k8s/payments.deployment.yml
    - k8s/payments.service.yml
```

> When adding a new service, append its deployment *then* service to the bottom of this list.  
> Never reorder existing entries — ordering matters for apply sequence.

### 3.4 Adding a new service to skaffold.yml

1. Add artifact block in `build.artifacts` (choose Pattern A, B, or C above).
2. Append `k8s/<newservice>.deployment.yml` then `k8s/<newservice>.service.yml` at the **bottom** of `manifests.rawYaml`.

---

## 4. Kubernetes Deployment Manifest Pattern

### 4.1 Full template

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <service>-deployment
  labels:
    app: <service>
spec:
  replicas: 1
  selector:
    matchLabels:
      app: <service>
  template:
    metadata:
      labels:
        app: <service>
    spec:
      containers:
      - name: <service>-container
        image: <image-name>
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "250m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: <PORT>
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /readyz
            port: <PORT>
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 5
        ports:
        - containerPort: <PORT>
          name: <service>-http
        env:
        - name: PORT
          value: "<PORT>"
        # ... secret refs below
```

### 4.2 Memory budget by service type

| Service type                        | Memory request | Memory limit |
|-------------------------------------|----------------|--------------|
| Standard API (auth, payments, ai)   | `128Mi`        | `256Mi`      |
| Notification (email + MQ consumer)  | `256Mi`        | `512Mi`      |
| Sandbox server (executes user code) | `256Mi`        | `400Mi`      |
| Router                              | `256Mi`        | `512Mi`      |

CPU is **always** `250m` request / `500m` limit — never change without a good reason.

### 4.3 Probe paths used per service

| Service       | Liveness path            | Readiness path          | Port |
|---------------|--------------------------|-------------------------|------|
| payments      | `/healthz`               | `/readyz`               | 5051 |
| auth          | `/healthz`               | `/readyz`               | 3000 |
| notification  | `/healthz`               | `/readyz`               | 4000 |
| ai-server     | `/api/ai/healthz`        | `/api/ai/readyz`        | 3000 |
| sandbox       | `/api/sandbox/health`    | `/api/sandbox/ready`    | 3000 |
| router        | `/api/router/health`     | `/api/router/ready`     | 3000 |

> **Pattern rule**: standard services → `/healthz` and `/readyz` at root.  
> Sandbox-ecosystem services → path-prefixed probes (`/api/<service>/health`).

### 4.4 Probe timing differences

| Service       | liveness initialDelaySeconds | readiness initialDelaySeconds |
|---------------|------------------------------|-------------------------------|
| payments      | 30                           | 15                            |
| auth          | 90                           | 30                            |
| notification  | 90                           | 30                            |
| ai-server     | 90                           | 30                            |
| sandbox       | 90                           | 30                            |
| router        | 90                           | 30                            |

> Payments gets shorter delays (30/15) — pure REST service, no startup-time connections.  
> All others default to 90/30 to account for MongoDB connection and cold npm starts.

### 4.5 imagePullPolicy

Always `IfNotPresent` — Skaffold pushes the image to the local Docker daemon; this tells k8s to use it instead of trying to pull from a remote registry.

---

## 5. Kubernetes Service Manifest Pattern

```yaml
kind: Service
apiVersion: v1
metadata:
  name: <service>-service
  labels:
    app: <service>
spec:
  selector:
    app: <service>           # must match Deployment pod label
  type: ClusterIP            # ALWAYS ClusterIP — never NodePort or LoadBalancer
  ports:
  - name: <service>-http    # or a descriptive name like "ntfy-port"
    port: 80                 # cluster-internal port is ALWAYS 80
    targetPort: <container-port>
```

**Rules:**
- Every service exposes port **80** internally — inter-service calls use `http://<service>-service` with no port needed.
- `targetPort` is the container port your Node.js app listens on.
- Type is always `ClusterIP` — the nginx ingress handles external exposure.

---

## 6. Environment Variables & Secret Refs

### 6.1 Hard-coded values (plain `value:`)

Only two kinds of things go as plain values:
1. `PORT` — the container port number as a string.
2. Internal service URLs — the pattern is always `http://<service-name>`.

```yaml
env:
- name: PORT
  value: "5051"
- name: AUTH_JWKS_URI
  value: "http://auth-service/.well-known/jwks.json"
- name: PAYMENTS_SERVICE_URL
  value: "http://payments-service"
```

> `AUTH_JWKS_URI` is injected into **every service that validates JWTs** (ai-server, payments, notification, sandbox). Use exactly this key name and value.

### 6.2 Secret ref pattern

```yaml
- name: <ENV_VAR_NAME>
  valueFrom:
    secretKeyRef:
      name: <secret-object-name>
      key: <key-inside-secret>
```

### 6.3 Secret groups (from `k8s/secrets.yml`)

| Secret `name`    | Keys it holds                                                                              | Who uses it                         |
|------------------|--------------------------------------------------------------------------------------------|-------------------------------------|
| `database`       | `AUTH`, `SANDBOX`, `AI`, `PAYMENT`, `REDIS_URI`, `MQ_URL`                                 | Every service that touches DB/MQ    |
| `jwt`            | `RSA_PRIVATE_KEY`, `JWT_REFRESH_SECRET`                                                    | auth only                           |
| `google`         | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `EMAIL_USER`, `GMAIL_APP_PASSWORD` | auth, notification   |
| `razorpay`       | `RAZORPAY_SECRET_ID`, `RAZORPAY_SECRET_KEY`, `RAZORPAY_WEBHOOK_SECRET`                    | payments only                       |
| `ai-secret`      | `MISTRALAI_API_KEY`, `GOOGLE_API_KEY`, `COHERE_API_KEY`                                   | ai-orchestration (optional: true)   |
| `other-services` | `TAVILY_API_KEY`                                                                           | ai tools                            |
| `aws-secret`     | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`             | sync-agent / S3 operations          |

### 6.4 `optional: true` — when to use it

Only AI API keys get `optional: true` because a missing key should not crash the pod:

```yaml
- name: MISTRALAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: ai-secret
      key: MISTRALAI_API_KEY
      optional: true
```

All other secret refs should **not** have `optional: true` — a missing required secret should fail fast.

---

## 7. Secrets Manifest Pattern (`k8s/secrets.yml`)

The entire file is multi-document YAML — each secret group is separated by `---`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: <group-name>
type: Opaque
stringData:
  KEY_NAME: "value"
  ANOTHER_KEY: "value"

---
apiVersion: v1
kind: Secret
metadata:
  name: <next-group>
type: Opaque
stringData:
  ...
```

**Rules:**
- Always `type: Opaque`.
- Always use `stringData:` (not `data:`) — no base64 encoding needed.
- Multi-line values (RSA keys) use YAML literal block scalar (`|`):

```yaml
stringData:
  RSA_PRIVATE_KEY: |
    -----BEGIN PRIVATE KEY-----
    MIIEv...
    -----END PRIVATE KEY-----
```

> **CRITICAL**: Never commit real secrets to git. `secrets.yml` is in `.gitignore`.  
> Use `k8s/secrets.yml.example` as a template with placeholder values.

---

## 8. Ingress Pattern (`k8s/ingress.yml`)

One shared ingress for the entire platform:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: codespace-ingress
  labels:
    app.kubernetes.io/name: codespace-ingress
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "10"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - pathType: Prefix
            path: "/api/<service>"
            backend:
              service:
                name: <service>-service
                port:
                  number: 80
```

**Special routing rules (already configured, do not change):**
- `*.preview.localhost` → `router-service:80`
- `*.agent.localhost` → `router-service:80`
- Read/send timeout: **300s** (5 minutes) — needed because LLM responses are slow.

When adding a new service, append a new `- http: paths:` block **before** the two wildcard host rules.

---

## 9. RBAC Pattern (`k8s/rabc.yml`)

Two ServiceAccount + Role + RoleBinding groups exist:

| ServiceAccount      | Purpose                                                    |
|---------------------|------------------------------------------------------------|
| `resource-manager`  | Sandbox server — can get/list/create/delete pods, services |
| `sandbox-agent-sa`  | Individual agent pods — read-only pod/log access           |

Reference in deployment:

```yaml
spec:
  serviceAccountName: resource-manager
```

Add new groups in `rabc.yml` separated by `---`.

---

## 10. Complete Worked Example — Adding a New `admin` Service

### Step 1: `Admin/dockerfile`
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 6000
CMD ["npm" , "run" , "dev"]
```

### Step 2: `k8s/admin.deployment.yml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: admin-deployment
  labels:
    app: admin
spec:
  replicas: 1
  selector:
    matchLabels:
      app: admin
  template:
    metadata:
      labels:
        app: admin
    spec:
      containers:
      - name: admin-container
        image: admin
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "250m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 6000
          initialDelaySeconds: 90
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /readyz
            port: 6000
          initialDelaySeconds: 30
          periodSeconds: 5
          timeoutSeconds: 5
        ports:
        - containerPort: 6000
          name: admin-http
        env:
        - name: PORT
          value: "6000"
        - name: MONGO_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: ADMIN
        - name: AUTH_JWKS_URI
          value: "http://auth-service/.well-known/jwks.json"
        - name: REDIS_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: REDIS_URI
```

### Step 3: `k8s/admin.service.yml`
```yaml
kind: Service
apiVersion: v1
metadata:
  name: admin-service
  labels:
    app: admin
spec:
  selector:
    app: admin
  type: ClusterIP
  ports:
  - name: admin-http
    port: 80
    targetPort: 6000
```

### Step 4: Append to `skaffold.yml`

In `build.artifacts`:
```yaml
    - image: admin
      context: Admin
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/**"
```

In `manifests.rawYaml`:
```yaml
    - k8s/admin.deployment.yml
    - k8s/admin.service.yml
```

### Step 5: Add ingress rule (before wildcard host rules)

```yaml
    - http:
        paths:
          - pathType: Prefix
            path: "/api/admin"
            backend:
              service:
                name: admin-service
                port:
                  number: 80
```

### Step 6: Add secret key to `k8s/secrets.yml`

In the `database` Secret `stringData`:
```yaml
  ADMIN: "mongodb+srv://..."
```

---

## 11. Common Mistakes — Do Not Make These

| Mistake | What to do instead |
|---------|--------------------|
| Using `Dockerfile` (capital D) | Always `dockerfile` (lowercase) |
| Using `gitCommit` or `dateTime` tagPolicy | Always `sha256: {}` |
| Using a glob like `k8s/**` in `manifests.rawYaml` | List every file explicitly |
| `type: NodePort` or `LoadBalancer` for a service | Always `ClusterIP` |
| Service internal port ≠ 80 | Internal port is always `80`; `targetPort` is the container port |
| Using `data:` in secrets (requires base64) | Always use `stringData:` with plain text |
| Creating a per-service ingress file | One `k8s/ingress.yml` for all services |
| Skipping `AUTH_JWKS_URI` env in a service with auth middleware | Every JWT-protected service needs this |
| Using `npm run start` in CMD | Use `npm run dev` so nodemon / file sync works |
| Not separating multiple Secret objects with `---` | Each Secret needs `---` separator |
| Putting `optional: true` on non-AI secret refs | Only AI API keys get `optional: true` |

---

## 12. Quick Reference — Port Map

| Service        | Container port | Cluster internal URL                   |
|----------------|---------------|----------------------------------------|
| auth           | 3000          | `http://auth-service`                  |
| ai-service     | 3000          | `http://ai-service`                    |
| backend        | 4000          | `http://backend-service`               |

All services are reachable at port `80` inside the cluster because every Service exposes `port: 80`.

---

*Finalised and preserved from production config — August 2026.*

---

## 13. ATC Project — Actual File Code

> **This section is the ground truth for the ATC Voice Simulator project.**  
> All files below exist in the repository. Use these as the canonical reference when adding a new service — copy the pattern, swap the service name.

---

### 13.1 Dockerfiles

**`Auth/dockerfile`**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm" , "run" , "dev"]
```

**`Ai-service/dockerfile`**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm" , "run" , "dev"]
```

**`Backend/dockerfile`**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm" , "run" , "dev"]
```

---

### 13.2 `skaffold.yml`

```yaml
# skaffold.yml — ATC Voice Simulator Platform
# Manages hot-reload dev builds for all microservices.
# tagPolicy: sha256 ensures consistent image IDs with Skaffold's local docker daemon.
# Never use gitCommit or dateTime — they break IfNotPresent pull policy.

apiVersion: skaffold/v4beta2
kind: Config

build:
  tagPolicy:
    sha256: {}
  artifacts:
    - image: auth
      context: Auth
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/**"

    - image: ai-service
      context: Ai-service
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "src/**"

    - image: backend
      context: Backend
      docker:
        dockerfile: dockerfile
      sync:
        infer:
          - "app/**"
          - "config/**"
          - "controllers/**"
          - "middleware/**"
          - "models/**"
          - "routes/**"
          - "services/**"
          - "server.js"
          - "package.json"

manifests:
  rawYaml:
    - k8s/auth.deployment.yml
    - k8s/auth.service.yml
    - k8s/ai.deployment.yml
    - k8s/ai.service.yml
    - k8s/backend.deployment.yml
    - k8s/backend.service.yml
    - k8s/secrets.yml
    - k8s/ingress.yml
```

---

### 13.3 Kubernetes Deployment Manifests

**`k8s/auth.deployment.yml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-deployment
  labels:
    app: auth
spec:
  replicas: 1
  selector:
    matchLabels:
      app: auth
  template:
    metadata:
      labels:
        app: auth
    spec:
      containers:
      - name: auth-container
        image: auth
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "250m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 90
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 5
          timeoutSeconds: 5
        ports:
        - containerPort: 3000
          name: auth-http
        env:
        - name: PORT
          value: "3000"
        - name: MONGO_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: AUTH
        - name: REDIS_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: REDIS_URI
        - name: RSA_PRIVATE_KEY
          valueFrom:
            secretKeyRef:
              name: jwt
              key: RSA_PRIVATE_KEY
        - name: JWT_REFRESH_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt
              key: JWT_REFRESH_SECRET
        - name: GOOGLE_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: google
              key: GOOGLE_CLIENT_ID
        - name: GOOGLE_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: google
              key: GOOGLE_CLIENT_SECRET
```

**`k8s/ai.deployment.yml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-deployment
  labels:
    app: ai
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ai
  template:
    metadata:
      labels:
        app: ai
    spec:
      containers:
      - name: ai-container
        image: ai-service
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "250m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 90
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 5
          timeoutSeconds: 5
        ports:
        - containerPort: 3000
          name: ai-http
        env:
        - name: PORT
          value: "3000"
        - name: MONGO_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: AI
        - name: REDIS_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: REDIS_URI
        - name: AUTH_JWKS_URI
          value: "http://auth-service/.well-known/jwks.json"
        - name: BACKEND_SERVICE_URL
          value: "http://backend-service"
        - name: MISTRALAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-secret
              key: MISTRALAI_API_KEY
              optional: true
        - name: GOOGLE_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-secret
              key: GOOGLE_API_KEY
              optional: true
        - name: RIME_API_KEY
          valueFrom:
            secretKeyRef:
              name: ai-secret
              key: RIME_API_KEY
              optional: true
        - name: QDRANT_URL
          valueFrom:
            secretKeyRef:
              name: ai-secret
              key: QDRANT_URL
              optional: true
```

**`k8s/backend.deployment.yml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-deployment
  labels:
    app: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend-container
        image: backend
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "250m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 4000
          initialDelaySeconds: 90
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /readyz
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 5
          timeoutSeconds: 5
        ports:
        - containerPort: 4000
          name: backend-http
        env:
        - name: PORT
          value: "4000"
        - name: MONGO_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: BACKEND
        - name: REDIS_URI
          valueFrom:
            secretKeyRef:
              name: database
              key: REDIS_URI
        - name: AUTH_JWKS_URI
          value: "http://auth-service/.well-known/jwks.json"
        - name: AI_SERVICE_URL
          value: "http://ai-service"
```

---

### 13.4 Kubernetes Service Manifests

**`k8s/auth.service.yml`**
```yaml
kind: Service
apiVersion: v1
metadata:
  name: auth-service
  labels:
    app: auth
spec:
  selector:
    app: auth
  type: ClusterIP
  ports:
  - name: auth-http
    port: 80
    targetPort: 3000
```

**`k8s/ai.service.yml`**
```yaml
kind: Service
apiVersion: v1
metadata:
  name: ai-service
  labels:
    app: ai
spec:
  selector:
    app: ai
  type: ClusterIP
  ports:
  - name: ai-http
    port: 80
    targetPort: 3000
```

**`k8s/backend.service.yml`**
```yaml
kind: Service
apiVersion: v1
metadata:
  name: backend-service
  labels:
    app: backend
spec:
  selector:
    app: backend
  type: ClusterIP
  ports:
  - name: backend-http
    port: 80
    targetPort: 4000
```

---

### 13.5 `k8s/ingress.yml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: atc-ingress
  labels:
    app.kubernetes.io/name: atc-ingress
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "10"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - pathType: Prefix
            path: "/api/auth"
            backend:
              service:
                name: auth-service
                port:
                  number: 80
          - pathType: Prefix
            path: "/api/ai"
            backend:
              service:
                name: ai-service
                port:
                  number: 80
          - pathType: Prefix
            path: "/api/backend"
            backend:
              service:
                name: backend-service
                port:
                  number: 80
```

---

### 13.6 `k8s/secrets.yml` (placeholder values — fill before running)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: database
type: Opaque
stringData:
  AUTH: AUTH_DATABASE_URL
  AI: AI_DATABASE_URL
  BACKEND: BACKEND_DATABASE_URL
  REDIS_URI: REDIS_URI_VALUE

---
apiVersion: v1
kind: Secret
metadata:
  name: jwt
type: Opaque
stringData:
  RSA_PRIVATE_KEY: |
    -----BEGIN PRIVATE KEY-----
    RSA_PRIVATE_KEY_VALUE
    -----END PRIVATE KEY-----
  JWT_REFRESH_SECRET: JWT_REFRESH_SECRET_VALUE

---
apiVersion: v1
kind: Secret
metadata:
  name: google
type: Opaque
stringData:
  GOOGLE_CLIENT_ID: GOOGLE_CLIENT_ID_VALUE
  GOOGLE_CLIENT_SECRET: GOOGLE_CLIENT_SECRET_VALUE

---
apiVersion: v1
kind: Secret
metadata:
  name: ai-secret
type: Opaque
stringData:
  MISTRALAI_API_KEY: MISTRALAI_API_KEY_VALUE
  GOOGLE_API_KEY: GOOGLE_API_KEY_VALUE
  RIME_API_KEY: RIME_API_KEY_VALUE
  QDRANT_URL: QDRANT_URL_VALUE
```

