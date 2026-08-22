# Redis Token Bucket Lua Script Implementation

## Overview
This reference provides a high-performance, atomic Redis Lua script for the **Token Bucket Algorithm** tailored for AI coding platforms. It handles continuous per-minute token refills and variable token burn based on prompt context and model tier.

---

## Redis Lua Script: `token_bucket.lua`

```lua
-- KEYS[1]: Redis Key for User Bucket (e.g., "ratelimit:tokenbucket:{userId}:{tier}")
-- ARGV[1]: Max Capacity (e.g., 500 tokens)
-- ARGV[2]: Refill Rate Per Second (e.g., 500 / (3 * 3600) = 0.0463 tokens/sec)
-- ARGV[3]: Tokens to Burn (Calculated dynamically based on context size & model multiplier)
-- ARGV[4]: Current Timestamp (Epoch seconds)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested_tokens = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Retrieve current state from Redis Hash
local data = redis.call("HMGET", key, "tokens", "last_updated")
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if not tokens then
    -- Bucket initialization (First time request)
    tokens = capacity
    last_updated = now
else
    -- Compute refill elapsed time
    local delta = math.max(0, now - last_updated)
    tokens = math.min(capacity, tokens + (delta * refill_rate))
    last_updated = now
end

-- Check if bucket has sufficient tokens
local allowed = 0
local retry_after = 0

if tokens >= requested_tokens then
    tokens = tokens - requested_tokens
    allowed = 1
else
    allowed = 0
    -- Calculate seconds until enough tokens are available for requested action
    local needed = requested_tokens - tokens
    retry_after = math.ceil(needed / refill_rate)
end

-- Update Redis Hash
redis.call("HMSET", key, "tokens", tokens, "last_updated", last_updated)
-- Expire key after 12 hours of inactivity to free Redis memory
redis.call("EXPIRE", key, 43200)

return { allowed, math.floor(tokens), retry_after }
```

---

## Node.js / ioredis Integration Example

```javascript
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Load Lua script
const luaScript = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'token_bucket.lua'),
  'utf8'
);

// Define Redis custom command
redis.defineCommand('consumeTokenBucket', {
  numberOfKeys: 1,
  lua: luaScript,
});

/**
 * Execute Token Bucket Check & Burn
 */
export async function checkAndBurnTokens({ userId, tier, maxCapacity, refillRatePerSec, burnTokens }) {
  const key = `ratelimit:tokenbucket:${userId}:${tier}`;
  const now = Math.floor(Date.now() / 1000);

  const [allowed, remainingTokens, retryAfterSeconds] = await redis.consumeTokenBucket(
    key,
    maxCapacity,
    refillRatePerSec,
    burnTokens,
    now
  );

  return {
    isAllowed: allowed === 1,
    remainingTokens,
    retryAfterSeconds,
  };
}
```

---

## Key Performance Characteristics
1. **Atomicity**: The Lua script runs atomically inside Redis single-threaded engine, preventing race conditions across clustered Node.js microservice instances.
2. **Zero Cron Dependency**: Refill is computed dynamically on read (`delta * refill_rate`), eliminating the need for background cron jobs or worker queues to refill user buckets.
3. **Memory Efficiency**: Automatically sets a 12-hour TTL (`EXPIRE 43200`), ensuring inactive users do not bloat Redis RAM.
