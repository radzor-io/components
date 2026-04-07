# Contributing to Radzor Components

Want to add a component to the Radzor registry? Here's how.

## Quick Start

```bash
# 1. Scaffold your component
npx radzor@latest create @radzor/my-component -c audio

# 2. Implement it
#    Edit src/index.ts, radzor.manifest.json, and llm/ docs

# 3. Validate
npx radzor@latest validate radzor.manifest.json

# 4. Submit a PR to this repo
```

## Component Structure

Every component must have:

```
my-component/
├── radzor.manifest.json   # Component manifest (required)
├── src/
│   └── index.ts           # Source code (required)
└── llm/
    ├── integration.md     # LLM integration guide (required)
    └── examples.md        # Usage examples (required)
```

## Manifest Rules

The `radzor.manifest.json` must pass `radzor validate`. Key rules:

- **name**: Scoped package name — `@scope/component-name`
- **version**: Semver — `0.1.0`
- **description**: 10–500 characters, clear and specific
- **category**: One of: `audio`, `auth`, `payment`, `chat`, `data`, `ui`, `ai`, `storage`, `email`, `analytics`, `media`, `networking`, `security`, `other`
- **inputs**: Every config parameter your constructor accepts, with types and descriptions
- **outputs**: Values your component produces
- **actions**: Every public method, with params and return types
- **events**: Every event your component emits, named `on` + PascalCase (e.g. `onReady`)

### Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing required inputs (API keys, secrets) | Declare ALL constructor params in `inputs` |
| Declaring outputs the code doesn't produce | Only list outputs that actually exist |
| Events not matching the naming pattern | Events must be `onSomething` |
| `dependencies.packages` not matching actual imports | List exactly what your code imports |

## Source Code Guidelines

1. **Export a class** with the same name as your component in PascalCase
2. **Accept a config object** in the constructor matching your manifest inputs
3. **Use typed events** — implement `on(event, listener)` and `emit(event, payload)`
4. **Handle errors** — emit `onError` events, don't throw silently
5. **Clean up resources** — provide a `destroy()` or `cleanup()` method if you allocate resources
6. **No side effects on import** — everything should happen in constructor or action calls

## LLM Docs Guidelines

These files are what LLMs read to integrate your component. They matter.

### `llm/integration.md`

Write this as if you're explaining the component to a developer who's never seen it. Include:

1. A one-paragraph overview
2. Step-by-step integration instructions with code
3. All required environment variables or secrets
4. Runtime constraints (browser-only, Node.js required, etc.)

### `llm/examples.md`

Provide 2–4 complete, copy-pasteable code examples:

1. **Basic usage** — minimal working example
2. **With error handling** — production-ready pattern
3. **Advanced** — combining with other components if applicable

## Submission Process

1. **Fork** this repository
2. **Create** your component directory (or use `npx radzor@latest create`)
3. **Implement** source code, manifest, and LLM docs
4. **Validate** with `npx radzor@latest validate radzor.manifest.json`
5. **Test** your component works when imported
6. **Open a PR** with:
   - Component name and category in the PR title
   - A brief description of what it does
   - Any external dependencies it requires

## Review Checklist

PRs are reviewed against this checklist:

- [ ] `radzor validate` passes with no errors
- [ ] Source code exports a working class/function
- [ ] Every manifest action exists in the code with matching signatures
- [ ] Every manifest event is actually emitted in the code
- [ ] Every manifest input is consumed by the constructor
- [ ] Dependencies are accurate (no phantom deps, no missing deps)
- [ ] `llm/integration.md` has clear step-by-step instructions
- [ ] `llm/examples.md` has at least 2 working code examples
- [ ] No credentials or secrets hardcoded in source
- [ ] Code follows TypeScript best practices (typed, no `any`)

## Questions?

Open an issue on this repo or check [radzor.io/docs](https://radzor.io/docs).
