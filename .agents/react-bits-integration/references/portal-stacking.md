# Portal & stacking conflicts

Relevant whenever a page uses both a React Bits visual component and an
official shadcn UI overlay component (Dialog, DropdownMenu, Popover, Select,
Tooltip) in or near the same section.

## Why it happens

Radix UI (which shadcn's overlay components are built on) renders these into
a React portal at `document.body` by default — outside the normal DOM tree
the visual component's section lives in. If that section establishes a custom
stacking context (`position: relative` combined with a `z-index`, or
`overflow: hidden` on a wrapping element), the portal-rendered overlay can end
up visually behind the canvas, or get clipped by the `overflow: hidden`
boundary, even though in the React tree it looks like a sibling or child.

## What to check

- [ ] Every Dialog/Dropdown/Popover/Select/Tooltip that sits near or over a
      React Bits section, tested in the actual browser — not just assumed
      fine because it works in isolation on a plain page.
- [ ] If a wrapping element around the visual component has `overflow:
      hidden` (common, to contain a canvas that might overflow its box),
      confirm no overlay trigger lives inside that same wrapper — move the
      trigger button outside the `overflow: hidden` boundary if needed, or
      render the overlay content via its own portal target explicitly.
- [ ] If a z-index conflict shows up, resolve it by giving the visual
      section's stacking context a deliberately low z-index rather than
      pushing the overlay's z-index arbitrarily higher — arbitrary z-index
      wars tend to resurface with the next unrelated overlay component added
      to the page.

## Checklist

- [ ] All nearby shadcn overlay components visually tested next to the
      React Bits section, in the browser, not assumed from isolated testing.
- [ ] No overlay trigger sits inside an `overflow: hidden` wrapper that
      would clip its portal content.
- [ ] Any z-index fix applied at the visual section's level, not as an
      escalating override on the overlay.
