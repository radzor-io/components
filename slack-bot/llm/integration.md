# How to integrate @radzor/slack-bot

## Overview
Slack bot for sending messages, Block Kit layouts, file uploads, and slash command responses via the Slack Web API. Supports both Bot tokens and incoming webhooks.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { SlackBot } from "@radzor/slack-bot";

const slackBot = new SlackBot({
  botToken: process.env.SLACK_BOT_TOKEN!,
  webhookUrl: process.env.SLACK_BOT_WEBHOOK_URL,
  signingSecret: process.env.SLACK_BOT_SIGNING_SECRET,
});
```

3. **Use the component:**
```typescript
const result = await slackBot.sendMessage("example-channel", "example-text");
const result = await slackBot.sendBlocks("example-channel", /* blocks */);
const result = await slackBot.reply("example-channel", "example-threadTs");
```

### Python

```python
from slack_bot import SlackBot, SlackBotConfig
import os

slackBot = SlackBot(SlackBotConfig(
    bot_token=os.environ["SLACK_BOT_TOKEN"],
    webhook_url=os.environ.get("SLACK_BOT_WEBHOOK_URL"),
    signing_secret=os.environ.get("SLACK_BOT_SIGNING_SECRET"),
))
```

## Events

- **onMessageSent** — Fired when a message is successfully sent. Payload: `ts: string`, `channel: string`
- **onError** — Fired on Slack API error. Payload: `code: string`, `message: string`, `slackError: string`

## Environment Variables

- `SLACK_BOT_TOKEN`
- `SLACK_BOT_WEBHOOK_URL`
- `SLACK_BOT_SIGNING_SECRET`

## Constraints

Requires botToken for API methods (sendMessage, sendBlocks, uploadFile). webhookUrl can replace botToken for simple notifications only. Always verify incoming requests with verifyRequest() using signingSecret.
