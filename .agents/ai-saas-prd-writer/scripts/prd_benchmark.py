#!/usr/bin/env python3
"""
prd_benchmark.py — Score a drafted AI SaaS PRD against a quality rubric.

Usage:
    python3 prd_benchmark.py path/to/prd.md
    python3 prd_benchmark.py path/to/prd.md --category agent
    python3 prd_benchmark.py path/to/prd.md --category agent --json
    python3 prd_benchmark.py path/to/prd.md --threshold 85

Exit code is 0 if the score clears --threshold (default 80), 1 otherwise —
so this can double as a CI gate on a docs/prd/ folder, not just a manual check.

Categories: copilot | agent | workflow | generative | data-copilot | rag | embedded
If --category is omitted, every check is evaluated (comprehensive/general mode) —
useful when you're not sure yet, but a category-scoped run is more accurate since
some checks (e.g. autonomy boundary) only make sense for certain product shapes.

No third-party dependencies — stdlib only, so it runs anywhere the skill runs.
"""

import argparse
import json
import re
import sys
from pathlib import Path

NUMBER_PATTERN = re.compile(
    r"(\d+(\.\d+)?\s*%"
    r"|\b\d+(\.\d+)?\s*(ms|milliseconds|s\b|sec|seconds|minutes|min)\b"
    r"|[≥≤><]=?\s*\d+(\.\d+)?"
    r"|\$\s?\d+(\.\d+)?"
    r"|\b0\.\d+\b"
    r"|\b\d+\s*(x|tokens?)\b)",
    re.IGNORECASE,
)

ALL_CATEGORIES = ["copilot", "agent", "workflow", "generative", "data-copilot", "rag", "embedded"]


def has_section(text_lower, name_substrings):
    for line in text_lower.splitlines():
        if line.strip().startswith("#"):
            header = line.lstrip("#").strip()
            if any(sub in header for sub in name_substrings):
                return True
    return False


def any_keyword(text_lower, keywords):
    return any(kw in text_lower for kw in keywords)


def has_number_near(text_lower, keywords, window=250):
    for kw in keywords:
        for m in re.finditer(re.escape(kw), text_lower):
            start = max(0, m.start() - window)
            end = min(len(text_lower), m.end() + window)
            if NUMBER_PATTERN.search(text_lower[start:end]):
                return True
    return False


