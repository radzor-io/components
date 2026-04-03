# telegram-bot — Integration Guide

## Overview

Server-side Telegram bot using the Bot API. Send text messages, photos, reply keyboards, and inline keyboards.

## Installation

```bash
radzor add telegram-bot
```

## Configuration

| Input      | Type   | Required | Description                          |
| ---------- | ------ | -------- | ------------------------------------ |
| `botToken` | string | yes      | Bot API token from @BotFather        |

Create a bot via https://t.me/BotFather and copy the token.

## Quick Start

### TypeScript

```typescript
import { TelegramBot } from "./components/telegram-bot/src";

const bot = new TelegramBot({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
});

await bot.sendMessage(123456789, "Hello from Radzor!");
```

### Python

```python
from components.telegram_bot.src import TelegramBot, TelegramBotConfig

bot = TelegramBot(TelegramBotConfig(bot_token=os.environ["TELEGRAM_BOT_TOKEN"]))
bot.send_message(123456789, "Hello from Radzor!")
```

## Actions

### sendMessage / send_message

Send a text message. Supports `HTML`, `Markdown`, `MarkdownV2` parse modes.

### sendPhoto / send_photo

Send a photo by URL with optional caption.

### sendReplyKeyboard / send_reply_keyboard

Send a message with a custom reply keyboard.

### sendInlineKeyboard / send_inline_keyboard

Send a message with inline keyboard buttons (URLs or callback data).

## Error handling

Listen to `onError` events or wrap calls in try/catch.

## Requirements

- Telegram Bot API token
- No external dependencies — uses stdlib only
