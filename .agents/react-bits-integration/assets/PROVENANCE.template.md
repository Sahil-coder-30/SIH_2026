# Component provenance

Copy this file next to every component pulled from React Bits, rename it to
match the component (e.g. `Lightfall.PROVENANCE.md`), and fill it in. This is
what stops a teammate from re-running the install command later and silently
overwriting customizations — treat every pulled component as first-party code
from the moment it lands, not a package that auto-updates.

- **Component**: <name>
- **Variant**: <e.g. JS + Tailwind>
- **Source URL**: <https://reactbits.dev/r/...>
- **Installed on**: <date>
- **Installed by**: <who>
- **Dependencies added** (from the `install-component.sh` diff):
  - <package>@<version>
- **Customizations made after install**:
  - <e.g. "changed uMouseColor default in shader to match brand average">
  - <e.g. "wrapped with IntersectionObserver pause per component-wrapper.template.jsx">
  - <e.g. "moved from components/ui/ to components/reactbits/, fixed import in PlansOverview.jsx">
- **Known non-prop hex values left in source** (from the theming audit):
  - <e.g. "shadow blend constant, left as-is, purely structural">

**Do not re-run `shadcn add` on this file.** If the upstream component
updates and you want the new version, pull it into a scratch branch first and
diff manually against this file's customizations before merging.
