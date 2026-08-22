# Codebase Review Checklist

Goal: never ask the user something the repository already answers. Work through this roughly in order — earlier items are higher-leverage and cheaper to check.

1. **README / docs folder** — product description, current scope, architecture notes. This is usually the fastest way to understand what the product already is before proposing what it should become.
2. **Dependency manifests** (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, etc.) — look specifically for AI/LLM SDKs already in use (`langchain`, `langgraph`, `openai`, `anthropic`, `@anthropic-ai/sdk`, `transformers`, `llama-index`, vector-DB clients like `pinecone`, `chroma`, `weaviate`, `pgvector`). This tells you the model-provider and orchestration decisions that are already made — don't re-litigate them in the PRD unless the user is explicitly asking to change them.
3. **Existing schema/data models** (`prisma/schema.prisma`, `models.py`, migrations folder, ORM definitions) — for the Data Requirements / Data Model sections. Reuse existing structures in the draft rather than inventing parallel ones.
4. **Existing API routes / controllers** — to see what surface already exists, so the PRD proposes genuinely new endpoints/behavior instead of re-specifying something shipped.
5. **Config and `.env.example`** — read variable *names* only, never values, to infer third-party integrations and model providers already wired up (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `PINECONE_API_KEY` tells you a lot about the Dependencies section for free).
6. **Existing PRDs/specs folder** (`docs/prd/`, `/specs`, `/rfcs`) — if this feature or an adjacent one already has a doc, this is an update, not a fresh draft; match its format and don't contradict decisions already recorded there.
7. **Tests** — existing test files often encode acceptance criteria and edge cases someone already thought through; mine these instead of re-deriving them from scratch.
8. **CI config** (`.github/workflows`, etc.) — can hint at existing performance/latency gates or deployment cadence relevant to the Timeline and Non-Functional sections.
9. **Recent git history / CHANGELOG** — avoid proposing as "new" something that shipped last sprint; also useful for picking up naming conventions already in use for similar features.

Everything found here should either get folded directly into the draft (no need to ask) or sharpen a specific question for Step 4 — never both ask about something *and* leave the codebase-derived answer unused.
