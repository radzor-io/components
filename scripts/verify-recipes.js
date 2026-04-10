#!/usr/bin/env node
/**
 * Verifies all recipes defined in platform/src/lib/recipes.ts against
 * actual component source code in this repository.
 *
 * Checks:
 *   1. Each recipe step's slug corresponds to an existing component directory
 *   2. Each step's class name matches the exported class in src/index.ts
 *   3. Methods called in wiring code exist in the component source
 *   4. Events used in .on("eventName", ...) exist in the component's EventMap
 *
 * Exit code 0 = all valid, 1 = issues found.
 *
 * Usage:  node scripts/verify-recipes.js
 */

const fs = require("fs");
const path = require("path");

const COMPONENTS_DIR = path.resolve(__dirname, "..");
const RECIPES_PATH = path.resolve(
  __dirname,
  "../../platform/src/lib/recipes.ts"
);

// ─── Parse recipes.ts ───────────────────────────────────────

function parseRecipes() {
  const src = fs.readFileSync(RECIPES_PATH, "utf-8");

  // Extract the RECIPES array body by finding the opening bracket and
  // matching it to its closing bracket (accounting for nesting).
  const marker = "export const RECIPES: Recipe[] = [";
  const start = src.indexOf(marker);
  if (start === -1) throw new Error("Could not find RECIPES array in recipes.ts");

  let depth = 0;
  let arrayStart = -1;
  let arrayEnd = -1;
  for (let i = start + marker.length - 1; i < src.length; i++) {
    if (src[i] === "[") {
      if (depth === 0) arrayStart = i;
      depth++;
    } else if (src[i] === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i;
        break;
      }
    }
  }
  if (arrayEnd === -1) throw new Error("Could not find end of RECIPES array");

  const arrayBody = src.slice(arrayStart + 1, arrayEnd);

  // Split into individual recipe object blocks. Each recipe starts with
  // an opening `{` at top-level depth inside the array.
  const recipes = [];
  depth = 0;
  let blockStart = -1;
  for (let i = 0; i < arrayBody.length; i++) {
    const ch = arrayBody[i];
    if (ch === "{" || ch === "[") {
      if (ch === "{" && depth === 0) blockStart = i;
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (ch === "}" && depth === 0 && blockStart !== -1) {
        recipes.push(arrayBody.slice(blockStart, i + 1));
        blockStart = -1;
      }
    }
    // skip template literal bodies to avoid false nesting
    if (ch === "`") {
      i++;
      while (i < arrayBody.length) {
        if (arrayBody[i] === "\\" ) { i++; } // skip escaped char
        else if (arrayBody[i] === "`") break;
        else if (arrayBody[i] === "$" && arrayBody[i + 1] === "{") {
          // skip template expression — track nested braces
          i += 2;
          let exprDepth = 1;
          while (i < arrayBody.length && exprDepth > 0) {
            if (arrayBody[i] === "{") exprDepth++;
            else if (arrayBody[i] === "}") exprDepth--;
            if (exprDepth > 0) i++;
          }
        }
        i++;
      }
    }
  }

  return recipes.map(parseRecipeBlock);
}

