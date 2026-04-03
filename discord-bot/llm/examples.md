# discord-bot — Examples

## Send a simple message

### TypeScript

```typescript
import { DiscordBot } from "./components/discord-bot/src";

const bot = new DiscordBot({
  botToken: process.env.DISCORD_BOT_TOKEN!,
});

const msg = await bot.sendMessage("123456789", "Hello Discord!");
console.log(`Sent message ${msg.id}`);
```

### Python

```python
from components.discord_bot.src import DiscordBot, DiscordBotConfig

bot = DiscordBot(DiscordBotConfig(bot_token=os.environ["DISCORD_BOT_TOKEN"]))
msg = bot.send_message("123456789", "Hello Discord!")
print(f"Sent message {msg.id}")
```

## Send a rich embed

### TypeScript

```typescript
import { DiscordBot, DiscordEmbed } from "./components/discord-bot/src";

const bot = new DiscordBot({ botToken: process.env.DISCORD_BOT_TOKEN! });

const embed: DiscordEmbed = {
  title: "Deploy Report",
  description: "All services healthy",
  color: 0x00ff00,
  fields: [
    { name: "Version", value: "2.1.0", inline: true },
    { name: "Region", value: "eu-west-1", inline: true },
  ],
  footer: { text: "Deployed via CI" },
};

await bot.sendEmbed("123456789", embed);
```

### Python

```python
from components.discord_bot.src import DiscordBot, DiscordBotConfig, DiscordEmbed

bot = DiscordBot(DiscordBotConfig(bot_token=os.environ["DISCORD_BOT_TOKEN"]))

embed = DiscordEmbed(
    title="Deploy Report",
    description="All services healthy",
    color=0x00FF00,
    fields=[
        {"name": "Version", "value": "2.1.0", "inline": True},
        {"name": "Region", "value": "eu-west-1", "inline": True},
    ],
    footer={"text": "Deployed via CI"},
)

bot.send_embed("123456789", embed)
```

## Reply to a message

### TypeScript

```typescript
const reply = await bot.replyTo("123456789", "msg-id", "Got it!");
```

### Python

```python
reply = bot.reply_to("123456789", "msg-id", "Got it!")
```

## Delete a message

### TypeScript

```typescript
await bot.deleteMessage("123456789", "msg-to-delete");
```

### Python

```python
bot.delete_message("123456789", "msg-to-delete")
```

## Error handling

### TypeScript

```typescript
bot.on("onError", (err) => {
  console.error(`Discord error: ${err.code} — ${err.message}`);
});

try {
  await bot.sendMessage("invalid-channel", "test");
} catch (e) {
  // handle error
}
```

### Python

```python
def on_error(err):
    print(f"Discord error: {err['code']} — {err['message']}")

bot.on("onError", on_error)

try:
    bot.send_message("invalid-channel", "test")
except Exception as e:
    pass  # handle error
```
