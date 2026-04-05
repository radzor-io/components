# @radzor/github-bot — Usage Examples

## Example 1: Create an issue with labels

```typescript
import { GitHubBot } from "./components/github-bot/src";

const bot = new GitHubBot({
  token: process.env.GITHUB_TOKEN!,
  owner: "my-org",
  repo: "my-repo",
});

const issue = await bot.createIssue(
  "Login button unresponsive on Safari",
  "## Steps to reproduce\n1. Open Safari 17\n2. Click Login\n\n## Expected\nModal opens\n\n## Actual\nNothing happens",
  ["bug", "frontend"],
  ["alice"]
);

console.log(`Created issue #${issue.number}: ${issue.url}`);
```

## Example 2: Comment on an issue and listen for events

```typescript
import { GitHubBot } from "./components/github-bot/src";

const bot = new GitHubBot({
  token: process.env.GITHUB_TOKEN!,
  owner: "my-org",
  repo: "my-repo",
});

bot.on("onCommentPosted", ({ id, url }) => {
  console.log(`Comment ${id} posted: ${url}`);
});

bot.on("onError", ({ code, message }) => {
  console.error(`GitHub error [${code}]: ${message}`);
});

await bot.createComment(42, "This has been triaged and assigned to the frontend team.");
```

## Example 3: Trigger a CI workflow on a branch

```typescript
import { GitHubBot } from "./components/github-bot/src";

const bot = new GitHubBot({
  token: process.env.GITHUB_TOKEN!,
  owner: "my-org",
  repo: "my-repo",
});

await bot.triggerWorkflow("deploy.yml", "main", {
  environment: "staging",
  notify_slack: "true",
});

console.log("Workflow dispatch sent.");
```

## Example 4: Merge a pull request after checks pass

```typescript
import { GitHubBot } from "./components/github-bot/src";

const bot = new GitHubBot({
  token: process.env.GITHUB_TOKEN!,
  owner: "my-org",
  repo: "my-repo",
});

const pr = await bot.getPullRequest(15);

if (pr.state === "open" && pr.mergeable) {
  const result = await bot.mergePullRequest(15, "squash");
  console.log(`Merged PR #15 at commit ${result.sha}`);
} else {
  console.log(`PR not ready: state=${pr.state}, mergeable=${pr.mergeable}`);
}
```

## Example 5: Create a release after tagging

```typescript
import { GitHubBot } from "./components/github-bot/src";

const bot = new GitHubBot({
  token: process.env.GITHUB_TOKEN!,
  owner: "my-org",
  repo: "my-repo",
});

const release = await bot.createRelease(
  "v2.1.0",
  "Release v2.1.0",
  "## What's new\n- Improved performance\n- Bug fixes\n\nSee [CHANGELOG](./CHANGELOG.md) for details.",
  false
);

console.log(`Release published: ${release.url}`);
```
