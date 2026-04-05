# slack-bot — Examples

## Send a plain text message

```typescript
import { SlackBot } from "./components/slack-bot/src";

const bot = new SlackBot({ botToken: process.env.SLACK_BOT_TOKEN! });

const { ts, channel } = await bot.sendMessage("C01234ABCDE", "Deployment complete!");
console.log(`Posted ${ts} to ${channel}`);
```

## Send a Block Kit message

```typescript
import { SlackBot } from "./components/slack-bot/src";

const bot = new SlackBot({ botToken: process.env.SLACK_BOT_TOKEN! });

await bot.sendBlocks(
  "C01234ABCDE",
  [
    {
      type: "header",
      text: { type: "plain_text", text: "Build Report" },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: "*Status:* Passed" },
        { type: "mrkdwn", text: "*Duration:* 42s" },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: "View full report at <https://ci.example.com|ci.example.com>" },
    },
  ],
  "Build passed"
);
```

## Reply in a thread

```typescript
import { SlackBot } from "./components/slack-bot/src";

const bot = new SlackBot({ botToken: process.env.SLACK_BOT_TOKEN! });

// Post an initial message
const { ts, channel } = await bot.sendMessage("C01234ABCDE", "Starting job...");

// Later, reply to that thread
await bot.reply(channel, ts, "Job finished successfully.");
```

## Upload a file

```typescript
import { SlackBot } from "./components/slack-bot/src";
import { readFileSync } from "fs";

const bot = new SlackBot({ botToken: process.env.SLACK_BOT_TOKEN! });

const csvContent = readFileSync("./report.csv");
const { fileId, permalink } = await bot.uploadFile(
  "C01234ABCDE",
  csvContent,
  "report.csv",
  "Weekly Report"
);
console.log(`File ${fileId} available at ${permalink}`);
```

## Verify an inbound Events API request

```typescript
import { SlackBot } from "./components/slack-bot/src";

const bot = new SlackBot({
  botToken: process.env.SLACK_BOT_TOKEN!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

// In your HTTP handler (e.g. Express):
app.post("/slack/events", (req, res) => {
  const rawBody = req.rawBody as string; // must be the raw string, not parsed JSON
  const timestamp = req.headers["x-slack-request-timestamp"] as string;
  const signature = req.headers["x-slack-signature"] as string;

  if (!bot.verifyRequest(rawBody, timestamp, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Safe to process the event
  const event = JSON.parse(rawBody);
  console.log("Received event:", event.type);
  res.json({ ok: true });
});
```

## Error handling

```typescript
import { SlackBot } from "./components/slack-bot/src";

const bot = new SlackBot({ botToken: process.env.SLACK_BOT_TOKEN! });

bot.on("onError", (err) => {
  console.error(`Slack error [${err.code}]: ${err.message}`);
});

bot.on("onMessageSent", (result) => {
  console.log(`Message sent at ${result.ts} in ${result.channel}`);
});

try {
  await bot.sendMessage("INVALID_CHANNEL", "test");
} catch (e) {
  // error already emitted via onError, handle gracefully here
}
```
