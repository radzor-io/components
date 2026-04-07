# How to integrate @radzor/telegram-bot

## Overview
Telegram bot component using the Bot API. Send messages, photos, reply keyboards, and inline keyboards.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { TelegramBot } from "@radzor/telegram-bot";

const telegramBot = new TelegramBot({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
});
```

3. **Use the component:**
```typescript
const result = await telegramBot.sendMessage("example-chatId", "example-text");
const result = await telegramBot.sendPhoto("example-chatId", "example-photo");
const result = await telegramBot.sendReplyKeyboard("example-chatId", "example-text");
```

### Python

```python
from telegram_bot import TelegramBot, TelegramBotConfig
import os

telegramBot = TelegramBot(TelegramBotConfig(
    bot_token=os.environ["TELEGRAM_BOT_TOKEN"],
))
```

## Events

- **onMessageSent** — Fired when a message is successfully sent. Payload: `messageId: number`, `chatId: string`
- **onError** — Fired on API error. Payload: `code: string`, `message: string`

## Environment Variables

- `TELEGRAM_BOT_TOKEN`