function parseRecipeBlock(block) {
  const recipe = {};

  // slug
  const slugMatch = block.match(/slug:\s*"([^"]+)"/);
  recipe.slug = slugMatch ? slugMatch[1] : "unknown";

  // steps — extract array of { slug, name }
  recipe.steps = [];
  const stepsMatch = block.match(/steps:\s*\[/);
  if (stepsMatch) {
    const stepsStart = block.indexOf(stepsMatch[0]) + stepsMatch[0].length;
    // Find matching close bracket
    let depth = 1;
    let stepsEnd = stepsStart;
    for (let i = stepsStart; i < block.length; i++) {
      if (block[i] === "[") depth++;
      else if (block[i] === "]") { depth--; if (depth === 0) { stepsEnd = i; break; } }
    }
    const stepsBody = block.slice(stepsStart, stepsEnd);
    // Extract each step's slug and name
    const stepRegex = /slug:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"/g;
    let m;
    while ((m = stepRegex.exec(stepsBody)) !== null) {
      recipe.steps.push({ slug: m[1], name: m[2] });
    }
  }

  // wiring — extract the template literal
  recipe.wiring = "";
  const wiringIdx = block.indexOf("wiring: `");
  if (wiringIdx !== -1) {
    let i = wiringIdx + "wiring: `".length;
    let wiring = "";
    while (i < block.length) {
      if (block[i] === "\\" ) {
        wiring += block[i] + (block[i + 1] || "");
        i += 2;
        continue;
      }
      if (block[i] === "$" && block[i + 1] === "{") {
        // template expression — consume it
        wiring += "${";
        i += 2;
        let d = 1;
        while (i < block.length && d > 0) {
          if (block[i] === "{") d++;
          else if (block[i] === "}") d--;
          if (d > 0) { wiring += block[i]; i++; }
        }
        wiring += "}";
        i++; // skip closing }
        continue;
      }
      if (block[i] === "`") break;
      wiring += block[i];
      i++;
    }
    recipe.wiring = wiring;
  }

  return recipe;
}

// ─── Read component source files ────────────────────────────

/**
 * Returns the full text of a component's src/index.ts.
 * Returns null if not found.
 */
function readComponentSource(slug) {
  const p = path.join(COMPONENTS_DIR, slug, "src", "index.ts");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf-8");
}

/**
 * Returns the parsed manifest JSON for a component.
 * Returns null if not found.
 */
