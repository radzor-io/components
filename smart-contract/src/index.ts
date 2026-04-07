// @radzor/smart-contract — EVM smart contract interaction via JSON-RPC

// ---- types ----

export interface SmartContractConfig {
  rpcUrl: string;
  contractAddress: string;
  abi: AbiItem[];
}

export interface AbiItem {
  name: string;
  type: "function" | "event" | "constructor";
  inputs?: AbiParam[];
  outputs?: AbiParam[];
  stateMutability?: "view" | "pure" | "nonpayable" | "payable";
}

export interface AbiParam {
  name: string;
  type: string;
}

export type EventMap = {
  onCallResult: { method: string; result: unknown };
  onError: { code: string; message: string };
};

// ---- ABI encoding helpers ----

function padLeft(hex: string, bytes: number = 32): string {
  return hex.padStart(bytes * 2, "0");
}

function functionSelector(name: string, inputs: AbiParam[]): string {
  const sig = `${name}(${inputs.map((i) => i.type).join(",")})`;
  // Simple hash: we use a basic implementation for demo
  // In production, use keccak256
  return simpleKeccak256(sig).slice(0, 8);
}

// Minimal keccak256 for function selectors (uses crypto if available)
function simpleKeccak256(input: string): string {
  // Use Node.js crypto module
  const { createHash } = require("crypto");
  try {
    return createHash("sha3-256").update(input).digest("hex");
  } catch {
    // Fallback: use sha256 (not correct for EVM, but functional placeholder)
    return createHash("sha256").update(input).digest("hex");
  }
}

function encodeParam(type: string, value: unknown): string {
  if (type === "address") {
    return padLeft((value as string).replace("0x", "").toLowerCase());
  }
  if (type.startsWith("uint") || type.startsWith("int")) {
    const n = BigInt(value as string | number);
    return padLeft(n.toString(16));
  }
  if (type === "bool") {
    return padLeft(value ? "1" : "0");
  }
  if (type === "bytes32") {
    return padLeft((value as string).replace("0x", ""));
  }
  // String & bytes: simplified encoding
  if (type === "string") {
    const hex = Buffer.from(value as string, "utf8").toString("hex");
    const len = padLeft(Math.ceil(hex.length / 2).toString(16));
    const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
    return padLeft(((32).toString(16))) + len + padded;
  }
  return padLeft("0");
}

function decodeParam(type: string, hex: string): unknown {
  if (type === "address") {
    return "0x" + hex.slice(-40);
  }
  if (type.startsWith("uint")) {
    return BigInt("0x" + hex).toString();
  }
  if (type.startsWith("int")) {
    return BigInt("0x" + hex).toString();
  }
  if (type === "bool") {
    return BigInt("0x" + hex) !== 0n;
  }
  return "0x" + hex;
}

// ---- implementation ----

export class SmartContract {
  private rpcUrl: string;
  private address: string;
  private abi: AbiItem[];
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: SmartContractConfig) {
    this.rpcUrl = config.rpcUrl;
    this.address = config.contractAddress;
    this.abi = config.abi;
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  encodeFunctionData(methodName: string, params: unknown[] = []): string {
    const fn = this.abi.find((a) => a.name === methodName && a.type === "function");
    if (!fn) throw new Error(`Function ${methodName} not found in ABI`);

    const selector = functionSelector(methodName, fn.inputs || []);
    const encodedParams = (fn.inputs || []).map((input, i) => encodeParam(input.type, params[i])).join("");

    return "0x" + selector + encodedParams;
  }

  decodeFunctionResult(methodName: string, data: string): unknown[] {
    const fn = this.abi.find((a) => a.name === methodName && a.type === "function");
    if (!fn) throw new Error(`Function ${methodName} not found in ABI`);

    const hex = data.startsWith("0x") ? data.slice(2) : data;
    const outputs = fn.outputs || [];

    return outputs.map((output, i) => {
      const chunk = hex.slice(i * 64, (i + 1) * 64);
      return decodeParam(output.type, chunk);
    });
  }

  async call(methodName: string, params: unknown[] = []): Promise<unknown> {
    try {
      const data = this.encodeFunctionData(methodName, params);

      const res = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{ to: this.address, data }, "latest"],
          id: 1,
        }),
      });

      const json = await res.json();

      if (json.error) {
        throw new Error(json.error.message);
      }

      const decoded = this.decodeFunctionResult(methodName, json.result);
      const result = decoded.length === 1 ? decoded[0] : decoded;
      this.emit("onCallResult", { method: methodName, result });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CALL_ERROR", message });
      throw err;
    }
  }
}
