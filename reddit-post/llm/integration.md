# How to integrate @radzor/reddit-post

## Overview
Post to Reddit using the Reddit API. Submit text or link posts and manage comments.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { RedditPost } from "@radzor/reddit-post";

const redditPost = new RedditPost({
  clientId: "your-clientId",
  clientSecret: "your-clientSecret",
  username: "your-username",
  password: "your-password",
});
```

3. **Use the component:**
```typescript
const result = await redditPost.submitText("example-subreddit", "example-title");
const result = await redditPost.submitLink("example-subreddit", "example-title");
const result = await redditPost.addComment("example-thingId", "example-text");
```

### Python

```python
from reddit_post import RedditPost, RedditPostConfig
import os

redditPost = RedditPost(RedditPostConfig(
    client_id="your-client_id",
    client_secret="your-client_secret",
    username="your-username",
    password="your-password",
))
```

## Events

- **onPostCreated** — Fired when a post is successfully created. Payload: `id: string`, `subreddit: string`, `url: string`
- **onError** — Fired on API error. Payload: `code: string`, `message: string`
