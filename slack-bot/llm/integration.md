# slack-bot — Integration Guide

## Overview

Server-side Slack bot component using the Slack Web API and Incoming Webhooks. Supports posting messages, rich block kit messages, thread replies, file uploads, and request signature verification for event subscriptions.

## Installation

```bash
radzor add slack-bot
```

## Configuration

| Input           | Type   | Required | Description                                      |
| --------------- | ------ | -------- | ------------------------------------------------ |
| `botToken`      | string | no*      | Bot OAuth token (`xoxb-...`) from Slack app      |
| `webhookUrl`    | string | no*      | Incoming Webhook URL for simple notifications    |
| `signingSecret` | string | no       | Signing secret for verifying inbound requests    |

\* `botToken` is required for all API methods. `webhookUrl` is only needed for `webhookSend()`.

Get your credentials from https://api.slack.com/apps.

## Quick Start

```typescript
import { SlackBot } from "./components/slack-bot/src";

const bot = new SlackBot({
  botToken: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const { ts, channel } = await bot.sendMessage("C01234ABCDE", "Hello from Radzor!");
```

## Integration Steps

1. Create a Slack app at https://api.slack.com/apps and install it to your workspace.
2. Copy the **Bot User OAuth Token** (`xoxb-...`) and optionally the **Signing Secret**.
3. Grant the bot the required OAuth scopes: `chat:write`, `files:write` for file uploads.
4. (Optional) Set up an Incoming Webhook for simple webhook-based notifications.
5. (Optional) Configure Request URL in the Slack app for Events API — use `verifyRequest()` to authenticate every inbound POST.

## Actions

### sendMessage

Post a plain text message to a channel, optionally in a thread.

**Parameters:** `channel` (string), `text` (string), `options?` (`{ threadTs?, unfurlLinks? }`)
**Returns:** `Promise<{ ts, channel }>`

### sendBlocks

Post a Block Kit message with an optional plain-text fallback.

**Parameters:** `channel` (string), `blocks` (SlackBlock[]), `text?` (string)
**Returns:** `Promise<{ ts, channel }>`

### reply

Post a message into an existing thread.

**Parameters:** `channel` (string), `threadTs` (string), `text` (string)
**Returns:** `Promise<{ ts, channel }>`

### uploadFile

Upload a file to a channel using the Files API v2 (two-step: get URL, upload, complete).

**Parameters:** `channel` (string), `content` (Buffer | string), `filename` (string), `title?` (string)
**Returns:** `Promise<{ fileId, permalink }>`

### webhookSend

Send a plain text notification via an Incoming Webhook URL. Does not require a bot token.

**Parameters:** `text` (string)
**Returns:** `Promise<void>`

### verifyRequest

Verify the HMAC-SHA256 signature on an inbound Slack request. Call this before processing any Events API payload.

**Parameters:** `body` (string — raw request body), `timestamp` (string — `X-Slack-Request-Timestamp` header), `signature` (string — `X-Slack-Signature` header)
**Returns:** `boolean`

## Events

| Event          | Payload                     | When emitted                        |
| -------------- | --------------------------- | ----------------------------------- |
| `onMessageSent`| `{ ts, channel, ok }`       | After every successful message post |
| `onError`      | `{ code, message }`         | On API failures or config errors    |

## Constraints

- `botToken` must be present for all methods except `webhookSend`.
- Always call `verifyRequest()` before trusting any inbound Events API payload.
- `unfurlLinks` defaults to Slack's own setting when not specified.
- File uploads use the v2 API (get URL external + complete); the legacy `files.upload` method is deprecated.
