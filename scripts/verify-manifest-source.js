#!/usr/bin/env node

// Verify that all Radzor component manifests match their actual source code.
// Checks: exported class, action methods, event string literals.

const fs = require("fs");
const path = require("path");

const COMPONENTS_DIR = path.resolve(__dirname, "..");

// Directories to skip
const SKIP_DIRS = new Set([
  ".git",
  ".github",
  "node_modules",
  "scripts",
  "spec",
  "test",
]);

// Convert slug like "ab-test" to PascalCase "AbTest"
function slugToPascalCase(slug) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// Extract the slug from manifest name like "@radzor/ab-test" -> "ab-test"
function extractSlug(manifestName) {
  const match = manifestName.match(/@radzor\/(.+)/);
  return match ? match[1] : manifestName;
}

function verifyComponent(dirName) {
  const componentDir = path.join(COMPONENTS_DIR, dirName);
  const manifestPath = path.join(componentDir, "radzor.manifest.json");
  const sourcePath = path.join(componentDir, "src", "index.ts");

  if (!fs.existsSync(manifestPath)) {
    return { name: dirName, skipped: true, reason: "No radzor.manifest.json" };
  }
  if (!fs.existsSync(sourcePath)) {
    return { name: dirName, skipped: true, reason: "No src/index.ts" };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const source = fs.readFileSync(sourcePath, "utf-8");

  const issues = [];

  // 1. Determine expected class name
  const slug = extractSlug(manifest.name);
  const expectedClassName = slugToPascalCase(slug);

  // 2. Check for class export
  const classExportRegex = new RegExp(
    `export\\s+(default\\s+)?class\\s+${expectedClassName}\\b`
  );
  const anyClassExportRegex = /export\s+(default\s+)?class\s+(\w+)/;
  const defaultExportRegex = /export\s+default\s+\w+/;

  if (!classExportRegex.test(source)) {
    // Check if there's any class exported at all
    const anyMatch = source.match(anyClassExportRegex);
    if (anyMatch) {
      issues.push(
        `Class name mismatch: expected "${expectedClassName}", found "${anyMatch[2]}"`
      );
    } else if (!defaultExportRegex.test(source)) {
      issues.push(`Missing export default class (expected "${expectedClassName}")`);
    } else {
      // There's a default export but not as a class declaration
      // Check if the class exists and is exported default separately
      const classRegex = new RegExp(`class\\s+${expectedClassName}\\b`);
      const exportDefaultLine = new RegExp(
        `export\\s+default\\s+${expectedClassName}\\b`
      );
      if (!classRegex.test(source)) {
        const anyClassMatch = source.match(/class\s+(\w+)/);
        if (anyClassMatch) {
          issues.push(
            `Class name mismatch: expected "${expectedClassName}", found "${anyClassMatch[1]}"`
          );
        } else {
          issues.push(
            `Missing class definition (expected "${expectedClassName}")`
          );
        }
      }
    }
  }

  // 3. Check actions exist as methods
  const actions = manifest.actions || [];
  for (const action of actions) {
    const actionName = action.name;
    // Look for method patterns: `methodName(`, `async methodName(`, or property assignment
    const methodRegex = new RegExp(
      `(?:async\\s+)?${escapeRegex(actionName)}\\s*[(<]`
    );
    if (!methodRegex.test(source)) {
      issues.push(`Action "${actionName}" declared in manifest but NOT found as method in source`);
    }
  }

  // 4. Check events exist as string literals
  const events = manifest.events || [];
  for (const event of events) {
    const eventName = event.name;
    // Look for the event name in quotes (single, double, or backtick)
    const eventRegex = new RegExp(
      `["'\`]${escapeRegex(eventName)}["'\`]`
    );
    if (!eventRegex.test(source)) {
      issues.push(`Event "${eventName}" declared in manifest but NOT found as string literal in source`);
    }
  }

  return { name: dirName, issues };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Main ─────────────────────────────────────────────────

function main() {
  const entries = fs.readdirSync(COMPONENTS_DIR, { withFileTypes: true });
  const componentDirs = entries
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();

  let totalChecked = 0;
  let totalClean = 0;
  let totalWithIssues = 0;
  const allMismatches = [];
  const skipped = [];

  for (const dirName of componentDirs) {
    const result = verifyComponent(dirName);

    if (result.skipped) {
      skipped.push(result);
      continue;
    }

    totalChecked++;

    if (result.issues.length === 0) {
      totalClean++;
    } else {
      totalWithIssues++;
      allMismatches.push(result);
    }
  }

  // ─── Report ─────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("RADZOR MANIFEST ↔ SOURCE VERIFICATION REPORT");
  console.log("=".repeat(70));
  console.log();
  console.log(`Total components checked: ${totalChecked}`);
  console.log(`Clean (no issues):        ${totalClean}`);
  console.log(`With mismatches:          ${totalWithIssues}`);

  if (skipped.length > 0) {
    console.log(`Skipped:                  ${skipped.length}`);
    for (const s of skipped) {
      console.log(`  - ${s.name}: ${s.reason}`);
    }
  }

  console.log();

  if (allMismatches.length === 0) {
    console.log("✓ All components pass verification!");
  } else {
    console.log("MISMATCHES FOUND:");
    console.log("-".repeat(70));
    for (const entry of allMismatches) {
      console.log();
      console.log(`Component: ${entry.name}`);
      for (const issue of entry.issues) {
        console.log(`  ✗ ${issue}`);
      }
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log(
    `SUMMARY: ${totalWithIssues} of ${totalChecked} components have issues, ${totalClean} are clean.`
  );
  console.log("=".repeat(70));
}

main();
