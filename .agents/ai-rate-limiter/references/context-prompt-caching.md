# Context Windows, Variable Token Burning & Prompt Caching

## 1. The Coding Platform Blindspot: Context Scaling

In chat/Q&A apps, prompt #1 and prompt #10 are roughly equal in size.
In an **AI Coding Platform**, context scales exponentially:
- **Prompt 1**: `"Fix this function in index.js"` -> **1,200 tokens**.
- **Prompt 5**: `"Now update the test file and connected service"` -> **18,500 tokens** (includes workspace history, active files, and system prompt).
- **Prompt 10**: Full repository context re-sent -> **45,000 tokens**.

If you charge 1 flat "token" per prompt, a user sending late-stage prompts will drain 40x your raw API budget compared to early-stage prompts.

---

## 2. Dynamic Burn Rate Formula

Before executing an LLM API call, calculate the **Token Bucket Burn Units** dynamically:

$$\text{Burn Units} = \left( \frac{\text{Estimated Prompt Input Tokens}}{1000} \times \text{Input Multiplier} \right) + \left( \frac{\text{Max Output Tokens}}{1000} \times \text{Output Multiplier} \right)$$

### Multiplier Matrix by Model

| Model | Input Multiplier (per 1k tokens) | Output Multiplier (per 1k tokens) | Prompt Cache Hit Multiplier |
|---|---|---|---|
| **Claude 3.5 Haiku** | 0.25 | 1.25 | 0.025 (90% discount) |
| **Claude 3.5 Sonnet** | 1.00 | 5.00 | 0.100 (90% discount) |
| **GPT-4o** | 0.85 | 3.50 | 0.425 (50% discount) |

---

## 3. Anthropic & OpenAI Prompt Caching Integration

Prompt Caching allows LLM providers to cache static prompt prefixes (system prompt, project file tree, standard context) on their GPU clusters.

- **Un-cached Input Tokens**: Cost $3.00 / 1M tokens (Sonnet 3.5)
- **Cache Creation Tokens**: Cost $3.75 / 1M tokens
- **Cache Read Tokens (Hits)**: Cost **$0.30 / 1M tokens** (90% cost reduction!)

### Code Template: Anthropic Prompt Caching Header Setup

```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateCodeWithCache({ systemPrompt, repositoryFiles, userPrompt }) {
  const response = await anthropic.beta.promptCaching.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        // Apply cache control to static system instructions
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Repository Context:\n${repositoryFiles}`,
            // Apply cache control to static code context
            cache_control: { type: 'ephemeral' }
          },
          {
            type: 'text',
            text: userPrompt
          }
        ]
      }
    ]
  });

  // Extract usage metadata for precise token bucket adjustment
  const usage = response.usage;
  const uncachedInput = usage.input_tokens || 0;
  const cacheReadInput = usage.cache_read_input_tokens || 0;
  const cacheCreationInput = usage.cache_creation_input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;

  return {
    content: response.content,
    usage: {
      uncachedInput,
      cacheReadInput,
      cacheCreationInput,
      outputTokens,
    }
  };
}
```

### Adjusting Token Bucket Post-Execution
Because prompt caching usage is returned by the LLM API response, perform a 2-phase token bucket check:
1. **Pre-check**: Ensure bucket has minimum threshold tokens (e.g., 5 tokens).
2. **Post-burn**: Deduct exact calculated burn units after receiving `cache_read_input_tokens` from provider.
