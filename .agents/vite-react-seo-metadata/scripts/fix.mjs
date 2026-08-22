#!/usr/bin/env node
/**
 * Patches placeholder SEO metadata in a Vite + React project.
 * Idempotent: safe to run multiple times, never duplicates tags.
 *
 * Usage:
 *   node fix.mjs --name "Site Name" --description "..." \
 *     [--url "https://example.com"] [--og-image "/og.png"] \
 *     [--twitter-handle "@handle"] [path/to/project]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = val;
    } else {
      args._.push(a);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const projectPath = args._[0] || ".";

if (!args.name || !args.description) {
  console.error(
    "Usage: node fix.mjs --name \"Site Name\" --description \"...\" " +
      "[--url URL] [--og-image PATH] [--twitter-handle @handle] [projectPath]"
  );
  process.exit(1);
}

const siteName = String(args.name);
const description = String(args.description);
const siteUrl = args.url ? String(args.url) : null;
const ogImage = args["og-image"] ? String(args["og-image"]) : null;
const twitterHandle = args["twitter-handle"] ? String(args["twitter-handle"]) : null;

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------- index.html ----------
const indexHtmlPath = join(projectPath, "index.html");
if (!existsSync(indexHtmlPath)) {
  console.error(`No index.html found at ${indexHtmlPath}. Aborting.`);
  process.exit(1);
}

let html = readFileSync(indexHtmlPath, "utf-8");
const changes = [];

function setTitle(html, title) {
  const tag = `<title data-react-helmet="true">${title}</title>`;
  if (/<title[^>]*>[^<]*<\/title>/i.test(html)) {
    return html.replace(/<title[^>]*>[^<]*<\/title>/i, tag);
  }
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function setMeta(html, selectorAttr, selectorValue, contentAttr, contentValue) {
  const tag = `<meta ${selectorAttr}="${selectorValue}" ${contentAttr}="${contentValue}" data-react-helmet="true" />`;
  const re1 = new RegExp(
    `<meta[^>]*${selectorAttr}=["']${selectorValue}["'][^>]*>`,
    "i"
  );
  if (re1.test(html)) {
    return html.replace(re1, tag);
  }
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

const beforeTitle = html;
html = setTitle(html, siteName);
if (html !== beforeTitle) changes.push(`<title> -> "${siteName}"`);

const beforeDesc = html;
html = setMeta(html, "name", "description", "content", description);
if (html !== beforeDesc) changes.push("meta[name=description] updated");

const beforeOgTitle = html;
html = setMeta(html, "property", "og:title", "content", siteName);
if (html !== beforeOgTitle) changes.push("meta[property=og:title] updated");

const beforeOgDesc = html;
html = setMeta(html, "property", "og:description", "content", description);
if (html !== beforeOgDesc) changes.push("meta[property=og:description] updated");

if (ogImage) {
  const beforeOgImg = html;
  html = setMeta(html, "property", "og:image", "content", ogImage);
  if (html !== beforeOgImg) changes.push("meta[property=og:image] updated");
}

if (siteUrl) {
  const beforeOgUrl = html;
  html = setMeta(html, "property", "og:url", "content", siteUrl);
  if (html !== beforeOgUrl) changes.push("meta[property=og:url] updated");
}

const beforeTwCard = html;
html = setMeta(html, "name", "twitter:card", "content", "summary_large_image");
if (html !== beforeTwCard) changes.push("meta[name=twitter:card] updated");

if (twitterHandle) {
  const beforeTwSite = html;
  html = setMeta(html, "name", "twitter:site", "content", twitterHandle);
  if (html !== beforeTwSite) changes.push("meta[name=twitter:site] updated");
}

writeFileSync(indexHtmlPath, html, "utf-8");
console.log(`\nindex.html:`);
changes.forEach((c) => console.log(`  ✓ ${c}`));
if (changes.length === 0) console.log("  (already up to date)");

// ---------- package.json ----------
const pkgPath = join(projectPath, "package.json");
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  console.log(`\npackage.json:`);
  if (isPlaceholderName(pkg.name)) {
    const slug = slugify(siteName);
    pkg.name = slug;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    console.log(`  ✓ "name" set to "${slug}"`);
  } else {
    console.log(
      `  • "name" is already "${pkg.name}" (not a known placeholder) — left untouched. ` +
        `If this should change, update it manually.`
    );
  }
}

// ---------- public/manifest.json ----------
const manifestPath = join(projectPath, "public", "manifest.json");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  console.log(`\npublic/manifest.json:`);
  let touched = false;
  if (isPlaceholderName(manifest.name)) {
    manifest.name = siteName;
    touched = true;
    console.log(`  ✓ "name" set to "${siteName}"`);
  } else {
    console.log(`  • "name" is already "${manifest.name}" — left untouched.`);
  }
  if (isPlaceholderName(manifest.short_name)) {
    manifest.short_name = siteName.length > 12 ? siteName.slice(0, 12) : siteName;
    touched = true;
    console.log(`  ✓ "short_name" set to "${manifest.short_name}"`);
  } else {
    console.log(`  • "short_name" is already "${manifest.short_name}" — left untouched.`);
  }
  if (touched) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  }
} else {
  console.log(`\npublic/manifest.json: not present — skipped.`);
}

console.log(`\nDone. Run "node scripts/audit.mjs ${projectPath}" to verify.\n`);
