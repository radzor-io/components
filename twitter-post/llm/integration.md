# How to integrate @radzor/twitter-post

## Overview
Post tweets and threads via the Twitter/X API v2.

## Integration Steps

### TypeScript
```typescript
import { TwitterPost } from "@radzor/twitter-post";

const twitter = new TwitterPost({ bearerToken: process.env.TWITTER_BEARER_TOKEN! });
const result = await twitter.tweet("Hello from Radzor! 🚀");
console.log(`Tweet ID: ${result.tweetId}`);
```

### Python
```python
from twitter_post import TwitterPost, TwitterPostConfig
import os

twitter = TwitterPost(TwitterPostConfig(bearer_token=os.environ["TWITTER_BEARER_TOKEN"]))
result = twitter.tweet("Hello from Radzor! 🚀")
print(f"Tweet ID: {result.tweet_id}")
```

## Environment Variables Required
- `TWITTER_BEARER_TOKEN` — Twitter API v2 Bearer Token

## Constraints
- Tweet text max 280 characters.
- Requires Twitter API v2 access (Developer account).
- API rate limits: 200 tweets per 15 minutes.
