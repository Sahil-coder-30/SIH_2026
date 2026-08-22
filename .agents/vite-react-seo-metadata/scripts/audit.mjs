#!/usr/bin/env node
/**
 * Audits a Vite + React project for placeholder or missing SEO metadata.
 *
 * Usage:
 *   node audit.mjs [path/to/project]
 *
 * Exit code 0 = all checks passed. Exit code 1 = at least one check failed.
 * Designed to be usable directly as a CI gate.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PLACEHOLDER_TITLES = [
  "vite + react",
  "vite react",
  "vite app",
  "react app",
  "frontend",
  "vite-project",
  "my app",
  "create react app",
  "",
];

const PLACEHOLDER_NAMES = [
  "vite-react-app",
  "react-app",
  "frontend",
  "vite-project",
  "my-app",
  "app",
];

const PLACEHOLDER_NAME_SUBSTRINGS = [
  "create react app",
  "react app",
  "vite react",
  "vite-react",
  "vite project",
  "vite-project",
];

function isPlaceholderName(name) {
  const n = (name || "").toLowerCase().trim();
  if (n.length === 0) return true;
  if (PLACEHOLDER_NAMES.includes(n)) return true;
  return PLACEHOLDER_NAME_SUBSTRINGS.some((s) => n.includes(s));
}

const projectPath = process.argv[2] || ".";
const indexHtmlPath = join(projectPath, "index.html");

let failures = 0;
const results = [];

function report(label, pass, detail) {
  results.push({ label, pass, detail });
  if (!pass) failures++;
}

function extractTag(html, regex) {
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

function extractMetaContent(html, attrName, attrValue) {
  // Matches <meta ... name="description" ... content="..."> in either attribute order
  const re1 = new RegExp(
    `<meta[^>]*${attrName}=["']${attrValue}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${attrValue}["'][^>]*>`,
    "i"
  );
  const m = html.match(re1) || html.match(re2);
  return m ? m[1].trim() : null;
}

// --- index.html checks ---
if (!existsSync(indexHtmlPath)) {
  console.error(
    `✗ No index.html found at ${indexHtmlPath}. Is this the Vite project root ` +
      `(the folder containing index.html, package.json, and vite.config.*)? ` +
      `Note: Vite keeps index.html at the project root, not inside public/.`
  );
  process.exit(1);
}

const html = readFileSync(indexHtmlPath, "utf-8");

const title = extractTag(html, /<title[^>]*>([^<]*)<\/title>/i);
const titleIsPlaceholder =
  title === null || PLACEHOLDER_TITLES.includes(title.trim().toLowerCase());
report(
  "index.html <title>",
  !titleIsPlaceholder,
  title === null ? "missing <title> tag" : `found: "${title}"`
);

const description = extractMetaContent(html, "name", "description");
report(
  "meta description",
  !!description && description.length > 0,
  description ? `found: "${description}"` : "missing meta[name=description]"
);

const ogTitle = extractMetaContent(html, "property", "og:title");
const ogDescription = extractMetaContent(html, "property", "og:description");
const ogImage = extractMetaContent(html, "property", "og:image");
const ogUrl = extractMetaContent(html, "property", "og:url");
report(
  "Open Graph tags (og:title, og:description, og:image, og:url)",
  !!(ogTitle && ogDescription && ogImage && ogUrl),
  `og:title=${!!ogTitle} og:description=${!!ogDescription} og:image=${!!ogImage} og:url=${!!ogUrl}`
);

const twitterCard = extractMetaContent(html, "name", "twitter:card");
report(
  "twitter:card meta tag",
  !!twitterCard,
  twitterCard ? `found: "${twitterCard}"` : "missing meta[name=twitter:card]"
);

const hasHelmetAttr = /data-react-helmet=["']true["']/i.test(html);
report(
  "data-react-helmet fallback attribute on static tags",
  hasHelmetAttr,
  hasHelmetAttr
    ? "present"
    : "not set — react-helmet-async can still work without it, but per-route " +
      "Helmet overrides may duplicate tags instead of replacing them; see " +
      "references/helmet-patterns.md"
);

// --- package.json checks ---
const pkgPath = join(projectPath, "package.json");
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const pkgName = pkg.name || "";
  const pkgNameOk = !isPlaceholderName(pkgName) && pkgName === pkgName.toLowerCase();
  report(
    "package.json \"name\"",
    pkgNameOk,
    `found: "${pkg.name || "(missing)"}"`
  );
} else {
  report("package.json \"name\"", false, "package.json not found");
}

// --- manifest.json checks (optional file) ---
const manifestPath = join(projectPath, "public", "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const nameOk = !isPlaceholderName(manifest.name);
  const shortNameOk = !isPlaceholderName(manifest.short_name);
  report(
    "public/manifest.json name/short_name",
    nameOk && shortNameOk,
    `name="${manifest.name || "(missing)"}" short_name="${manifest.short_name || "(missing)"}"`
  );
} else {
  results.push({
    label: "public/manifest.json",
    pass: true,
    detail: "not present — skipped (not every app is a PWA)",
    skipped: true,
  });
}

// --- react-helmet-async presence (informational only) ---
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasHelmetAsync = !!deps["react-helmet-async"];
  results.push({
    label: "react-helmet-async installed",
    pass: true,
    detail: hasHelmetAsync
      ? "installed"
      : "not installed — fine for a single-page app; needed if you want " +
        "per-route titles (see references/helmet-patterns.md)",
    skipped: true,
  });
}

// --- print report ---
console.log(`\nSEO metadata audit: ${projectPath}\n`);
for (const r of results) {
  const icon = r.skipped ? "•" : r.pass ? "✓" : "✗";
  console.log(`${icon} ${r.label}\n    ${r.detail}`);
}
console.log(
  `\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}\n`
);

process.exit(failures === 0 ? 0 : 1);
