// @radzor/chatbot-flow — Build conversational chatbot flows with nodes, conditions, and actions

export interface FlowNode {
  id: string;
  name: string;
  message: string;
  options?: string[];
  transitions?: FlowTransition[];
  action?: (context: Record<string, unknown>, userMessage: string) => Record<string, unknown> | void;
  isEnd?: boolean;
}

export interface FlowTransition {
  target: string;
  condition?: (userMessage: string, context: Record<string, unknown>) => boolean;
  pattern?: string;
  label?: string;
}

export interface FlowDefinition {
  rootNodeId: string;
  nodes: FlowNode[];
}

export interface Message {
  role: "user" | "bot";
  content: string;
  nodeId?: string;
  timestamp: number;
}

export interface BotResponse {
  message: string;
  options: string[] | null;
  context: Record<string, unknown>;
  nodeId: string;
  isComplete: boolean;
}

export interface ChatbotFlowConfig {
  flow: FlowDefinition;
  fallbackMessage?: string;
  maxHistory?: number;
}

interface Session {
  currentNodeId: string;
  context: Record<string, unknown>;
  history: Message[];
  isComplete: boolean;
}

export type EventMap = {
  onNodeReached: { sessionId: string; nodeId: string; nodeName: string };
  onFlowComplete: { sessionId: string; context: Record<string, unknown>; messageCount: number };
  onFallback: { sessionId: string; userMessage: string; currentNode: string };
};

type Listener<T> = (event: T) => void;

export class ChatbotFlow {
  private flow: FlowDefinition;
  private nodeMap: Map<string, FlowNode>;
  private sessions = new Map<string, Session>();
  private fallbackMessage: string;
  private maxHistory: number;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: ChatbotFlowConfig) {
    this.flow = config.flow;
    this.fallbackMessage = config.fallbackMessage ?? "I didn't understand that. Could you rephrase?";
    this.maxHistory = config.maxHistory ?? 50;

    this.nodeMap = new Map();
    for (const node of this.flow.nodes) {
      this.nodeMap.set(node.id, node);
    }

    if (!this.nodeMap.has(this.flow.rootNodeId)) {
      throw new Error(`Root node '${this.flow.rootNodeId}' not found in flow definition`);
    }
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

  private getNode(nodeId: string): FlowNode {
    const node = this.nodeMap.get(nodeId);
    if (!node) throw new Error(`Node '${nodeId}' not found`);
    return node;
  }

  private getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found. Call start() first.`);
    return session;
  }

  private interpolateMessage(message: string, context: Record<string, unknown>): string {
    return message.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = context[key];
      return val !== undefined ? String(val) : `{{${key}}}`;
    });
  }

  private buildResponse(session: Session): BotResponse {
    const node = this.getNode(session.currentNodeId);
    const message = this.interpolateMessage(node.message, session.context);
    return {
      message,
      options: node.options ?? null,
      context: { ...session.context },
      nodeId: node.id,
      isComplete: session.isComplete,
    };
  }

  private addToHistory(session: Session, role: "user" | "bot", content: string, nodeId?: string): void {
    session.history.push({ role, content, nodeId, timestamp: Date.now() });
    if (session.history.length > this.maxHistory) {
      session.history = session.history.slice(-this.maxHistory);
    }
  }

  private matchesPattern(input: string, pattern: string): boolean {
    const normalized = input.toLowerCase().trim();
    const patternLower = pattern.toLowerCase().trim();

    // Support pipe-separated alternatives: "yes|yeah|yep"
    const alternatives = patternLower.split("|").map((s) => s.trim());
    for (const alt of alternatives) {
      if (alt.startsWith("/") && alt.endsWith("/")) {
        const regex = new RegExp(alt.slice(1, -1), "i");
        if (regex.test(normalized)) return true;
      } else if (alt === "*") {
        return true;
      } else if (normalized.includes(alt)) {
        return true;
      }
    }
    return false;
  }

  private findTransition(node: FlowNode, userMessage: string, context: Record<string, unknown>): string | null {
    if (!node.transitions || node.transitions.length === 0) return null;

    for (const transition of node.transitions) {
      if (transition.condition) {
        if (transition.condition(userMessage, context)) return transition.target;
        continue;
      }
      if (transition.pattern) {
        if (this.matchesPattern(userMessage, transition.pattern)) return transition.target;
        continue;
      }
      // No condition or pattern means it's a catch-all
      return transition.target;
    }

    return null;
  }

  start(sessionId: string, initialContext: Record<string, unknown> = {}): BotResponse {
    const rootNode = this.getNode(this.flow.rootNodeId);
    const session: Session = {
      currentNodeId: this.flow.rootNodeId,
      context: { ...initialContext },
      history: [],
      isComplete: rootNode.isEnd ?? false,
    };

    this.sessions.set(sessionId, session);

    // Run the node's action if present
    if (rootNode.action) {
      const newCtx = rootNode.action(session.context, "");
      if (newCtx) session.context = { ...session.context, ...newCtx };
    }

    const response = this.buildResponse(session);
    this.addToHistory(session, "bot", response.message, rootNode.id);

    this.emit("onNodeReached", { sessionId, nodeId: rootNode.id, nodeName: rootNode.name });

    if (session.isComplete) {
      this.emit("onFlowComplete", {
        sessionId,
        context: { ...session.context },
        messageCount: session.history.length,
      });
    }

    return response;
  }

  processMessage(sessionId: string, message: string): BotResponse {
    const session = this.getSession(sessionId);

    if (session.isComplete) {
      return this.buildResponse(session);
    }

    this.addToHistory(session, "user", message);

    const currentNode = this.getNode(session.currentNodeId);
    const targetNodeId = this.findTransition(currentNode, message, session.context);

    if (!targetNodeId) {
      this.emit("onFallback", { sessionId, userMessage: message, currentNode: session.currentNodeId });
      const fallbackResponse: BotResponse = {
        message: this.fallbackMessage,
        options: currentNode.options ?? null,
        context: { ...session.context },
        nodeId: session.currentNodeId,
        isComplete: false,
      };
      this.addToHistory(session, "bot", this.fallbackMessage, session.currentNodeId);
      return fallbackResponse;
    }

    const targetNode = this.getNode(targetNodeId);
    session.currentNodeId = targetNodeId;

    // Run the target node's action
    if (targetNode.action) {
      const newCtx = targetNode.action(session.context, message);
      if (newCtx) session.context = { ...session.context, ...newCtx };
    }

    if (targetNode.isEnd) {
      session.isComplete = true;
    }

    const response = this.buildResponse(session);
    this.addToHistory(session, "bot", response.message, targetNodeId);

    this.emit("onNodeReached", { sessionId, nodeId: targetNodeId, nodeName: targetNode.name });

    if (session.isComplete) {
      this.emit("onFlowComplete", {
        sessionId,
        context: { ...session.context },
        messageCount: session.history.length,
      });
    }

    return response;
  }

  setContext(sessionId: string, key: string, value: unknown): void {
    const session = this.getSession(sessionId);
    session.context[key] = value;
  }

  getHistory(sessionId: string): Message[] {
    const session = this.getSession(sessionId);
    return [...session.history];
  }

  reset(sessionId: string): BotResponse {
    this.sessions.delete(sessionId);
    return this.start(sessionId);
  }
}

export default ChatbotFlow;
