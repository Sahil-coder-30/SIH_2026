# Theming & branding

Every React Bits visual component ships with hardcoded demo colors as prop
defaults — and sometimes a stray hex value buried directly in a shader or CSS
string that isn't exposed as a prop at all.

## Rule

Pass every color-related prop explicitly at the call site. Never rely on the
component's defaults, even temporarily — "wire it up properly later" tends not
to happen once the page looks fine at a glance.

## Finding colors that aren't exposed as props

`scripts/audit-component.sh` runs this automatically, but to do it by hand:

```bash
grep -noE '#[0-9A-Fa-f]{3,8}' path/to/Component.jsx
```

Anything this turns up that ISN'T inside a `= '#......'` default-prop
declaration is a color you can't control from outside the component. Decide
explicitly, per match:
- **Structural color** (a shadow, a subtle border, an internal blend
  constant) → usually fine to leave, but note it in the provenance doc so a
  future brand refresh knows to check here.
- **Visible demo brand color** (background glow, accent tint) → patch the
  component source directly, or better, expose it as a new prop if you'll
  ever need to change it again without re-editing the source.

## Background seam issue

If the component renders against a `backgroundColor`-style prop, set it to
match the actual page background token it will sit on — not a saturated demo
value. Otherwise you get a visible rectangle/seam where the component's
canvas sits, instead of it blending into the page. This is the single most
common "looks broken" report for canvas background effects, and it's a one
line fix once you know to look for it.

## Route-specific palettes

Nothing stops the same component from taking a different palette on different
routes — e.g. a cooler palette on a browse/landing section and a warmer one
approaching a checkout/confirmation step, using the same component instance
with different props per page. This is a legitimate design technique (a
"temperature shift" across a funnel), not a bug — just make sure each route
that uses the component sets its own palette explicitly rather than inheriting
whatever default happens to be in scope.

## Checklist

- [ ] Every color prop set explicitly, none left at component defaults.
- [ ] Source grepped for hex values not exposed as props; each one triaged.
- [ ] Background/base color matches the actual page background it sits on —
      no visible seam.
- [ ] If the component appears on more than one route/section, confirm each
      call site sets its own palette rather than sharing a default.
