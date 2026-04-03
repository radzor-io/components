# discord-bot — Integration Guide

## Overview

Server-side Discord bot component using Discord REST API v10. Send messages, embeds, reply to messages, and delete messages in Discord channels.

## Installation

```bash
radzor add discord-bot
```

## Configuration

| Input          | Type   | Required | Description                        |
| -------------- | ------ | -------- | ---------------------------------- |
| `botToken`     | string | yes      | Discord bot token from dev portal  |
| `applicationId`| string | no       | Discord application ID             |

Get your bot token from https://discord.com/developers/applications.

## Quick Start

### TypeScript

```typescript
import { DiscordBot } from "./components/discord-bot/src";

const bot = new DiscordBot({
  botToken: process.env.DISCORD_BOT_TOKEN!,
  applicationId: process.env.DISCORD_APP_ID,
});

const msg = await bot.sendMessage("channel-id", "Hello from Radzor!");
console.log(msg.id);
```

### Python

```python
from components.discord_bot.src import DiscordBot, DiscordBotConfig

bot = DiscordBot(DiscordBotConfig(
    bot_token=os.environ["DISCORD_BOT_TOKEN"],
))

msg = bot.send_message("channel-id", "Hello from Radzor!")
print(msg.id)
```

## Actions

### sendMessage / send_message

Send a text message to a channel.

**Parameters:** `channel_id` (str), `content` (str)
**Returns:** `DiscordMessage` with `id`, `channel_id`, `content`, `author_id`

### sendEmbed / send_embed

Send a rich embed to a channel.

**Parameters:** `channel_id` (str), `embed` (DiscordEmbed)
**Returns:** `DiscordMessage`

### replyTo / reply_to

Reply to a specific message.

**Parameters:** `channel_id` (str), `message_id` (str), `content` (str)
**Returns:** `DiscordMessage`

### deleteMessage / delete_message

Delete a message from a channel.

**Parameters:** `channel_id` (str), `message_id` (str)
**Returns:** `void` / `None`

## Error handling

The component emits `onError` events with `{ code, message }` payload. Wrap calls in try/catch or subscribe to the error event.

## Requirements

- Discord bot token with `bot` scope and `Send Messages` permission
- Bot must be invited to the server with correct permissions
- No external dependencies — uses stdlib only
