# Clarifying Questions Bank

This is a menu, not a script. Pull the clusters relevant to the gaps left after the codebase pass — don't read this file's contents at the user verbatim, and don't ask everything in one giant list. Each cluster below is meant to be asked together in a single turn once it's relevant.

## Objective & business case

- What can the user not do today that this solves — and what do they do instead right now (nothing, a manual workaround, a different tool)?
- Whose numbers move if this works — retention, activation, support cost, revenue, time saved? Roughly by how much would count as a win?
- Why does this need AI specifically — is the input too unstructured/open-ended for rules, or is there another reason deterministic logic won't cover it?

## Non-goals & scope

- What's the model technically capable of here that you deliberately don't want it doing in v1?
- Is there a related feature or capability people might assume this includes that it actually won't?

## Success metrics & guardrails

- What's the one metric this gets judged on at the next review?
- What existing metrics must not get worse because of this (latency elsewhere, cost, an existing conversion rate)?

## Users & evidence

- Who hits this first — a specific plan tier, an internal team, a beta group?
- What tells you this problem is real — support ticket volume, interviews, a specific data point? (If nothing yet, that's worth logging honestly rather than inventing a source.)

## Solution & alternatives

- What non-AI approaches did you rule out, and why? (If none were considered, worth a beat to sanity-check the AI-specific framing from best-practices §1.)

## Evaluation & quality bar

- Is a wrong answer here worse than no answer, or is "mostly helpful" good enough to ship? (This single answer usually determines the whole guardrail posture.)
- Do you have a rough accuracy/quality bar in mind, or is that still open? If open, who's the right owner to set it before launch?
- Do you already have example inputs/outputs — good and bad — that show what "working" looks like?

## Guardrails, safety & autonomy (ask directly — don't let this one slide)

- Does this touch anything regulated or sensitive (health, financial, personal data)?
- Is there a human reviewing outputs before a user sees them, or is this fully automated from day one?
- If this is an agent: which actions should it take fully on its own, which need a human okay first, and which should it never do at all in this release?
- What should happen when the model is uncertain — show it anyway with a caveat, hide it, route to a human, or fall back to something simpler?

## Non-functional / technical

- Is the user actively waiting on this (needs to feel fast) or is it fine running in the background?
- Do you already have a model/provider picked, or is that still open? Any preference on cost vs. quality trade-off?
- What happens if the model provider has an outage — is that a "not solved yet" or is there a fallback expectation?

## Data & compliance

- Where does the input data come from, and do you already have rights/consent to use it this way?
- Does anything here need to be masked or scrubbed before it reaches a model provider?

## Cost

- Do you have a rough budget or cost ceiling in mind per user or per request?
- Is cost likely to scale with something the user controls (message length, number of documents, task complexity)?

## Timeline & dependencies

- Any hard external date this needs to hit (event, contract, compliance deadline)?
- Anything blocking this that's outside your team's control (another team's API, a partner integration, infra not provisioned yet)?

## When the user defers ("you decide", "not sure yet")

For anything in the **Guardrails, safety & autonomy** or **Evaluation & quality bar** clusters, don't accept a deferral silently — restate the stakes briefly ("this changes whether the agent can send emails without review — want to set a boundary now or flag it as an open decision for [owner] before launch?") and let them choose between deciding now or logging it as an owned open item. For everything else, a deferral is fine — pick a sensible default, state it in the draft, and log it as an assumption.
