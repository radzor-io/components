# reddit-post — Integration Guide

## Overview

Post to Reddit using the Reddit API. Submit text posts, link posts, and add comments to subreddits.

## Installation

```bash
radzor add reddit-post
```

## Configuration

| Input          | Type   | Required | Description              |
| -------------- | ------ | -------- | ------------------------ |
| `clientId`     | string | yes      | Reddit app client ID     |
| `clientSecret` | string | yes      | Reddit app client secret |
| `username`     | string | yes      | Reddit username          |
| `password`     | string | yes      | Reddit password          |

Create a Reddit app at https://www.reddit.com/prefs/apps (script type).

## Quick Start

### TypeScript

```typescript
import { RedditClient } from "./components/reddit-post/src";

const reddit = new RedditClient({
  clientId: process.env.REDDIT_CLIENT_ID!,
  clientSecret: process.env.REDDIT_CLIENT_SECRET!,
  username: process.env.REDDIT_USERNAME!,
  password: process.env.REDDIT_PASSWORD!,
});

const post = await reddit.submitText("test", "Hello from Radzor", "This is a test post");
console.log(post.url);
```

### Python

```python
from components.reddit_post.src import RedditClient, RedditConfig

reddit = RedditClient(RedditConfig(
    client_id=os.environ["REDDIT_CLIENT_ID"],
    client_secret=os.environ["REDDIT_CLIENT_SECRET"],
    username=os.environ["REDDIT_USERNAME"],
    password=os.environ["REDDIT_PASSWORD"],
))

post = reddit.submit_text("test", "Hello from Radzor", "This is a test post")
print(post.url)
```

## Actions

### submitText / submit_text — Submit a self/text post
### submitLink / submit_link — Submit a link post
### addComment / add_comment — Comment on a post or reply to a comment

## Requirements

- Reddit API app credentials (script type)
- No external dependencies — uses stdlib only
