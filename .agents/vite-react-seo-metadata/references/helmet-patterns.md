# react-helmet-async patterns

Read this when the project has more than one route/page and each should carry
its own `<title>`/meta tags, or when `scripts/audit.mjs` flags
`react-helmet-async installed: false`.

## Why `react-helmet-async`, not `react-helmet`

`react-helmet` (no `-async`) is unmaintained and has known issues with
concurrent/async rendering (React 18+ `Suspense`, streaming). `react-helmet-async`
is the maintained fork and is a near drop-in replacement — same `<Helmet>` API,
different provider.

## Install

```bash
npm install react-helmet-async
```

## Wire up the provider (once, at the app root)

```jsx
// main.jsx
import { HelmetProvider } from 'react-helmet-async';
import App from './App';

createRoot(document.getElementById('root')).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
```

## Per-route usage

```jsx
import { Helmet } from 'react-helmet-async';

function ContactPage() {
  return (
    <>
      <Helmet>
        <title>Contact Us | Taksha Codespace</title>
        <meta name="description" content="Get in touch with the Taksha Codespace team." />
        <meta property="og:title" content="Contact Us | Taksha Codespace" />
      </Helmet>
      <h1>Contact Page Content</h1>
    </>
  );
}
```

Put a `<Helmet>` block in every route component that should have a distinct
title — not just the homepage. Any tag you don't override in a given route
falls back to whatever `fix.mjs` wrote into `index.html`.

## Why `data-react-helmet="true"` on the static fallback tags

`fix.mjs` adds `data-react-helmet="true"` to the `<title>` and `<meta>` tags it
writes into `index.html`. This marks them as "managed" tags so that when
`react-helmet-async` mounts and takes over the `<head>` on a given route, it
recognizes the existing tag as one it owns and replaces it in place — instead
of the static fallback and the dynamic tag sitting side by side (which is what
happens if the static tag has no such marker and the library just appends its
own next to it, leaving bots that don't wait for JS with two conflicting
`<title>` tags).

If you hand-write additional static tags in `index.html` that you want a page's
`<Helmet>` to be able to override cleanly, add the same attribute to those too.

## Common mistake this catches

Wrapping only some pages in `<Helmet>` and assuming the others "inherit" a
sensible title — they don't; they show whatever's in the static `index.html`
fallback, which is exactly why that fallback has to be a real title/description
and not the scaffold default in the first place (step 1 of the main workflow).
