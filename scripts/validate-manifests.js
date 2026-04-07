#!/usr/bin/env node
/**
 * Validates all component manifests against the RCS schema.
 * Used by CI and locally via: node scripts/validate-manifests.js
 *
 * Exit code 0 = all valid, 1 = errors found.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = process.env.SCHEMA_PATH
  || path.join(ROOT, "spec", "radzor-manifest.schema.json");
const COMPONENTS_DIR = ROOT;

if (!fs.existsSync(SCHEMA_PATH)) {
  console.error("✗ Schema not found at " + SCHEMA_PATH);
  console.error("  Set SCHEMA_PATH env var or run: mkdir -p spec && curl -fsSL https://raw.githubusercontent.com/radzor-io/spec/main/radzor-manifest.schema.json -o spec/radzor-manifest.schema.json");
  process.exit(1);
}

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));
const validCategories = schema.properties.category.enum;
const requiredFields = schema.required;
const allowedTopLevel = Object.keys(schema.properties);

const errors = [];
const warnings = [];
let checked = 0;

const dirs = fs
  .readdirSync(COMPONENTS_DIR)
  .filter((d) => {
    const full = path.join(COMPONENTS_DIR, d);
    return (
      fs.statSync(full).isDirectory() &&
      !d.startsWith(".") &&
      d !== "scripts" &&
      d !== "node_modules" &&
      d !== "spec"
    );
  })
  .sort();

for (const dir of dirs) {
  const manifestPath = path.join(COMPONENTS_DIR, dir, "radzor.manifest.json");
  const prefix = `[${dir}]`;

  // ── Manifest file exists & parses ──
  if (!fs.existsSync(manifestPath)) {
    errors.push(`${prefix} Missing radzor.manifest.json`);
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (e) {
    errors.push(`${prefix} Invalid JSON: ${e.message}`);
    continue;
  }

  checked++;

  // ── Required fields ──
  for (const field of requiredFields) {
    if (!(field in manifest)) {
      errors.push(`${prefix} Missing required field: ${field}`);
    }
  }

  // ── radzor spec version ──
  if (manifest.radzor && !/^\d+\.\d+\.\d+$/.test(manifest.radzor)) {
    errors.push(`${prefix} Invalid radzor spec version: "${manifest.radzor}"`);
  }

  // ── name: scoped package, matches directory ──
  if (manifest.name) {
    if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(manifest.name)) {
      errors.push(`${prefix} Invalid name pattern: "${manifest.name}"`);
    }
    const slug = manifest.name.replace(/^@[^/]+\//, "");
    if (slug !== dir) {
      errors.push(`${prefix} Name slug "${slug}" doesn't match directory "${dir}"`);
    }
  }

  // ── version ──
  if (manifest.version && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(manifest.version)) {
    errors.push(`${prefix} Invalid semver version: "${manifest.version}"`);
  }

  // ── category enum ──
  if (manifest.category && !validCategories.includes(manifest.category)) {
    errors.push(`${prefix} Invalid category: "${manifest.category}". Must be one of: ${validCategories.join(", ")}`);
  }

  // ── description length ──
  if (manifest.description) {
    if (manifest.description.length < 10) errors.push(`${prefix} Description too short (min 10 chars)`);
    if (manifest.description.length > 500) errors.push(`${prefix} Description too long (max 500 chars)`);
  }

  // ── languages ──
  if (manifest.languages && (!Array.isArray(manifest.languages) || manifest.languages.length === 0)) {
    errors.push(`${prefix} languages must be a non-empty array`);
  }

  // ── tags ──
  if (manifest.tags) {
    if (!Array.isArray(manifest.tags)) {
      errors.push(`${prefix} tags must be an array`);
    } else {
      if (manifest.tags.length > 10) errors.push(`${prefix} Too many tags (max 10)`);
      for (const tag of manifest.tags) {
        if (typeof tag !== "string") errors.push(`${prefix} Tag is not a string: ${JSON.stringify(tag)}`);
        else if (tag.length > 30) errors.push(`${prefix} Tag too long (max 30 chars): "${tag}"`);
      }
    }
  }

  // ── inputs / outputs (parameter validation) ──
  for (const section of ["inputs", "outputs"]) {
    if (!manifest[section]) continue;
    if (!Array.isArray(manifest[section])) {
      errors.push(`${prefix} ${section} must be an array`);
      continue;
    }
    const allowedParam = ["name", "type", "description", "default", "required"];
    manifest[section].forEach((item, i) => {
      if (!item.name) errors.push(`${prefix} ${section}[${i}] missing name`);
      if (!item.type) errors.push(`${prefix} ${section}[${i}] missing type`);
      if (!item.description) errors.push(`${prefix} ${section}[${i}] missing description`);
      if (item.name && !/^[a-zA-Z][a-zA-Z0-9]*$/.test(item.name)) {
        errors.push(`${prefix} ${section}[${i}] invalid name: "${item.name}"`);
      }
      for (const k of Object.keys(item)) {
        if (!allowedParam.includes(k)) errors.push(`${prefix} ${section}[${i}] unknown property: "${k}"`);
      }
    });
  }

  // ── events ──
  if (manifest.events) {
    if (!Array.isArray(manifest.events)) {
      errors.push(`${prefix} events must be an array`);
    } else {
      const allowedEvt = ["name", "payload", "description"];
      manifest.events.forEach((evt, i) => {
        if (!evt.name) errors.push(`${prefix} events[${i}] missing name`);
        if (!evt.description) errors.push(`${prefix} events[${i}] missing description`);
        if (evt.name && !/^on[A-Z][a-zA-Z]*$/.test(evt.name)) {
          errors.push(`${prefix} events[${i}] invalid name (must match on[A-Z]...): "${evt.name}"`);
        }
        for (const k of Object.keys(evt)) {
          if (!allowedEvt.includes(k)) errors.push(`${prefix} events[${i}] unknown property: "${k}"`);
        }
      });
    }
  }

  // ── actions ──
  if (manifest.actions) {
    if (!Array.isArray(manifest.actions)) {
      errors.push(`${prefix} actions must be an array`);
    } else {
      const allowedAct = ["name", "params", "returns", "description"];
      const allowedParam = ["name", "type", "description", "default", "required"];
      manifest.actions.forEach((act, i) => {
        if (!act.name) errors.push(`${prefix} actions[${i}] missing name`);
        if (!act.description) errors.push(`${prefix} actions[${i}] missing description`);
        if (act.name && !/^[a-z][a-zA-Z0-9]*$/.test(act.name)) {
          errors.push(`${prefix} actions[${i}] invalid name (must start lowercase): "${act.name}"`);
        }
        for (const k of Object.keys(act)) {
          if (!allowedAct.includes(k)) errors.push(`${prefix} actions[${i}] unknown property: "${k}"`);
        }
        if (act.params && Array.isArray(act.params)) {
          act.params.forEach((p, pi) => {
            if (!p.name) errors.push(`${prefix} actions[${i}].params[${pi}] missing name`);
            if (!p.type) errors.push(`${prefix} actions[${i}].params[${pi}] missing type`);
            if (!p.description) errors.push(`${prefix} actions[${i}].params[${pi}] missing description`);
            if (p.name && !/^[a-zA-Z][a-zA-Z0-9]*$/.test(p.name)) {
              errors.push(`${prefix} actions[${i}].params[${pi}] invalid name: "${p.name}"`);
            }
            for (const k of Object.keys(p)) {
              if (!allowedParam.includes(k)) errors.push(`${prefix} actions[${i}].params[${pi}] unknown property: "${k}"`);
            }
          });
        }
      });
    }
  }

  // ── dependencies ──
  if (manifest.dependencies) {
    const allowedDeps = ["packages", "radzor"];
    for (const k of Object.keys(manifest.dependencies)) {
      if (!allowedDeps.includes(k)) errors.push(`${prefix} dependencies unknown property: "${k}"`);
    }
    if (manifest.dependencies.radzor) {
      if (!Array.isArray(manifest.dependencies.radzor)) {
        errors.push(`${prefix} dependencies.radzor must be an array`);
      } else {
        manifest.dependencies.radzor.forEach((r, i) => {
          if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(r)) {
            errors.push(`${prefix} dependencies.radzor[${i}] invalid: "${r}"`);
          }
        });
      }
    }
  }

  // ── composability ──
  if (manifest.composability && manifest.composability.connectsTo) {
    if (!Array.isArray(manifest.composability.connectsTo)) {
      errors.push(`${prefix} composability.connectsTo must be an array`);
    } else {
      const allowedConn = ["output", "compatibleWith"];
      manifest.composability.connectsTo.forEach((conn, i) => {
        if (!conn.output) errors.push(`${prefix} composability.connectsTo[${i}] missing output`);
        if (!conn.compatibleWith) errors.push(`${prefix} composability.connectsTo[${i}] missing compatibleWith`);
        for (const k of Object.keys(conn)) {
          if (!allowedConn.includes(k)) errors.push(`${prefix} composability.connectsTo[${i}] unknown property: "${k}"`);
        }
      });
    }
  }

  // ── llm metadata ──
  if (manifest.llm) {
    const allowedLlm = ["integrationPrompt", "usageExamples", "constraints"];
    for (const k of Object.keys(manifest.llm)) {
      if (!allowedLlm.includes(k)) errors.push(`${prefix} llm unknown property: "${k}"`);
    }
    if (manifest.llm.integrationPrompt) {
      const p = path.join(COMPONENTS_DIR, dir, manifest.llm.integrationPrompt);
      if (!fs.existsSync(p)) errors.push(`${prefix} llm.integrationPrompt file not found: ${manifest.llm.integrationPrompt}`);
    }
    if (manifest.llm.usageExamples) {
      const p = path.join(COMPONENTS_DIR, dir, manifest.llm.usageExamples);
      if (!fs.existsSync(p)) errors.push(`${prefix} llm.usageExamples file not found: ${manifest.llm.usageExamples}`);
    }
  }

  // ── Extra top-level properties ──
  for (const k of Object.keys(manifest)) {
    if (!allowedTopLevel.includes(k)) {
      errors.push(`${prefix} Unknown top-level property: "${k}"`);
    }
  }

  // ── src/ directory ──
  const srcDir = path.join(COMPONENTS_DIR, dir, "src");
  if (!fs.existsSync(srcDir)) {
    errors.push(`${prefix} Missing src/ directory`);
  } else if (fs.readdirSync(srcDir).length === 0) {
    errors.push(`${prefix} src/ directory is empty`);
  }
}

// ── Report ──
console.log(`\nValidated ${checked} component manifests\n`);

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  ⚠  ${w}`);
  console.log();
}

if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const e of errors) console.log(`  ✗  ${e}`);
  console.log();
  process.exit(1);
}

console.log("✓ All manifests are valid");
