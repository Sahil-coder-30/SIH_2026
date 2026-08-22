# AI Meeting Notes Summarizer — PRD

| | |
|---|---|
| **Status** | Draft |
| **Date & Version** | 2026-07-10, v0.1 |
| **Product POC** | Dana |
| **Tech POC** | Wei |

## Why (Objective)

Users spend too long writing meeting notes by hand after every call. This will auto-generate a summary from the call transcript so they don't have to.

## Non-Goals

This will not join or record calls itself — it only summarizes an existing transcript. It will not auto-send the summary to attendees in v1.

## How We Measure Success

We want more people to use the summary feature instead of writing notes manually. Target: 40% of eligible calls get a summary generated within the first month.

## Who Are the Users

Knowledge workers who take a lot of calls and currently write their own notes afterward. We know this is a problem because several customers have asked for it in feedback calls.

## Solution

Generate a structured summary (key points, decisions, action items) from the transcript automatically after the call ends. We considered a manual "generate on demand" button instead of automatic generation, but decided automatic is more valuable since most users forget to click it.

## Product Flow

1. Call ends, transcript becomes available.
2. Summary is generated and attached to the call record.
3. User can view, edit, or discard the summary.

User story: As a user, I want a summary waiting for me after a call, so I don't have to write my own notes.

## Tentative Timeline

| Milestone | Date |
|---|---|
| Design ready | 2026-07-20 |
| Development starts | 2026-08-01 |
| Beta launch | 2026-08-20 |

## Dependencies

Depends on the transcript pipeline already in production. No new infra needed.
