#!/usr/bin/env node
// ts-compile-check.js — Structural TypeScript validation for all Radzor components

const fs = require("fs");
const path = require("path");

const COMPONENTS_DIR = path.resolve(__dirname, "..");

const EXCLUDE = new Set([
  ".git",
  ".github",
  "node_modules",
  "scripts",
  "spec",
  "test",
]);

// ── helpers ──────────────────────────────────────────────────────────

function isComponentDir(entry) {
  if (EXCLUDE.has(entry)) return false;
  const full = path.join(COMPONENTS_DIR, entry);
  try {
    return fs.statSync(full).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Bracket / brace / paren balance check.
 * Returns null on success or a description string on failure.
 */
function checkBracketBalance(source) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const closers = new Set([")", "]", "}"]);
  const stack = [];
  let inString = null; // null | '"' | "'" | '`'
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    // handle escape inside strings
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }

    // string state tracking
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }

    // skip single-line comments
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    // skip multi-line comments
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    if (pairs[ch]) {
      stack.push({ open: ch, expected: pairs[ch], pos: i });
    } else if (closers.has(ch)) {
      if (stack.length === 0) {
        const line = source.slice(0, i).split("\n").length;
        return `unexpected '${ch}' at line ${line}`;
      }
      const top = stack.pop();
      if (top.expected !== ch) {
        const line = source.slice(0, i).split("\n").length;
        return `mismatched bracket: expected '${top.expected}' but got '${ch}' at line ${line}`;
      }
    }
  }

  if (inString) {
    return `unterminated string literal (opened with ${inString})`;
  }
  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    const line = source.slice(0, top.pos).split("\n").length;
    return `unclosed '${top.open}' opened at line ${line}`;
  }
  return null;
}

// ── main ─────────────────────────────────────────────────────────────

function main() {
  const entries = fs.readdirSync(COMPONENTS_DIR).filter(isComponentDir).sort();

  const results = [];
  let passCount = 0;
  let failCount = 0;

  for (const name of entries) {
    const srcFile = path.join(COMPONENTS_DIR, name, "src", "index.ts");
    const errors = [];

    // 1. File existence
    if (!fs.existsSync(srcFile)) {
      errors.push("src/index.ts not found");
      results.push({ name, errors });
      failCount++;
      continue;
    }

    // 2. Read file
    const source = fs.readFileSync(srcFile, "utf-8");

    // 3. Empty file
    if (source.trim().length === 0) {
      errors.push("src/index.ts is empty");
      results.push({ name, errors });
      failCount++;
      continue;
    }

    // 4. First-line comment: // @radzor/<slug>
    const firstLine = source.split("\n")[0];
    const commentPattern = new RegExp(
      `^//\\s*@radzor/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`
    );
    if (!commentPattern.test(firstLine)) {
      errors.push(
        `first-line comment missing or wrong (expected "// @radzor/${name} …", got "${firstLine.slice(0, 60)}")`
      );
    }

    // 5. Export check: must have `export default` or `export class`
    const hasExportDefault = /export\s+default\b/.test(source);
    const hasExportClass = /export\s+class\b/.test(source);
    if (!hasExportDefault && !hasExportClass) {
      errors.push("no `export default` or `export class` found");
    }

    // 6. Bracket balance
    const bracketErr = checkBracketBalance(source);
    if (bracketErr) {
      errors.push(`bracket/syntax error: ${bracketErr}`);
    }

    // 7. Duplicate class declarations (same name)
    const classNames = [...source.matchAll(/export\s+class\s+(\w+)/g)].map(
      (m) => m[1]
    );
    const seen = new Set();
    for (const cn of classNames) {
      if (seen.has(cn)) {
        errors.push(`duplicate export class "${cn}"`);
      }
      seen.add(cn);
    }

    // Record
    if (errors.length > 0) {
      failCount++;
      results.push({ name, errors });
    } else {
      passCount++;
    }
  }

  // ── report ───────────────────────────────────────────────────────

  const total = entries.length;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Radzor Component TypeScript Structural Check");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log(`  Components scanned: ${total}`);
  console.log(`  Passed:             ${passCount}`);
  console.log(`  Failed:             ${failCount}\n`);

  if (results.length > 0) {
    console.log("───────────────────────────────────────────────────────");
    console.log("  Errors\n");
    for (const r of results) {
      for (const e of r.errors) {
        console.log(`  ✗ ${r.name}: ${e}`);
      }
    }
    console.log("");
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log(
    failCount === 0
      ? "  Result: ALL PASS ✓"
      : `  Result: ${failCount} FAILURE(S)`
  );
  console.log("═══════════════════════════════════════════════════════");

  process.exit(failCount > 0 ? 1 : 0);
}

main();
