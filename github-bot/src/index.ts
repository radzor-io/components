// @radzor/github-bot — GitHub REST API automation bot

export interface GitHubBotConfig {
  token: string;
  owner: string;
  repo: string;
  baseUrl?: string;
}

export interface IssueResult {
  number: number;
  url: string;
  id: number;
}

export interface CommentResult {
  id: number;
  url: string;
}

export interface PullRequestResult {
  number: number;
  title: string;
  state: string;
  mergeable: boolean | null;
  headSha: string;
}

export interface MergeResult {
  sha: string;
  merged: boolean;
}

export interface ReleaseResult {
  id: number;
  url: string;
  uploadUrl: string;
}

export type EventMap = {
  onIssueCreated: { number: number; url: string };
  onCommentPosted: { id: number; url: string };
  onError: { code: string; message: string };
};

export class GitHubBot {
  private config: GitHubBotConfig;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: GitHubBotConfig) {
    this.config = { baseUrl: "https://api.github.com", ...config };
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Function);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((h) => h !== handler));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  private async _request(method: string, path: string, body?: unknown): Promise<any> {
    const { baseUrl, owner, repo, token } = this.config;
    const url = `${baseUrl}/repos/${owner}/${repo}${path}`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? `GitHub API error: ${res.status}`);
      }

      if (res.status === 204) return undefined;
      return res.json();
    } catch (err: any) {
      this.emit("onError", { code: "API_ERROR", message: err.message });
      throw err;
    }
  }

  async createIssue(
    title: string,
    body: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<IssueResult> {
    const data = await this._request("POST", "/issues", { title, body, labels, assignees });
    const result: IssueResult = { number: data.number, url: data.html_url, id: data.id };
    this.emit("onIssueCreated", { number: result.number, url: result.url });
    return result;
  }

  async createComment(issueNumber: number, body: string): Promise<CommentResult> {
    const data = await this._request("POST", `/issues/${issueNumber}/comments`, { body });
    const result: CommentResult = { id: data.id, url: data.html_url };
    this.emit("onCommentPosted", { id: result.id, url: result.url });
    return result;
  }

  async triggerWorkflow(
    workflow: string,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<void> {
    const { baseUrl, owner, repo, token } = this.config;
    const url = `${baseUrl}/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref, inputs: inputs ?? {} }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? `GitHub API error: ${res.status}`);
      }
    } catch (err: any) {
      this.emit("onError", { code: "WORKFLOW_ERROR", message: err.message });
      throw err;
    }
  }

  async getPullRequest(number: number): Promise<PullRequestResult> {
    const data = await this._request("GET", `/pulls/${number}`);
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      mergeable: data.mergeable,
      headSha: data.head.sha,
    };
  }

  async mergePullRequest(
    number: number,
    method: "merge" | "squash" | "rebase" = "merge"
  ): Promise<MergeResult> {
    const data = await this._request("PUT", `/pulls/${number}/merge`, { merge_method: method });
    return { sha: data.sha, merged: data.merged };
  }

  async createRelease(
    tag: string,
    name: string,
    body?: string,
    draft?: boolean
  ): Promise<ReleaseResult> {
    const data = await this._request("POST", "/releases", {
      tag_name: tag,
      name,
      body: body ?? "",
      draft: draft ?? false,
    });
    return { id: data.id, url: data.html_url, uploadUrl: data.upload_url };
  }
}
