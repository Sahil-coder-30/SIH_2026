#!/usr/bin/env node
/**
 * validate_readme.js
 * Zero-dependency compliance checker for the Microservice README Architect standard.
 *
 * Usage:
 *   node validate_readme.js <path-to-README.md>          Check a single file
 *   node validate_readme.js <path-to-directory>          Check every README*.md found under a directory,
 *                                                         plus cross-service header consistency
 *   node validate_readme.js <path> --json                Machine-readable output (for agents/CI)
 *   node validate_readme.js --help
 *
 * Exit codes: 0 = pass, 1 = fail, 2 = usage error.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = [
  { id: 'overview_why', label: 'Overview & The "Why"', keywordGroups: [['overview'], ['why']] },
  { id: 'built_features', label: 'Built Features & Current State', keywordGroups: [['built', 'feature'], ['current', 'state']] },
  { id: 'architecture', label: 'Architecture & Design Patterns', keywordGroups: [['architecture'], ['design', 'pattern']] },
  { id: 'usage_setup', label: 'Usage & Setup', keywordGroups: [['usage'], ['setup']] },
  { id: 'communication', label: 'Communication & Contracts', keywordGroups: [['communication'], ['contract']] },
  { id: 'production', label: 'Production Readiness', keywordGroups: [['production'], ['readiness']] },
  { id: 'changelog', label: 'Changelog & Migration State', keywordGroups: [['changelog']] },
];

const SAFE_VALUE_MARKERS = [
  'insert', 'example', 'changeme', 'change-me', 'your-', 'yourkey', 'xxxx',
  'fake', 'replace', 'placeholder', 'redacted', '<', '[', 'dummy', 'test-value',
  'vault', 'secret_manager', 'secretsmanager', 'not-a-real', 'sample',
];

const PLACEHOLDER_RE = /\[Insert[^\]\n]{0,200}\]/gi;
const SEMVER_RE = /\bv?\d+\.\d+\.\d+\b/;
const AWS_KEY_RE = /AKIA[0-9A-Z]{16}/;
const PRIVATE_KEY_RE = /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;
const SECRET_LINE_RE = /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|TOKEN)[A-Z0-9_]*)\s*[:=|]\s*[`'"]?([A-Za-z0-9+/=_\-.]{20,})[`'"]?/gi;

function stripHeader(line) {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .toLowerCase()
    .trim();
}

function findHeadings(content) {
  return content
    .split('\n')
    .filter((l) => /^#{1,6}\s/.test(l))
    .map((l) => ({ raw: l, normalized: stripHeader(l), level: (l.match(/^#+/) || [''])[0].length }));
}

function sectionBody(content, headingRaw) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l === headingRaw);
  if (startIdx === -1) return '';
  const startLevel = (headingRaw.match(/^#+/) || [''])[0].length;
  let end = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= startLevel) { end = i; break; }
  }
  return lines.slice(startIdx + 1, end).join('\n');
}

function checkRequiredSections(content, headings) {
  return REQUIRED_SECTIONS.map((section) => {
    const match = headings.find((h) =>
      section.keywordGroups.every((group) => group.some((kw) => h.normalized.includes(kw)))
    );
    let stub = false;
    if (match) {
      const body = sectionBody(content, match.raw).trim();
      const wordCount = body.split(/\s+/).filter(Boolean).length;
      stub = wordCount < 8;
    }
    return {
      id: section.id,
      label: section.label,
      passed: !!match,
      critical: false,
      note: match
        ? (stub ? 'Present, but reads as a stub (very little content) — check it was actually filled in.' : 'Present.')
        : `Missing. Expected a heading covering: ${section.keywordGroups.map((g) => g.join('/')).join(' + ')}.`,
    };
  });
}

function checkPlaceholders(content) {
  const matches = content.match(PLACEHOLDER_RE) || [];
  const passed = matches.length === 0;
  return {
    id: 'placeholders',
    label: 'No leftover [Insert ...] placeholders',
    passed,
    critical: true,
    note: passed
      ? 'Clean — no template placeholders remain.'
      : `${matches.length} placeholder(s) remain, e.g.: ${matches.slice(0, 5).join(' | ')}${matches.length > 5 ? ' ...' : ''}`,
  };
}

function checkSemver(content) {
  const passed = SEMVER_RE.test(content);
  return {
    id: 'semver',
    label: 'Version follows SemVer (x.y.z)',
    passed,
    critical: false,
    note: passed ? 'Found a SemVer-shaped version string.' : 'No SemVer-shaped version string (e.g. 1.4.0) found anywhere in the document.',
  };
}

function checkHealthChecks(content) {
  const hasHealthz = /\/healthz\b/i.test(content);
  const hasReady = /\/ready\b/i.test(content);
  const passed = hasHealthz && hasReady;
  const missing = [];
  if (!hasHealthz) missing.push('/healthz');
  if (!hasReady) missing.push('/ready');
  return {
    id: 'health_checks',
    label: 'Documents /healthz and /ready',
    passed,
    critical: false,
    note: passed ? 'Both liveness and readiness endpoints are documented.' : `Missing: ${missing.join(', ')}.`,
  };
}

function checkEnvTable(content) {
  const idx = content.toLowerCase().indexOf('environment variable');
  if (idx === -1) {
    return { id: 'env_table', label: 'Environment variable table present', passed: false, critical: false, note: 'No "Environment Variables" section found.' };
  }
  const slice = content.slice(idx, idx + 2000);
  const tableRows = (slice.match(/^\|.*\|$/gm) || []).length;
  const hasRequiredColumn = /required/i.test(slice.split('\n').slice(0, 4).join('\n'));
  const passed = tableRows >= 2 && hasRequiredColumn;
  return {
    id: 'env_table',
    label: 'Environment variable table present with a Required column',
    passed,
    critical: false,
    note: passed ? 'Found a populated env var table.' : 'Env var section exists but no populated table with a "Required" column was detected.',
  };
}

function checkRunLocallyCodeBlock(content) {
  const idx = content.toLowerCase().indexOf('run locally');
  if (idx === -1) {
    return { id: 'run_locally', label: '"Run Locally" has an actual command block', passed: false, critical: false, note: 'No "Run Locally" section found.' };
  }
  const slice = content.slice(idx, idx + 1500);
  const hasCodeBlock = /```[a-z]*\n[\s\S]*?```/i.test(slice);
  return {
    id: 'run_locally',
    label: '"Run Locally" has an actual command block',
    passed: hasCodeBlock,
    critical: false,
    note: hasCodeBlock ? 'Found a fenced command block.' : 'No fenced code block with real commands found under "Run Locally".',
  };
}

function checkSecretLeakage(content) {
  const findings = [];
  if (AWS_KEY_RE.test(content)) findings.push('a string matching an AWS access key ID pattern (AKIA...)');
  if (PRIVATE_KEY_RE.test(content)) findings.push('a private key block header');

  let m;
  const re = new RegExp(SECRET_LINE_RE.source, 'gi');
  while ((m = re.exec(content)) !== null) {
    const value = m[2];
    const lower = value.toLowerCase();
    const looksSafe = SAFE_VALUE_MARKERS.some((marker) => lower.includes(marker));
    if (!looksSafe) {
      findings.push(`"${m[1]}" set to a value that doesn't look like a placeholder (starts: ${value.slice(0, 6)}...)`);
    }
  }

  const passed = findings.length === 0;
  return {
    id: 'secret_leakage',
    label: 'No apparent real secrets committed',
    passed,
    critical: true,
    note: passed
      ? 'No obvious secret-shaped values found.'
      : `Possible leaked secret(s): ${findings.slice(0, 5).join('; ')}. This is a heuristic scan, not a guarantee — review manually either way.`,
  };
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const headings = findHeadings(content);

  const checks = [
    ...checkRequiredSections(content, headings),
    checkPlaceholders(content),
    checkSemver(content),
    checkHealthChecks(content),
    checkEnvTable(content),
    checkRunLocallyCodeBlock(content),
    checkSecretLeakage(content),
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const criticalFailure = checks.some((c) => c.critical && !c.passed);
  const verdict = criticalFailure ? 'FAIL' : score === 100 ? 'PASS' : score >= 85 ? 'PASS (minor gaps)' : 'FAIL';

  return {
    file: filePath,
    score,
    verdict,
    passed: !criticalFailure && score >= 85,
    checks,
    headingSet: REQUIRED_SECTIONS.filter((s) =>
      headings.some((h) => s.keywordGroups.every((group) => group.some((kw) => h.normalized.includes(kw))))
    ).map((s) => s.id),
  };
}

function printHumanReport(result) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`README: ${result.file}`);
  console.log(`Score: ${result.score}%  —  ${result.verdict}`);
  console.log('='.repeat(70));
  for (const c of result.checks) {
    const mark = c.passed ? '✅' : c.critical ? '❌' : '⚠️ ';
    console.log(`${mark} ${c.label}`);
    if (!c.passed) console.log(`    ${c.note}`);
  }
  console.log('');
}

function findReadmeFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findReadmeFiles(full));
    } else if (/^readme.*\.md$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function checkCrossServiceConsistency(results) {
  const sets = results.map((r) => r.headingSet.slice().sort().join(','));
  const uniqueSets = new Set(sets);
  return {
    consistent: uniqueSets.size <= 1,
    note: uniqueSets.size <= 1
      ? 'Every service documents the same set of required sections.'
      : 'Services do not all document the same set of required sections — some services are missing sections others have. Check the per-file reports above.',
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(__filename.split('/').pop());
    console.log('Usage:');
    console.log('  node validate_readme.js <path-to-README.md>');
    console.log('  node validate_readme.js <path-to-directory>   # checks every README*.md + cross-service consistency');
    console.log('  node validate_readme.js <path> --json         # machine-readable output');
    process.exit(0);
  }

  const jsonMode = args.includes('--json');
  const target = args.find((a) => !a.startsWith('--'));

  if (!target || !fs.existsSync(target)) {
    console.error(`Error: path not found: ${target}`);
    process.exit(2);
  }

  const stat = fs.statSync(target);
  let results;
  let files;

  if (stat.isDirectory()) {
    files = findReadmeFiles(target);
    if (files.length === 0) {
      console.error(`No README*.md files found under ${target}`);
      process.exit(2);
    }
    results = files.map(validateFile);
  } else {
    files = [target];
    results = [validateFile(target)];
  }

  let crossCheck = null;
  if (stat.isDirectory()) {
    crossCheck = checkCrossServiceConsistency(results);
  }

  if (jsonMode) {
    console.log(JSON.stringify({ results, crossServiceConsistency: crossCheck }, null, 2));
  } else {
    for (const r of results) printHumanReport(r);
    if (crossCheck) {
      console.log('='.repeat(70));
      console.log(`Cross-service consistency: ${crossCheck.consistent ? '✅' : '⚠️ '} ${crossCheck.note}`);
      console.log('='.repeat(70));
    }
    const overallPass = results.every((r) => r.passed) && (!crossCheck || crossCheck.consistent);
    console.log(`\nOverall: ${overallPass ? 'PASS ✅' : 'FAIL ❌'} (${results.length} file(s) checked)`);
  }

  const overallPass = results.every((r) => r.passed) && (!crossCheck || crossCheck.consistent);
  process.exit(overallPass ? 0 : 1);
}

main();
