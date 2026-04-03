# Radzor Components

Official AI-ready components with [RCS manifests](https://github.com/radzor-io/spec).

## Components

| Component | Category | Description |
|-----------|----------|-------------|
| [audio-capture](./audio-capture) | media | Browser audio recording with MediaRecorder API |
| [auth-oauth](./auth-oauth) | auth | Multi-provider OAuth authentication flow |
| [stripe-checkout](./stripe-checkout) | payment | Payment processing with Stripe |
| [realtime-chat](./realtime-chat) | communication | WebSocket-based real-time messaging |

Each component contains a `radzor.manifest.json` describing its inputs, outputs, actions, events, and composability — everything an LLM needs to integrate it.

## Usage

Point your LLM at a component's manifest:

```
Fetch https://raw.githubusercontent.com/radzor-io/components/main/stripe-checkout/radzor.manifest.json
and use it to integrate Stripe checkout into my app.
```

## Contributing

Want to add a component? Each component directory needs:

1. A `radzor.manifest.json` validated against the [RCS schema](https://github.com/radzor-io/spec)
2. Source code in the language(s) declared in the manifest
3. A README explaining setup and usage

## Links

- [Radzor Platform](https://radzor.io)
- [RCS Specification](https://github.com/radzor-io/spec)

## License

MIT