function readManifest(slug) {
  const p = path.join(COMPONENTS_DIR, slug, "radzor.manifest.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// ─── Extract info from source ───────────────────────────────

/** Returns the class name of the exported class in src/index.ts */
function getExportedClassName(source) {
  const m = source.match(/export\s+class\s+(\w+)/);
  return m ? m[1] : null;
}

/** Returns a Set of method names defined on the class (public, not on/off/emit, not private, not constructor) */
function getClassMethods(source) {
  const methods = new Set();

  // Match method definitions: must be at class body level, not private, not constructor.
  // Patterns:
  //   methodName(params): returnType {
  //   async methodName(params): returnType {
  //   methodName<T>(params): returnType {
  //   async methodName<T extends K>(params) {
  const methodRe = /^\s+(?:async\s+)?(?!private\s+)(?!constructor)([a-zA-Z_]\w*)\s*(?:<[^>]*>)?\s*\(/gm;
  let m;
  while ((m = methodRe.exec(source)) !== null) {
    const name = m[1];
    // skip private methods (prefixed with _), lifecycle, type keywords
    if (name.startsWith("_")) continue;
    if (["on", "off", "emit", "constructor", "if", "for", "while", "switch", "return", "throw", "new", "await", "catch", "try", "const", "let", "var", "function", "class", "import", "export", "type", "interface", "enum", "private", "protected", "public", "static", "readonly", "async"].includes(name)) continue;
    methods.add(name);
  }

  return methods;
}

/** Returns a Set of event names from the EventMap type definition */
function getEventNames(source) {
  const events = new Set();

  // Look for EventMap type definition
  const mapMatch = source.match(/export\s+type\s+EventMap\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
  if (mapMatch) {
    const body = mapMatch[1];
    const eventRe = /(\w+)\s*:/g;
    let m;
    while ((m = eventRe.exec(body)) !== null) {
      events.add(m[1]);
    }
  }

  return events;
}

/** Also get event names from the manifest */
function getManifestEventNames(manifest) {
  const events = new Set();
  if (manifest && Array.isArray(manifest.events)) {
    for (const evt of manifest.events) {
      if (evt.name) events.add(evt.name);
    }
  }
  return events;
}

// ─── Extract info from wiring code ──────────────────────────

/**
 * Extracts import mappings from wiring code.
 * Returns { ClassName: variableName } e.g. { "AudioCapture": "mic" }
 */
function getImportedClasses(wiring) {
  const imports = {};
  const re = /import\s*\{\s*(\w+)\s*\}\s*from\s*"[^"]*\/([^"]+)"/g;
  let m;
  while ((m = re.exec(wiring)) !== null) {
    imports[m[1]] = m[2]; // className -> componentSlug
  }
  return imports;
}

/**
 * Extracts variable-to-class mapping from constructor calls.
 * Returns { variableName: ClassName }
 */
function getVariableClassMap(wiring) {
  const map = {};
  const re = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(wiring)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

/**
 * Extracts method calls on known variables.
 * Returns array of { variable, method, line }
 */
function getMethodCalls(wiring, knownVars) {
  const calls = [];
  const varPattern = knownVars.join("|");
  if (!varPattern) return calls;
  const re = new RegExp(`(?:await\\s+)?\\b(${varPattern})\\.(\\w+)\\s*\\(`, "g");
  let m;
  while ((m = re.exec(wiring)) !== null) {
    calls.push({ variable: m[1], method: m[2] });
  }
  return calls;
}

/**
 * Extracts event subscriptions: variable.on("eventName", ...)
 * Returns array of { variable, event }
 */
function getEventSubscriptions(wiring, knownVars) {
  const subs = [];
  const varPattern = knownVars.join("|");
  if (!varPattern) return subs;
  const re = new RegExp(`\\b(${varPattern})\\.on\\(\\s*"(\\w+)"`, "g");
  let m;
  while ((m = re.exec(wiring)) !== null) {
    subs.push({ variable: m[1], event: m[2] });
  }
  return subs;
}

// ─── Main verification ──────────────────────────────────────

function verify() {
  const recipes = parseRecipes();
  const issues = [];
  let totalSteps = 0;
  let totalMethodChecks = 0;
  let totalEventChecks = 0;

  for (const recipe of recipes) {
    const prefix = `[${recipe.slug}]`;

    // Build slug→step mapping
    const stepBySlug = {};
    for (const step of recipe.steps) {
      stepBySlug[step.slug] = step;
    }

    // ── Check 1: Directory existence ──
    for (const step of recipe.steps) {
      totalSteps++;
      const dir = path.join(COMPONENTS_DIR, step.slug);
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        issues.push({
          recipe: recipe.slug,
          type: "missing-directory",
          message: `Component directory not found: ${step.slug}/`,
        });
      }
    }

    // ── Check 2: Class name matches ──
    for (const step of recipe.steps) {
      const source = readComponentSource(step.slug);
      if (!source) {
        issues.push({
          recipe: recipe.slug,
          type: "missing-source",
          message: `${step.slug}/src/index.ts not found`,
        });
        continue;
      }

      const exportedClass = getExportedClassName(source);
      if (!exportedClass) {
        issues.push({
          recipe: recipe.slug,
          type: "no-exported-class",
          message: `No exported class found in ${step.slug}/src/index.ts`,
        });
        continue;
      }

      if (exportedClass !== step.name) {
        issues.push({
          recipe: recipe.slug,
          type: "class-name-mismatch",
          message: `Step name "${step.name}" but ${step.slug}/src/index.ts exports "${exportedClass}"`,
        });
      }
    }

    // ── Check 3: Imported class names in wiring ──
    const importedClasses = getImportedClasses(recipe.wiring);
    for (const [className, slug] of Object.entries(importedClasses)) {
      const source = readComponentSource(slug);
      if (!source) continue; // already reported above
      const exportedClass = getExportedClassName(source);
      if (exportedClass && exportedClass !== className) {
        issues.push({
          recipe: recipe.slug,
          type: "import-class-mismatch",
          message: `Wiring imports "${className}" from ${slug} but source exports "${exportedClass}"`,
        });
      }
    }

    // ── Check 4: Method calls in wiring ──
    const varClassMap = getVariableClassMap(recipe.wiring);
    const knownVars = Object.keys(varClassMap);

    // Build className → slug mapping
    const classToSlug = {};
    for (const [className, slug] of Object.entries(importedClasses)) {
      classToSlug[className] = slug;
    }

    const methodCalls = getMethodCalls(recipe.wiring, knownVars);
    for (const call of methodCalls) {
      totalMethodChecks++;
      const className = varClassMap[call.variable];
      const slug = classToSlug[className];
      if (!slug) continue;

      const source = readComponentSource(slug);
      if (!source) continue;

      // Skip .on() and .off() — those are event methods
      if (call.method === "on" || call.method === "off") continue;

      const methods = getClassMethods(source);
      if (!methods.has(call.method)) {
        issues.push({
          recipe: recipe.slug,
          type: "method-not-found",
          message: `${call.variable}.${call.method}() called in wiring but "${call.method}" not found in ${slug}/src/index.ts`,
        });
      }
    }

    // ── Check 5: Event names in .on() calls ──
    const eventSubs = getEventSubscriptions(recipe.wiring, knownVars);
    for (const sub of eventSubs) {
      totalEventChecks++;
      const className = varClassMap[sub.variable];
      const slug = classToSlug[className];
      if (!slug) continue;

      const source = readComponentSource(slug);
      if (!source) continue;

      const sourceEvents = getEventNames(source);
      const manifest = readManifest(slug);
      const manifestEvents = getManifestEventNames(manifest);

      // Merge both sources
      const allEvents = new Set([...sourceEvents, ...manifestEvents]);

      if (!allEvents.has(sub.event)) {
        issues.push({
          recipe: recipe.slug,
          type: "event-not-found",
          message: `${sub.variable}.on("${sub.event}", ...) but "${sub.event}" not found in ${slug} EventMap`,
        });
      }
    }

    // ── Check 6: csv.toFile argument order ──
    // Special check: CsvExport.toFile signature is (filePath, data) but some recipes reverse it
    if (recipe.wiring.includes(".toFile(")) {
      const toFileRe = /(\w+)\.toFile\(([^,]+),\s*([^)]+)\)/g;
      let m;
      while ((m = toFileRe.exec(recipe.wiring)) !== null) {
        const varName = m[1];
        const firstArg = m[2].trim();
        const secondArg = m[3].trim();
        const className = varClassMap[varName];
        if (className === "CsvExport") {
          // First arg should be a string (file path), second should be data array
          // If first arg is a variable (not a string literal) and second is a string literal, args are reversed
          const firstIsString = /^["']/.test(firstArg) || /^`/.test(firstArg);
          const secondIsString = /^["']/.test(secondArg) || /^`/.test(secondArg);
          if (!firstIsString && secondIsString) {
            issues.push({
              recipe: recipe.slug,
              type: "argument-order",
              message: `csv.toFile(${firstArg}, ${secondArg}) — arguments appear reversed. Signature is toFile(filePath: string, data: Record[])`,
            });
          }
        }
      }
    }
  }

  return { recipes, issues, totalSteps, totalMethodChecks, totalEventChecks };
}

// ─── Report ─────────────────────────────────────────────────

const { recipes, issues, totalSteps, totalMethodChecks, totalEventChecks } = verify();

console.log(`\nVerified ${recipes.length} recipes (${totalSteps} steps, ${totalMethodChecks} method calls, ${totalEventChecks} event subscriptions)\n`);

if (issues.length === 0) {
  console.log("✓ All recipes are valid\n");
  process.exit(0);
}

// Group by recipe
const byRecipe = {};
for (const issue of issues) {
  if (!byRecipe[issue.recipe]) byRecipe[issue.recipe] = [];
  byRecipe[issue.recipe].push(issue);
}

// Group by type for summary
const byType = {};
for (const issue of issues) {
  if (!byType[issue.type]) byType[issue.type] = 0;
  byType[issue.type]++;
}

console.log(`Issues found: ${issues.length}\n`);

console.log("Summary by type:");
for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}
console.log();

for (const [recipe, recipeIssues] of Object.entries(byRecipe)) {
  console.log(`[${recipe}] (${recipeIssues.length} issue${recipeIssues.length === 1 ? "" : "s"}):`);
  for (const issue of recipeIssues) {
    console.log(`  ✗ [${issue.type}] ${issue.message}`);
  }
  console.log();
}

process.exit(1);
