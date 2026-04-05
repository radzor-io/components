# How to integrate @radzor/markdown-render

## Overview
Zero-dependency Markdown renderer with YAML frontmatter extraction, HTML sanitization, syntax highlight class hooks, and optional linkification. Safe by default — sanitize is always on for user-generated content.

## Integration Steps

1. **Import and configure:**
```typescript
import { MarkdownRenderer } from "@radzor/markdown-render";

const renderer = new MarkdownRenderer({
  sanitize: true,        // always true for user content
  syntaxHighlight: true, // adds language-* class to code blocks
  breaks: false,         // convert single newlines to <br>
  linkify: true,         // auto-link bare URLs
});
```

2. **Render Markdown to HTML:**
```typescript
const { html, frontmatter } = await renderer.render(markdownString);
// Inject html into DOM — it is already sanitized
```

3. **Extract frontmatter without rendering:**
```typescript
const { data, content } = renderer.extractFrontmatter(markdownString);
// data: parsed key/value pairs from --- YAML block
// content: remaining Markdown without the frontmatter block
```

4. **Get plain text (for search indexing, previews):**
```typescript
const plain = renderer.toPlainText(markdownString);
```

5. **Listen for events:**
```typescript
renderer.on("onRendered", ({ html, frontmatterKeys }) => {
  console.log("Rendered, frontmatter keys:", frontmatterKeys);
});
renderer.on("onError", ({ code, message }) => {
  console.error(`Render error [${code}]: ${message}`);
});
```

6. **Per-call option overrides:**
```typescript
const { html } = await renderer.render(content, { breaks: true, linkify: false });
```

## Constraints
- `sanitize` defaults to `true` — never disable for user-generated content.
- Frontmatter must be between the first pair of `---` delimiters at the start of the file.
- YAML parser handles scalar values, quoted strings, and inline arrays. Nested objects and multi-document YAML are not supported.
- Syntax highlighting adds `class="language-X"` to `<code>` blocks; pair with Prism.js or highlight.js CSS on the client.
- PNG/image rendering is not performed — `<img>` tags are passed through sanitization.
