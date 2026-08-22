---
name: ai-rate-limiter
description: "Token Bucket Rate Limiting, Rolling Time Limits, Model Tier Degradation, Context-Aware Token Burning, and Prompt Caching for AI Coding SaaS platforms. Use when implementing Redis-based token buckets, capacity refill rates, model routing fallbacks, prompt caching cost optimizations, or tier limit rules. Actions: implement rate limiter, configure token bucket, setup model degradation, optimize prompt caching, enforce tier limits."
argument-hint: "[tier-name] [redis-url] [strategy]"
license: MIT
metadata:
  author: capstone-team
  version: "1.0.0"
---

# AI Rate Limiter & Token Bucket Management System

Design and build production-grade, cost-optimized token bucket rate limiting for AI coding SaaS applications. Implements continuous Redis refill logic, variable context burn calculation, seamless model tier degradation, and LLM prompt caching.

---

## When to Activate This Skill

| Trigger / User Goal | Recommended Action |
|---|---|
| "Implement rate limiting for AI app" | Set up Redis Token Bucket Lua script & Express middleware |
| "Prevent heavy context budget drain" | Implement dynamic context burn rate & prompt caching |
| "Configure Free vs Pro vs Team tiers" | Apply Tier Breakdown & Model Degradation rules |
| "Set up rolling 3-hour limit" | Configure continuous per-minute refill parameters in Redis |
| "Add fallback from Sonnet to Haiku" | Implement Pro tier degradation pipeline |

---

## Core Architecture Workflow

### Step 1 — Initialize Redis Token Bucket Infrastructure
- Load the atomic Lua script `references/redis-token-bucket-lua.md`.
- Create Redis keys using standard naming format: `ratelimit:tokenbucket:{userId}:{tier}`.
- Configure capacity and continuous per-second refill rates per tier (`references/tier-configurations.md`).

### Step 2 — Implement Context-Aware Pre-Execution Check
- Compute estimated prompt input tokens before dispatching to LLM provider.
- Enforce strict hard cap (e.g. 8k input tokens for Free Tier).
- Execute Redis Lua `consumeTokenBucket`:
  - If `allowed == 1`, proceed to LLM execution.
  - If `allowed == 0` on Pro tier, trigger **Model Degradation** (Step 3).
  - If `allowed == 0` on Free tier, return HTTP `429` with `Retry-After` header.

### Step 3 — Apply Model Degradation (Pro Tier)
- When a Pro user's premium bucket is empty:
  - Do **not** block the request.
  - Reroute inference from flagship model (`claude-3-5-sonnet`) to low-cost model (`claude-3-5-haiku`).
  - Check/burn from the user's secondary fallback bucket.
  - Inject response header `X-Model-Degraded: true`.

### Step 4 — Enable Prompt Caching
- Configure Anthropic/OpenAI prompt caching headers on system prompts and workspace file trees (`references/context-prompt-caching.md`).
- On API response, extract `cache_read_input_tokens`.
- Perform post-execution burn adjustments in Redis based on 90% prompt cache discount.

---

## Hard Architectural Rules (Never Violate)

1. **Never use static 5-hour countdown timers**: Always use continuous token refill to prevent bad UX cliff drops.
2. **Never charge 1 flat token per request**: Always scale burn units based on prompt context length and model tier.
3. **Always use atomic Redis Lua scripts**: Never execute multi-step check and update calls across async HTTP handlers without Lua scripts.
4. **Always enforce hard context limits on Free tier**: Cap Free input tokens to 8,000 to block budget drain.
5. **Always enable prompt caching**: Cache static system prompts and repository context to reduce provider costs by up to 90%.

---

## Quick Reference Documents

| File | Content Summary |
|---|---|
| `references/redis-token-bucket-lua.md` | Atomic Redis Lua script code & ioredis helper module |
| `references/tier-configurations.md` | Tier matrix (Free, Pro, Team), parameters & model degradation flow |
| `references/context-prompt-caching.md` | Dynamic burn formula, Anthropic prompt caching SDK integration |
