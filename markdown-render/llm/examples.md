# @radzor/markdown-render — Usage Examples

## Basic Blog Post Rendering

```typescript
import { MarkdownRenderer } from "@radzor/markdown-render";

const renderer = new MarkdownRenderer({ sanitize: true, syntaxHighlight: true });

const post = `---
title: Getting Started
date: 2026-01-15
tags: [typescript, guide]
---

# Getting Started

Welcome to the **guide**. Here is some \`inline code\`.

\`\`\`typescript
const x: number = 42;
\`\`\`
`;

const { html, frontmatter } = await renderer.render(post);
console.log(frontmatter.title); // "Getting Started"
console.log(html); // <h1>Getting Started</h1> ...
```

## Content Management System Route

```typescript
import { MarkdownRenderer } from "@radzor/markdown-render";

const renderer = new MarkdownRenderer({ sanitize: true });

async function renderArticle(slug: string) {
  const raw = await fs.readFile(`content/${slug}.md`, "utf-8");
  const { html, frontmatter } = await renderer.render(raw);

  return {
    title: frontmatter.title as string,
    publishedAt: frontmatter.date as string,
    html,
  };
}
```

## Search Index Generation

```typescript
const renderer = new MarkdownRenderer();

async function indexDocuments(files: string[]) {
  return Promise.all(
    files.map(async (path) => {
      const raw = await fs.readFile(path, "utf-8");
      const { data } = renderer.extractFrontmatter(raw);
      const plain = renderer.toPlainText(raw);
      return { path, title: data.title, body: plain };
    })
  );
}
```

## User Comment Rendering (Strict Sanitization)

```typescript
const commentRenderer = new MarkdownRenderer({
  sanitize: true,
  allowedTags: ["p", "strong", "em", "code", "pre", "ul", "ol", "li", "a", "blockquote"],
  linkify: false, // disable for user comments
});

async function renderComment(userInput: string) {
  renderer.on("onError", ({ message }) => console.error("Comment render failed:", message));
  const { html } = await commentRenderer.render(userInput);
  return html; // safe to inject into DOM
}
```

## Frontmatter-Driven Document Pipeline

```typescript
const renderer = new MarkdownRenderer();

function processDocs(markdownFiles: string[]) {
  return markdownFiles.map((content) => {
    const { data, content: body } = renderer.extractFrontmatter(content);

    if (!data.published) return null; // skip drafts

    return {
      slug: data.slug as string,
      title: data.title as string,
      excerpt: renderer.toPlainText(body).slice(0, 160),
      body,
    };
  }).filter(Boolean);
}
```
