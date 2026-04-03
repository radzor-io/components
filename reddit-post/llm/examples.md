# reddit-post — Examples

## Submit a text post

### TypeScript

```typescript
import { RedditClient } from "./components/reddit-post/src";

const reddit = new RedditClient({
  clientId: process.env.REDDIT_CLIENT_ID!,
  clientSecret: process.env.REDDIT_CLIENT_SECRET!,
  username: process.env.REDDIT_USERNAME!,
  password: process.env.REDDIT_PASSWORD!,
});

const post = await reddit.submitText("programming", "Check out Radzor", "A component registry for LLM-driven development.");
console.log(`Posted: ${post.url}`);
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

post = reddit.submit_text("programming", "Check out Radzor", "A component registry for LLM-driven development.")
print(f"Posted: {post.url}")
```

## Submit a link post

### TypeScript

```typescript
const post = await reddit.submitLink("webdev", "Radzor - Component Registry", "https://radzor.io");
```

### Python

```python
post = reddit.submit_link("webdev", "Radzor - Component Registry", "https://radzor.io")
```

## Add a comment

### TypeScript

```typescript
const comment = await reddit.addComment("t3_abc123", "Great post! Check out radzor.io");
console.log(comment.id);
```

### Python

```python
comment = reddit.add_comment("t3_abc123", "Great post! Check out radzor.io")
print(comment.id)
```

## Error handling

### TypeScript

```typescript
reddit.on("onPostCreated", (post) => console.log("Created:", post.url));
reddit.on("onError", (err) => console.error(err.code, err.message));
```

### Python

```python
reddit.on("onPostCreated", lambda p: print("Created:", p.url))
reddit.on("onError", lambda err: print(err["code"], err["message"]))
```
