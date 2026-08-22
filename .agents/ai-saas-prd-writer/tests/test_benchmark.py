#!/usr/bin/env python3
"""
test_benchmark.py — sanity-checks that prd_benchmark.py actually discriminates
PRD quality instead of just always passing or always failing.

This is the "does the benchmark mean anything" test, separate from using the
benchmark to grade a specific PRD. Run it once after changing the rubric in
scripts/prd_benchmark.py, or any time you don't trust the scorer.

Usage:
    python3 tests/test_benchmark.py

No third-party dependencies — stdlib only.
"""

import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SKILL_ROOT / "scripts"))

from prd_benchmark import run  # noqa: E402

GOLDEN = SKILL_ROOT / "assets" / "example-prd-support-triage-copilot.md"
PARTIAL = SKILL_ROOT / "tests" / "fixtures" / "partial_prd.md"
INCOMPLETE = SKILL_ROOT / "tests" / "fixtures" / "incomplete_prd.md"

CASES = [
    # (fixture, category, min_score, max_score, description)
    (GOLDEN, "agent", 90, 100, "fully-worked golden example should score near-perfect"),
    (GOLDEN, None, 90, 100, "golden example should also score high in general/comprehensive mode"),
    (PARTIAL, None, 15, 45, "a normal PM-style PRD missing AI-specific rigor should score low-mid, not high"),
    (INCOMPLETE, None, 0, 15, "a near-empty PRD should score close to zero"),
]


def main():
    failures = []

    for path, category, min_score, max_score, description in CASES:
        text = path.read_text(encoding="utf-8")
        report = run(text, category)
        score = report["score"]
        ok = min_score <= score <= max_score
        status = "OK" if ok else "FAIL"
        print(f"[{status}] {path.name} (category={category or 'general'}): "
              f"score={score} expected=[{min_score}, {max_score}] — {description}")
        if not ok:
            failures.append((path.name, category, score, min_score, max_score))

    # The core claim this skill makes: AI-specific rigor is what separates a
    # high score from a low one, not just section count. Confirm the golden
    # example beats the partial example by a wide margin.
    golden_report = run(GOLDEN.read_text(encoding="utf-8"), "agent")
    partial_report = run(PARTIAL.read_text(encoding="utf-8"), None)
    gap = golden_report["score"] - partial_report["score"]
    gap_ok = gap >= 40
    print(f"[{'OK' if gap_ok else 'FAIL'}] golden vs partial gap = {gap:.1f} points (expected >= 40)")
    if not gap_ok:
        failures.append(("golden-vs-partial-gap", None, gap, 40, None))

    print()
    if failures:
        print(f"{len(failures)} check(s) failed.")
        sys.exit(1)
    else:
        print("All benchmark sanity checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
