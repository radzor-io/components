# How to integrate @radzor/discord-bot

## Overview
Discord bot framework with slash commands, embeds, and message handling. Uses the Discord REST API and Gateway for real-time events.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { DiscordBot } from "@radzor/discord-bot";

const discordBot = new DiscordBot({
  botToken: process.env.DISCORD_BOT_TOKEN!,
});
```

3. **Use the component:**
```typescript
const result = await discordBot.sendMessage("example-channelId", "example-content");
const result = await discordBot.sendEmbed("example-channelId", /* embed */);
```

### Python

```python
from discord_bot import DiscordBot, DiscordBotConfig
import os

discordBot = DiscordBot(DiscordBotConfig(
    bot_token=os.environ["DISCORD_BOT_TOKEN"],
))
```

## Events

- **onMessage** — Fired when a message is received. Payload: `channelId: string`, `content: string`, `authorId: string`
- **onError** — Fired on API errors. Payload: `code: string`, `message: string`

## Environment Variables

- `DISCORD_BOT_TOKEN`

## Constraints

Requires Discord bot token. Bot must be invited to server with appropriate permissions.
