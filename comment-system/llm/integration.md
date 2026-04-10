# How to integrate @radzor/comment-system

## Overview
This component provides a threaded comment system with nested replies, reactions, moderation, and pagination. Comments are stored in-memory with an in-memory index for fast retrieval by thread. It supports soft-deletion, editing, and configurable reaction types.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create a comment system instance**:
```typescript
import { CommentSystem } from "@radzor/comment-system";

const comments = new CommentSystem({
  maxDepth: 5,           // max nesting for replies
  pageSize: 20,          // comments per page
  allowedReactions: ["like", "dislike", "love", "laugh", "sad", "angry"],
});
```

3. **Add comments and replies**:
```typescript
const comment = comments.addComment("post-123", "user-1", "Great article!");
const reply = comments.addComment("post-123", "user-2", "Thanks!", comment.id);
const nested = comments.addComment("post-123", "user-1", "You're welcome!", reply.id);
```

4. **List comments with pagination**:
```typescript
const thread = comments.listComments("post-123", 1, "newest");
console.log(thread.totalCount);
console.log(thread.hasMore);
for (const c of thread.comments) {
  console.log(`${c.authorId}: ${c.content} (${c.reactionCount} reactions)`);
  for (const r of c.replies) {
    console.log(`  └─ ${r.authorId}: ${r.content}`);
  }
}
```

5. **Reactions and moderation**:
```typescript
comments.addReaction(comment.id, "user-2", "like");
comments.addReaction(comment.id, "user-2", "like"); // toggles off

comments.moderate(comment.id, "admin-1", "flag");
comments.moderate(comment.id, "admin-1", "approve");
```

6. **Listen for events**:
```typescript
comments.on("onCommentAdded", ({ commentId, authorId, threadId }) => {
  console.log(`New comment ${commentId} by ${authorId} in ${threadId}`);
});

comments.on("onCommentModerated", ({ commentId, action, moderatorId }) => {
  console.log(`Comment ${commentId} ${action} by ${moderatorId}`);
});
```

7. **Use in API routes**:
```typescript
app.post("/api/comments", (req, res) => {
  const { threadId, content, parentId } = req.body;
  const comment = comments.addComment(threadId, req.user.id, content, parentId);
  res.status(201).json(comment);
});

app.get("/api/comments/:threadId", (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const thread = comments.listComments(req.params.threadId, page, "newest");
  res.json(thread);
});
```

8. **Python equivalent**:
```python
from comment_system import CommentSystem

comments = CommentSystem(max_depth=5, page_size=20)

comment = comments.add_comment("post-123", "user-1", "Great article!")
reply = comments.add_comment("post-123", "user-2", "Thanks!", comment["id"])
thread = comments.list_comments("post-123", page=1, sort_by="newest")
```

## Environment Variables Required
None. This component has no external dependencies.

## Constraints
- In-memory store; all data is lost on process restart. Persist to a database for production.
- Soft-deletes preserve thread structure — deleted comment content becomes `[deleted]`.
- Reaction toggling is idempotent: adding the same reaction twice removes it.
- Thread IDs are opaque strings — use your resource identifier (e.g. post ID, page URL).
- Rejected comments are excluded from `listComments` results.

## Composability
- Use with `@radzor/realtime-chat` for live comment updates via WebSocket.
- Combine with `@radzor/data-validator` to sanitise comment content.
- Feed `onCommentAdded` events into `@radzor/notification-hub` for real-time notifications.
