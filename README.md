# Radzor Components

The official registry of components for the [Radzor Platform](https://radzor.io).

## What are Radzor Components?

Radzor components are fully typed, framework-agnostic building blocks for backend logic, APIs, and AI workflows. They are not distributed as `node_modules` packages. Instead, you download the source code directly into your repository.

### Preventing LLM Hallucinations

Every component in this repository includes:
1. The source code (TypeScript, Python, etc.)
2. A `radzor.manifest.json` compliant with the [RCS Specification](https://github.com/radzor-io/spec)
3. An `llm/integration.md` guide

This ensures that when you ask an AI agent to use the component, it reads the manifest, understands the exact inputs/outputs, required API keys, and events, and generates accurate integration code without relying on outdated training data.

## The Catalog

The registry contains components across categories:
- **AI**: `llm-completion`, `speech-to-text`, `text-to-speech`, `embeddings-store`, `vector-search`...
- **Audio/Media**: `audio-capture`, `image-processor`, `video-transcoder`...
- **Auth**: `auth-oauth`, `api-key-auth`, `jwt-verify`...
- **Payment**: `stripe-checkout`, `webhook-receiver`...
- **Storage/DB**: `file-upload`, `sql-query`, `redis-cache`...

Explore the full catalog on [radzor.io/components](https://radzor.io/components).

## Usage

Use the [Radzor CLI](https://github.com/radzor-io/cli) to install a component:

```bash
npx radzor@latest add speech-to-text llm-completion
```

Or scaffold a complete AI Workflow (Recipe):

```bash
npx radzor@latest recipe add voice-bot
```

## Contributing

We welcome community contributions to build a standard registry of LLM-friendly components.

To add a new component to the registry:
1. Fork this repository.
2. Scaffold your component using the CLI:
   ```bash
   npx radzor@latest create @radzor/my-component -c ai
   ```
3. Implement the logic in `src/index.ts` and write the LLM instructions in `llm/integration.md`.
4. Run `npx radzor validate .` inside your component folder to ensure your manifest passes the RCS Schema validation.
5. Open a Pull Request.

## Links

- [Radzor Platform](https://radzor.io)
- [RCS Specification](https://github.com/radzor-io/spec)
- [Radzor CLI](https://github.com/radzor-io/cli)

## License

MIT
