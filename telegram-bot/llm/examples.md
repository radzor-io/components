# telegram-bot — Examples

## Send a text message

### TypeScript

```typescript
import { TelegramBot } from "./components/telegram-bot/src";

const bot = new TelegramBot({ botToken: process.env.TELEGRAM_BOT_TOKEN! });
const msg = await bot.sendMessage(123456789, "Hello!");
console.log(`Sent: ${msg.messageId}`);
```

### Python

```python
from components.telegram_bot.src import TelegramBot, TelegramBotConfig

bot = TelegramBot(TelegramBotConfig(bot_token=os.environ["TELEGRAM_BOT_TOKEN"]))
msg = bot.send_message(123456789, "Hello!")
print(f"Sent: {msg.message_id}")
```

## Send a photo with caption

### TypeScript

```typescript
await bot.sendPhoto(123456789, "https://example.com/image.jpg", "Check this out!");
```

### Python

```python
bot.send_photo(123456789, "https://example.com/image.jpg", "Check this out!")
```

## Inline keyboard with URL buttons

### TypeScript

```typescript
await bot.sendInlineKeyboard(123456789, "Visit our site:", [
  [
    { text: "Website", url: "https://example.com" },
    { text: "Docs", url: "https://docs.example.com" },
  ],
]);
```

### Python

```python
from components.telegram_bot.src import InlineKeyboardButton

bot.send_inline_keyboard(123456789, "Visit our site:", [
    [
        InlineKeyboardButton(text="Website", url="https://example.com"),
        InlineKeyboardButton(text="Docs", url="https://docs.example.com"),
    ],
])
```

## Reply keyboard

### TypeScript

```typescript
await bot.sendReplyKeyboard(123456789, "Choose an option:", [
  [{ text: "Option A" }, { text: "Option B" }],
  [{ text: "Option C" }],
]);
```

### Python

```python
bot.send_reply_keyboard(123456789, "Choose an option:", [
    [{"text": "Option A"}, {"text": "Option B"}],
    [{"text": "Option C"}],
])
```

## HTML formatted message

### TypeScript

```typescript
await bot.sendMessage(123456789, "<b>Bold</b> and <i>italic</i>", "HTML");
```

### Python

```python
bot.send_message(123456789, "<b>Bold</b> and <i>italic</i>", parse_mode="HTML")
```
