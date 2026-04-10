# @radzor/comment-system — Usage Examples

## Adding comments and replies
```typescript
import { CommentSystem } from "@radzor/comment-system";

const comments = new CommentSystem({ maxDepth: 5, pageSize: 20 });

const c1 = comments.addComment("article-42", "user-1", "Great article, very informative!");
const c2 = comments.addComment("article-42", "user-2", "Thanks for sharing!");
const reply = comments.addComment("article-42", "user-1", "Glad you liked it!", c2.id);
const nested = comments.addComment("article-42", "user-3", "Me too!", reply.id);

console.log(c1.id, c1.content);
console.log(reply.parentId); // c2.id
console.log(nested.depth);   // 2
```

## Listing comments with pagination
```typescript
const comments = new CommentSystem({ pageSize: 10 });

// Add many comments...
for (let i = 0; i < 50; i++) {
  comments.addComment("post-1", `user-${i}`, `Comment #${i}`);
}

// Page 1
const page1 = comments.listComments("post-1", 1, "newest");
console.log(page1.totalCount);  // 50
console.log(page1.comments.length); // 10
console.log(page1.hasMore);     // true

// Page 2
const page2 = comments.listComments("post-1", 2, "newest");
console.log(page2.page); // 2
```

## Reactions
```typescript
const comments = new CommentSystem();
const comment = comments.addComment("post-1", "user-1", "Hello world!");

// Add reactions
const updated = comments.addReaction(comment.id, "user-2", "like");
console.log(updated.reactions["like"]); // ["user-2"]
console.log(updated.reactionCount);     // 1

// Multiple users react
comments.addReaction(comment.id, "user-3", "like");
comments.addReaction(comment.id, "user-4", "love");

// Toggle off (same user, same reaction)
const toggled = comments.addReaction(comment.id, "user-2", "like");
console.log(toggled.reactions["like"]); // ["user-3"] — user-2 removed
```

## Moderation workflow
```typescript
const comments = new CommentSystem();

const comment = comments.addComment("post-1", "user-1", "Buy cheap stuff at spam.com!");

// Flag the comment
comments.moderate(comment.id, "mod-1", "flag");

// Review and reject
comments.moderate(comment.id, "mod-1", "reject");

// Rejected comments won't appear in listings
const thread = comments.listComments("post-1", 1, "newest");
console.log(thread.totalCount); // 0 (rejected comments excluded)

// Approve a flagged comment
const safe = comments.addComment("post-1", "user-2", "Legitimate comment");
comments.moderate(safe.id, "mod-1", "flag");
comments.moderate(safe.id, "mod-1", "approve");
```

## Edit and delete comments
```typescript
const comments = new CommentSystem();

const comment = comments.addComment("post-1", "user-1", "Orignal text");

// Edit (only by author)
const edited = comments.editComment(comment.id, "user-1", "Original text (fixed typo)");
console.log(edited.content); // "Original text (fixed typo)"
console.log(edited.updatedAt > edited.createdAt); // true

// Delete (soft delete — preserves thread structure)
const deleted = comments.deleteComment(comment.id, "user-1");
console.log(deleted); // true

const thread = comments.listComments("post-1", 1, "newest");
console.log(thread.comments[0].content); // "[deleted]"
console.log(thread.comments[0].deleted); // true
```

## Event-driven notifications
```typescript
const comments = new CommentSystem();

comments.on("onCommentAdded", ({ commentId, authorId, threadId, parentId }) => {
  console.log(`New comment ${commentId} by ${authorId} on ${threadId}`);
  if (parentId) {
    // Notify the parent comment's author
    notificationService.send({
      to: getAuthorOfComment(parentId),
      message: `${authorId} replied to your comment`,
    });
  }
});

comments.on("onCommentModerated", ({ commentId, action, moderatorId }) => {
  if (action === "reject") {
    const comment = comments.listComments("any"); // get the comment
    notificationService.send({
      to: "content-team",
      message: `Comment ${commentId} was rejected by ${moderatorId}`,
    });
  }
});
```

---

## Python Examples

### Adding comments and replies
```python
from comment_system import CommentSystem

comments = CommentSystem(max_depth=5, page_size=20)

c1 = comments.add_comment("article-42", "user-1", "Great article!")
reply = comments.add_comment("article-42", "user-2", "Thanks!", c1["id"])
print(reply["parent_id"])  # c1["id"]
```

### Pagination
```python
thread = comments.list_comments("article-42", page=1, sort_by="newest")
print(f"Total: {thread['total_count']}, Page: {thread['page']}")
for c in thread["comments"]:
    print(f"  {c['author_id']}: {c['content']}")
```

### Reactions and moderation
```python
comments.add_reaction(c1["id"], "user-2", "like")
comments.add_reaction(c1["id"], "user-3", "love")

comments.moderate(c1["id"], "mod-1", "flag")
comments.moderate(c1["id"], "mod-1", "approve")
```

### Editing and deletion
```python
edited = comments.edit_comment(c1["id"], "user-1", "Updated content")
deleted = comments.delete_comment(c1["id"], "user-1")
print(deleted)  # True
```
