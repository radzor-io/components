# How to integrate @radzor/github-bot

## Overview

Automates GitHub repository operations via the REST API. Creates issues, posts comments, triggers workflows, reads and merges pull requests, and publishes releases — all using a fine-grained personal access token.

## Integration Steps

1. Install with `radzor add github-bot`.
2. Create a fine-grained PAT at https://github.com/settings/tokens with scopes for `issues`, `pull_requests`, `actions`, and `contents` as needed.
3. Instantiate `GitHubBot` with `token`, `owner`, and `repo`. Optionally override `baseUrl` for GitHub Enterprise.
4. Subscribe to events before calling actions if you need side-effect tracking.
5. Call the relevant action method and await the typed result.

```typescript
import { GitHubBot } from "./components/github-bot/src";

const bot = new GitHubBot({
  token: process.env.GITHUB_TOKEN!,
  owner: "my-org",
  repo: "my-repo",
});

bot.on("onIssueCreated", ({ number, url }) => {
  console.log(`Issue #${number} created: ${url}`);
});

const issue = await bot.createIssue("Bug: login fails", "Steps to reproduce...", ["bug"]);
```

## Constraints

- Fine-grained PAT must have the minimum scopes required for each action — do not use a classic token with full access in production.
- `triggerWorkflow` requires the workflow to have a `workflow_dispatch` trigger configured in its YAML.
- GitHub enforces a 5000 requests/hour rate limit per token. Space out bulk operations.
- `getPullRequest` returns `mergeable: null` when GitHub is still computing mergeability — poll again after a short delay.
- `baseUrl` must not include a trailing slash.

## Composability

Combine with `@radzor/http-client` for custom GitHub API calls not covered by this component. Use with `@radzor/cron-scheduler` to run periodic automation (e.g., stale issue cleanup). The `onError` event can integrate with `@radzor/slack-bot` to forward errors to a Slack channel.
