#!/usr/bin/env bash
# React Bits component audit script
# Usage: ./audit-component.sh <path-to-component-file>
#
# Automated, grep-based first pass. It flags things to look at — it does not
# replace the manual checks in the references/ docs, especially the DevTools
# cleanup verification in references/client-boundary-and-cleanup.md.

set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 <path-to-component-file>"
  exit 1
fi

echo "Auditing: $FILE"
echo "----------------------------------------"

# 1. Stray hex colors — cross-check each one against the prop defaults you
#    intend to expose. See references/theming-and-branding.md.
echo "[1] Hex color literals found in file:"
grep -noE '#[0-9A-Fa-f]{3,8}' "$FILE" | sort -u -t: -k2 || echo "  none found"
echo

# 2. Browser globals — should only appear inside effects/handlers, not in the
#    synchronous render body. See references/client-boundary-and-cleanup.md.
echo "[2] Browser globals referenced (window/document/navigator):"
grep -n 'window\.\|document\.\|navigator\.' "$FILE" | grep -v '^\s*//' || echo "  none found"
echo

# 3. "use client" directive presence (relevant for Next.js/SSR projects only —
#    irrelevant for plain Vite/CRA client-side-rendered apps).
echo "[3] \"use client\" directive:"
if head -n 3 "$FILE" | grep -q "use client"; then
  echo "  present"
else
  echo "  absent — required if this file is consumed by a Next.js (or other"
  echo "  SSR) app. Not required for a plain Vite/CRA client-only app — confirm"
  echo "  which this project is before treating this as an issue."
fi
echo

# 4. Effect cleanup presence
echo "[4] useEffect cleanup:"
if grep -q 'useEffect' "$FILE"; then
  if grep -q 'return () =>' "$FILE"; then
    echo "  cleanup function present — verify by name below, then confirm in"
    echo "  DevTools per references/client-boundary-and-cleanup.md (presence"
    echo "  in source is not proof of correct teardown)."
    FOUND=$(grep -n 'cancelAnimationFrame\|\.disconnect()\|removeEventListener\|\.destroy()\|\.dispose()' "$FILE" || true)
    if [[ -n "$FOUND" ]]; then
      echo "$FOUND"
    else
      echo "  WARNING: none of the expected cleanup calls (cancelAnimationFrame,"
      echo "  .disconnect(), removeEventListener, .destroy(), .dispose()) were"
      echo "  found by name — inspect the cleanup function manually."
    fi
  else
    echo "  WARNING: useEffect found but no 'return () =>' cleanup function"
    echo "  detected in this file."
  fi
else
  echo "  no useEffect in this file — skip"
fi
echo

# 5. Off-screen pause support
echo "[5] Off-screen pause support:"
if grep -q 'paused' "$FILE"; then
  echo "  component exposes a 'paused' prop — wire it to an IntersectionObserver"
  echo "  at the call site. See assets/component-wrapper.template.jsx."
else
  echo "  no 'paused' prop found in this file — check the component's prop"
  echo "  table for an equivalent, or gate rendering entirely with an"
  echo "  IntersectionObserver at the call site instead."
fi
echo

echo "----------------------------------------"
echo "Automated audit complete."
echo "Any WARNING above: cross-reference against references/breakpoints.md."
echo "This script does NOT check: theming completeness (manual triage per"
echo "hex match required), dependency version conflicts (run 'npm ls' per"
echo "references/install-and-dependencies.md), or portal/stacking issues"
echo "(references/portal-stacking.md, requires visual testing)."
