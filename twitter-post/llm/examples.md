# @radzor/twitter-post — Usage Examples

## TypeScript

### Post a tweet
```typescript
import { TwitterPost } from "@radzor/twitter-post";

const twitter = new TwitterPost({ bearerToken: process.env.TWITTER_BEARER_TOKEN! });
const result = await twitter.tweet("Just shipped a new feature! 🚀");
console.log(`https://twitter.com/i/status/${result.tweetId}`);
```

### Post a thread
```typescript
const results = await twitter.thread([
  "🧵 Thread: How we built Radzor",
  "1/ Components are self-contained building blocks with manifests",
  "2/ LLMs read the manifest and generate integration code",
  "3/ No vendor lock-in — the code is yours",
  "Follow us for more updates!",
]);
console.log(`Thread started: ${results[0].tweetId}`);
```

### Automated posting with cron
```typescript
import { CronScheduler } from "@radzor/cron-scheduler";

scheduler.schedule("daily-tweet", "0 9 * * *", async () => {
  const tip = await generateDailyTip();
  await twitter.tweet(tip);
});
```

## Python

### Post a tweet
```python
from twitter_post import TwitterPost, TwitterPostConfig
import os

twitter = TwitterPost(TwitterPostConfig(bearer_token=os.environ["TWITTER_BEARER_TOKEN"]))
result = twitter.tweet("Just shipped a new feature! 🚀")
print(f"https://twitter.com/i/status/{result.tweet_id}")
```

### Post a thread
```python
results = twitter.thread([
    "🧵 Thread: How we built Radzor",
    "1/ Components with manifests",
    "2/ LLMs read the manifest",
    "3/ No vendor lock-in",
])
```

### LLM-generated tweets
```python
from llm_completion import LlmCompletion, LlmCompletionConfig

llm = LlmCompletion(LlmCompletionConfig(provider="openai", api_key=os.environ["OPENAI_API_KEY"], model="gpt-4o"))
response = llm.complete("Write a tweet about AI-driven development. Max 280 chars.")
twitter.tweet(response.content)
```