def build_checks():
    return [
        dict(id="header_meta", label="Header block includes owner/POC and date/version", weight=2,
             categories=None,
             check=lambda t: any_keyword(t, ["poc", "owner"]) and any_keyword(t, ["date", "version"])),
        dict(id="objective", label="Objective / Why section present", weight=3,
             categories=None,
             check=lambda t: has_section(t, ["why", "objective"])),
        dict(id="non_goals", label="Non-Goals section present", weight=4,
             categories=None,
             check=lambda t: has_section(t, ["non-goal", "non goal"]) or any_keyword(t, ["out of scope", "not doing"])),
        dict(id="success_metrics", label="Success metrics present with a quantified target", weight=4,
             categories=None,
             check=lambda t: (has_section(t, ["success", "metric", "kpi"]) or any_keyword(t, ["north star"]))
             and has_number_near(t, ["metric", "target", "success", "kpi", "north star", "accuracy", "reduce", "increase"])),
        dict(id="guardrail_metrics", label="Guardrail / do-not-disturb metrics mentioned", weight=3,
             categories=None,
             check=lambda t: any_keyword(t, ["guardrail metric", "do not disturb", "do-not-disturb",
                                              "must not regress", "must not decrease", "must not increase"])),
        dict(id="persona", label="Users / persona section present", weight=2,
             categories=None,
             check=lambda t: has_section(t, ["who are the users", "persona", "target user"])),
        dict(id="evidence", label="Problem backed by evidence/research", weight=2,
             categories=None,
             check=lambda t: any_keyword(t, ["research", "interview", "support ticket", "survey",
                                              "data shows", "evidence", "usage data", "analytics"])),
        dict(id="solution_alternatives", label="Solution includes alternatives considered", weight=3,
             categories=None,
             check=lambda t: any_keyword(t, ["alternative", "considered", "trade-off", "tradeoff", "rejected"])),
        dict(id="eval_framework", label="Evaluation framework with a quantified threshold", weight=6,
             categories=None,
             check=lambda t: has_number_near(t, ["accuracy", "precision", "recall", "confidence",
                                                  "f1", "eval", "threshold", "groundedness"])),
        dict(id="latency", label="Latency / performance envelope specified", weight=4,
             categories=None,
             check=lambda t: has_number_near(t, ["latency", "ttft", "time-to-first-token", "response time",
                                                  "p95", "p99", "seconds", "milliseconds"])
             or any_keyword(t, ["synchronous", "asynchronous", "async", "real-time"])),
        dict(id="guardrails_safety", label="Guardrails & safety section present", weight=6,
             categories=None,
             check=lambda t: any_keyword(t, ["pii", "moderation", "hallucinat", "bias", "toxic",
                                              "guardrail", "content safety", "safety"])),
        dict(id="fallback", label="Fallback behavior defined", weight=4,
             categories=None,
             check=lambda t: any_keyword(t, ["fallback", "fall back", "falls back", "degrade", "escalat"])),
        dict(id="hitl", label="Human-in-the-loop checkpoints defined", weight=6,
             categories=None,
             check=lambda t: any_keyword(t, ["human-in-the-loop", "human in the loop", "hitl",
                                              "human review", "approval", "sign-off", "reviewer"])),
        dict(id="edge_cases", label="Edge cases / adversarial input handling", weight=4,
             categories=None,
             check=lambda t: any_keyword(t, ["edge case", "adversarial", "prompt injection",
                                              "malicious", "off-topic", "off topic"])),
        dict(id="examples", label="Example prompts / golden outputs included", weight=3,
             categories=None,
             check=lambda t: any_keyword(t, ["example prompt", "golden example", "example input",
                                              "example output", "typical:", "edge case:"])),
        dict(id="data_requirements", label="Data requirements / provenance specified", weight=3,
             categories=["agent", "workflow", "generative", "data-copilot", "rag"],
             check=lambda t: any_keyword(t, ["data sourcing", "provenance", "dataset",
                                              "data source", "labeling", "labelling"])),
        dict(id="compliance", label="Compliance / privacy explicitly addressed", weight=3,
             categories=["agent", "workflow", "data-copilot", "rag", "copilot", "generative", "embedded"],
             check=lambda t: any_keyword(t, ["gdpr", "hipaa", "ccpa", "compliance", "privacy", "pii"])),
        dict(id="unit_economics", label="Unit economics / cost section present with a number", weight=5,
             categories=["agent", "workflow", "copilot", "data-copilot", "rag"],
             check=lambda t: has_number_near(t, ["cost per", "cost ceiling", "token budget", "$",
                                                  "cost/", "per ticket", "per interaction",
                                                  "per request", "per task"])),
        dict(id="model_fallback", label="Model/provider dependency & fallback specified", weight=3,
             categories=None,
             check=lambda t: any_keyword(t, ["model provider", "fallback provider", "rate limit",
                                              "outage", "model version"])),
        dict(id="autonomy_boundary", label="Autonomy boundary defined (required for agents)", weight=8,
             categories=["agent"],
             check=lambda t: any_keyword(t, ["autonomy boundary", "fully autonomous",
                                              "requires approval", "forbidden"])),
        dict(id="timeline", label="Timeline / milestone table present", weight=2,
             categories=None,
             check=lambda t: any_keyword(t, ["timeline", "milestone"]) and "|" in t),
        dict(id="dependencies", label="Dependencies section present", weight=2,
             categories=None,
             check=lambda t: has_section(t, ["dependencies"])),
        dict(id="decision_log", label="Decision log / open questions tracked", weight=3,
             categories=None,
             check=lambda t: any_keyword(t, ["decision log", "open question", "tbd"])),
    ]


def run(text, category):
    text_lower = text.lower()
    checks = build_checks()
    included = [c for c in checks if category is None or c["categories"] is None or category in c["categories"]]

    results = []
    for c in included:
        passed = bool(c["check"](text_lower))
        results.append({"id": c["id"], "label": c["label"], "weight": c["weight"], "passed": passed})

    total_weight = sum(c["weight"] for c in included)
    earned = sum(c["weight"] for c in results if c["passed"])
    score = round((earned / total_weight) * 100, 1) if total_weight else 0.0

    if score >= 85:
        verdict = "PASS — production-grade"
    elif score >= 65:
        verdict = "PARTIAL — needs work before shipping"
    else:
        verdict = "FAIL — significant gaps"

    return {
        "category": category or "general (all checks)",
        "score": score,
        "verdict": verdict,
        "checks": results,
    }


def print_report(report):
    print(f"PRD Benchmark — category: {report['category']}")
    print("-" * 60)
    for c in report["checks"]:
        mark = "PASS" if c["passed"] else "FAIL"
        print(f"[{mark}] (w={c['weight']}) {c['label']}")
    print("-" * 60)
    print(f"Score: {report['score']}/100  —  {report['verdict']}")
    if any(not c["passed"] for c in report["checks"]):
        print("\nMissing / needs attention:")
        for c in report["checks"]:
            if not c["passed"]:
                print(f"  - {c['label']}")


def main():
    parser = argparse.ArgumentParser(description="Score a PRD markdown file against the AI SaaS PRD rubric.")
    parser.add_argument("prd_path", type=str, help="Path to the PRD markdown file")
    parser.add_argument("--category", type=str, default=None, choices=ALL_CATEGORIES,
                         help="Product category from product-categories.md. Omit for a comprehensive/general check.")
    parser.add_argument("--threshold", type=float, default=80.0,
                         help="Minimum score to exit 0 (default: 80)")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of a human-readable report")
    args = parser.parse_args()

    path = Path(args.prd_path)
    if not path.exists():
        print(f"Error: file not found: {path}", file=sys.stderr)
        sys.exit(2)

    text = path.read_text(encoding="utf-8")
    report = run(text, args.category)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_report(report)

    sys.exit(0 if report["score"] >= args.threshold else 1)


if __name__ == "__main__":
    main()
