# Radzor Components

Official AI-ready components with [RCS manifests](https://github.com/radzor-io/spec).

## Components

| Component | Category | Description |
|-----------|----------|-------------|
| [audio-capture](./audio-capture) | audio | Browser audio recording with MediaRecorder API |
| [auth-oauth](./auth-oauth) | auth | Multi-provider OAuth authentication flow |
| [email-send](./email-send) | email | Email sending via Resend, SendGrid, or SMTP |
| [file-upload](./file-upload) | storage | File upload to S3, R2, or local storage |
| [llm-completion](./llm-completion) | ai | LLM chat completions (OpenAI, Anthropic, Ollama) |
| [rate-limiter](./rate-limiter) | security | In-memory rate limiting (token bucket, sliding window) |
| [realtime-chat](./realtime-chat) | chat | WebSocket-based real-time messaging |
| [stripe-checkout](./stripe-checkout) | payment | Payment processing with Stripe |

Each component contains a `radzor.manifest.json` describing its inputs, outputs, actions, events, and composability — everything an LLM needs to integrate it.

## Usage

Point your LLM at a component's manifest:

```
Fetch https://raw.githubusercontent.com/radzor-io/components/main/stripe-checkout/radzor.manifest.json
and use it to integrate Stripe checkout into my app.
```

## Contributing

Want to add a component? See the [Contributing Guide](./CONTRIBUTING.md) for the full workflow:

```bash
npx radzor create @radzor/my-component -c audio
# implement in src/index.ts
npx radzor validate .
# open a PR
```

## Links

- [Radzor Platform](https://radzor.io)
- [RCS Specification](https://github.com/radzor-io/spec)

## License

MIT
