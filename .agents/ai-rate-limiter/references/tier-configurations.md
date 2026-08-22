# AI SaaS Tier Limits & Model Degradation Architecture

## Tier Overview & Financial Safeguards

AI coding platforms encounter massive token variance due to multi-file context inclusion. The tier structure must balance user developer experience with tight margin control.

| Tier | Capacity (Tokens) | Refill Window | Allowed Models | Hard Context Cap | Empty Bucket Action |
|---|---|---|---|---|---|
| **Free** | 100 tokens (~10 small reqs) | 3 Hours (0.0092 tok/s) | Claude 3.5 Haiku, GPT-4o-mini | 8,000 Tokens | **Block / Upgrade Prompt** |
| **Pro** | 500 tokens (~50 Sonnet reqs) | 3 Hours (0.0463 tok/s) | Claude 3.5 Sonnet, GPT-4o | 128,000 Tokens | **Degrade to Free Tier Model** |
| **Team / Unlimited** | Hard Dedicated Monthly Credits + Pro Rolling Fallback | 3 Hours + Monthly Reset | Flagship Models + Custom Routing | 200,000 Tokens | **Fallback to Pro Rolling Queue** |

---

## 1. Free Tier (The Safety Net)
- **Primary Goal**: Product discovery without exposing infrastructure to cost-draining context floods.
- **Model Standard**: Low-cost, fast inference models (e.g. `claude-3-5-haiku-20241022` or `gpt-4o-mini`).
- **Context Enforcement**: Maximum **8,000 tokens** input window. Any request exceeding 8k input tokens is rejected before reaching the LLM provider API.
- **Exhaustion Behavior**: Hard stop with HTTP status `429 Too Many Requests` and upgrade call-to-action (CTA).

---

## 2. Pro Tier (The Rolling Model with Automatic Degradation)
- **Primary Goal**: High-volume coding assistant with zero abrupt developer workflow interruptions.
- **Model Standard**: Flagship intelligence models (e.g. `claude-3-5-sonnet-20241022`).
- **Degradation Rule**: 
  - When the **Pro Premium Token Bucket** reaches `0 tokens`, do **NOT** block the user.
  - Automatically route subsequent prompt requests to the **Free Tier Model** (e.g. Haiku) until the Pro bucket continuously refills above the required execution threshold.
  - Return dynamic header `X-Model-Degraded: true` so the client UI displays a notification: *"You are currently using Fast Mode (Haiku) while your Sonnet limit refills."*

### Model Degradation Decision Flow

```
[Incoming Code Request]
          │
          ▼
 [Check Pro Bucket] ─── Has Tokens? ───► YES ──► [Execute Sonnet] ──► [Burn Pro Bucket]
          │
          NO
          │
          ▼
 [Check Free Bucket] ── Has Tokens? ───► YES ──► [Execute Haiku] ──► [Burn Free Bucket]
          │
          NO
          │
          ▼
 [Block Request: Return HTTP 429 + Retry-After Header]
```

---

## 3. Team / Unlimited Tier (The Hybrid Infrastructure Model)
- **Primary Goal**: Enterprise and team workspaces with high predictability.
- **Mechanism**:
  1. Each seat receives dedicated monthly dollar-value credits (e.g., $50/mo infrastructure credits).
  2. Prompt costs deduct directly from monthly dollar balance.
  3. Once monthly credits reach `$0.00`, the account automatically falls back to the **Pro Tier Rolling 3-Hour Bucket Queue** instead of locking users out.
