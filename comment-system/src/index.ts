// @radzor/comment-system — Threaded comment system with moderation and reactions

export interface Comment {
  id: string;
  threadId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  status: "pending" | "approved" | "rejected" | "flagged";
  reactions: Record<string, Set<string>>;
  replies: Comment[];
  depth: number;
}

export interface CommentThread {
  comments: CommentView[];
  totalCount: number;
  hasMore: boolean;
  page: number;
}

export interface CommentView {
  id: string;
  threadId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  status: string;
  reactions: Record<string, string[]>;
  reactionCount: number;
  replies: CommentView[];
  depth: number;
}

export interface CommentSystemConfig {
  maxDepth?: number;
  pageSize?: number;
  allowedReactions?: string[];
}

export type EventMap = {
  onCommentAdded: { commentId: string; authorId: string; threadId: string; parentId: string };
  onCommentModerated: { commentId: string; action: string; moderatorId: string };
};

type Listener<T> = (event: T) => void;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class CommentSystem {
  private config: Required<CommentSystemConfig>;
  private comments = new Map<string, Comment>();
  private threadIndex = new Map<string, Set<string>>();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: CommentSystemConfig = {}) {
    this.config = {
      maxDepth: config.maxDepth ?? 5,
      pageSize: config.pageSize ?? 20,
      allowedReactions: config.allowedReactions ?? ["like", "dislike", "love", "laugh", "sad", "angry"],
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  private getComment(commentId: string): Comment {
    const comment = this.comments.get(commentId);
    if (!comment) throw new Error(`Comment '${commentId}' not found`);
    return comment;
  }

  private toView(comment: Comment): CommentView {
    const reactions: Record<string, string[]> = {};
    let reactionCount = 0;
    for (const [type, users] of Object.entries(comment.reactions)) {
      const userList = Array.from(users);
      reactions[type] = userList;
      reactionCount += userList.length;
    }

    return {
      id: comment.id,
      threadId: comment.threadId,
      parentId: comment.parentId,
      authorId: comment.authorId,
      content: comment.deleted ? "[deleted]" : comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      deleted: comment.deleted,
      status: comment.status,
      reactions,
      reactionCount,
      replies: comment.replies.map((r) => this.toView(r)),
      depth: comment.depth,
    };
  }

  addComment(threadId: string, authorId: string, content: string, parentId?: string): CommentView {
    if (!content || content.trim().length === 0) {
      throw new Error("Comment content cannot be empty");
    }

    let depth = 0;
    let parentComment: Comment | undefined;

    if (parentId) {
      parentComment = this.comments.get(parentId);
      if (!parentComment) throw new Error(`Parent comment '${parentId}' not found`);
      if (parentComment.threadId !== threadId) throw new Error("Parent comment belongs to a different thread");
      depth = parentComment.depth + 1;
      if (depth > this.config.maxDepth) {
        throw new Error(`Maximum nesting depth (${this.config.maxDepth}) exceeded`);
      }
    }

    const id = generateId();
    const now = Date.now();

    const comment: Comment = {
      id,
      threadId,
      parentId: parentId ?? null,
      authorId,
      content: content.trim(),
      createdAt: now,
      updatedAt: now,
      deleted: false,
      status: "approved",
      reactions: {},
      replies: [],
      depth,
    };

    this.comments.set(id, comment);

    // Add to thread index
    if (!this.threadIndex.has(threadId)) {
      this.threadIndex.set(threadId, new Set());
    }
    this.threadIndex.get(threadId)!.add(id);

    // Add as reply to parent
    if (parentComment) {
      parentComment.replies.push(comment);
    }

    this.emit("onCommentAdded", {
      commentId: id,
      authorId,
      threadId,
      parentId: parentId ?? "",
    });

    return this.toView(comment);
  }

  deleteComment(commentId: string, userId: string): boolean {
    const comment = this.getComment(commentId);
    if (comment.authorId !== userId) {
      throw new Error("Only the author can delete a comment");
    }
    if (comment.deleted) return false;

    comment.deleted = true;
    comment.updatedAt = Date.now();
    return true;
  }

  editComment(commentId: string, userId: string, content: string): CommentView {
    const comment = this.getComment(commentId);
    if (comment.authorId !== userId) {
      throw new Error("Only the author can edit a comment");
    }
    if (comment.deleted) {
      throw new Error("Cannot edit a deleted comment");
    }
    if (!content || content.trim().length === 0) {
      throw new Error("Comment content cannot be empty");
    }

    comment.content = content.trim();
    comment.updatedAt = Date.now();
    return this.toView(comment);
  }

  addReaction(commentId: string, userId: string, reaction: string): CommentView {
    if (!this.config.allowedReactions.includes(reaction)) {
      throw new Error(`Reaction '${reaction}' is not allowed. Allowed: ${this.config.allowedReactions.join(", ")}`);
    }

    const comment = this.getComment(commentId);
    if (comment.deleted) throw new Error("Cannot react to a deleted comment");

    if (!comment.reactions[reaction]) {
      comment.reactions[reaction] = new Set();
    }

    const userSet = comment.reactions[reaction];
    if (userSet.has(userId)) {
      userSet.delete(userId);
      if (userSet.size === 0) delete comment.reactions[reaction];
    } else {
      userSet.add(userId);
    }

    return this.toView(comment);
  }

  moderate(commentId: string, moderatorId: string, action: "approve" | "reject" | "flag"): CommentView {
    const comment = this.getComment(commentId);

    switch (action) {
      case "approve":
        comment.status = "approved";
        break;
      case "reject":
        comment.status = "rejected";
        break;
      case "flag":
        comment.status = "flagged";
        break;
    }

    comment.updatedAt = Date.now();

    this.emit("onCommentModerated", {
      commentId,
      action,
      moderatorId,
    });

    return this.toView(comment);
  }

  listComments(threadId: string, page?: number, sortBy?: "newest" | "oldest" | "popular"): CommentThread {
    const pageNum = page ?? 1;
    const sort = sortBy ?? "newest";
    const commentIds = this.threadIndex.get(threadId);

    if (!commentIds || commentIds.size === 0) {
      return { comments: [], totalCount: 0, hasMore: false, page: pageNum };
    }

    // Get top-level comments only (parentId === null)
    let topLevel = Array.from(commentIds)
      .map((id) => this.comments.get(id)!)
      .filter((c) => c.parentId === null && c.status !== "rejected");

    // Sort
    switch (sort) {
      case "newest":
        topLevel.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        topLevel.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "popular":
        topLevel.sort((a, b) => {
          const aCount = Object.values(a.reactions).reduce((sum, s) => sum + s.size, 0);
          const bCount = Object.values(b.reactions).reduce((sum, s) => sum + s.size, 0);
          return bCount - aCount;
        });
        break;
    }

    const totalCount = topLevel.length;
    const start = (pageNum - 1) * this.config.pageSize;
    const end = start + this.config.pageSize;
    topLevel = topLevel.slice(start, end);

    return {
      comments: topLevel.map((c) => this.toView(c)),
      totalCount,
      hasMore: end < totalCount,
      page: pageNum,
    };
  }
}

export default CommentSystem;
