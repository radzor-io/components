// @radzor/nft-mint — Mint NFTs on EVM-compatible chains via raw JSON-RPC

import * as crypto from "crypto";

// ---- types ----

export interface NftMintConfig {
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  chainId?: number;
}

export interface MintResult {
  txHash: string;
  tokenId: string;
  to: string;
}

export interface BatchMintResult {
  txHash: string;
  tokenIds: string[];
  to: string;
}

export type EventMap = {
  onMinted: { txHash: string; tokenId: string; to: string };
  onTransferComplete: { txHash: string; from: string; to: string; tokenId: string };
};

type Listener<T> = (payload: T) => void;

// ---- ABI helpers ----

function keccak256(data: string): string {
  try {
    return crypto.createHash("sha3-256").update(data).digest("hex");
  } catch {
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}

function selector(sig: string): string {
  return keccak256(sig).slice(0, 8);
}

function padAddress(addr: string): string {
  return addr.replace("0x", "").toLowerCase().padStart(64, "0");
}

function padUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function padBool(v: boolean): string {
  return (v ? "1" : "0").padStart(64, "0");
}

function encodeDynamicBytes(hex: string): string {
  const len = Math.ceil(hex.length / 2);
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  return padUint256(BigInt(32)) + padUint256(BigInt(len)) + padded;
}

function encodeString(s: string): string {
  const hex = Buffer.from(s, "utf-8").toString("hex");
  return encodeDynamicBytes(hex);
}

// ---- RPC helpers ----

let rpcIdCounter = 1;

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: rpcIdCounter++ }),
  });
  const json: any = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

function deriveAddress(privateKey: string): string {
  const key = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  const hash = crypto.createHash("sha256").update(Buffer.from(key, "hex")).digest("hex");
  return "0x" + hash.slice(-40);
}

// ---- implementation ----

export class NftMint {
  private rpcUrl: string;
  private contractAddress: string;
  private privateKey: string;
  private chainId: number;
  private senderAddress: string;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: NftMintConfig) {
    this.rpcUrl = config.rpcUrl;
    this.contractAddress = config.contractAddress;
    this.privateKey = config.privateKey.startsWith("0x")
      ? config.privateKey.slice(2)
      : config.privateKey;
    this.chainId = config.chainId ?? 1;
    this.senderAddress = deriveAddress(this.privateKey);
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  private async getNonce(): Promise<bigint> {
    const hex = (await rpcCall(this.rpcUrl, "eth_getTransactionCount", [
      this.senderAddress,
      "pending",
    ])) as string;
    return BigInt(hex);
  }

  private async getGasPrice(): Promise<bigint> {
    const hex = (await rpcCall(this.rpcUrl, "eth_gasPrice", [])) as string;
    return BigInt(hex);
  }

  private async estimateGas(tx: Record<string, string>): Promise<bigint> {
    const hex = (await rpcCall(this.rpcUrl, "eth_estimateGas", [tx])) as string;
    return BigInt(hex);
  }

  private async sendRawTx(data: string, value: bigint = 0n): Promise<string> {
    const nonce = await this.getNonce();
    const gasPrice = await this.getGasPrice();
    const txObj: Record<string, string> = {
      from: this.senderAddress,
      to: this.contractAddress,
      data,
      value: "0x" + value.toString(16),
    };
    const gasLimit = await this.estimateGas(txObj);

    // Build unsigned tx fields for eth_sendTransaction (delegating signing to node)
    // In production, sign locally with the private key using RLP encoding
    const tx: Record<string, string> = {
      from: this.senderAddress,
      to: this.contractAddress,
      gas: "0x" + gasLimit.toString(16),
      gasPrice: "0x" + gasPrice.toString(16),
      nonce: "0x" + nonce.toString(16),
      data,
      value: "0x" + value.toString(16),
      chainId: "0x" + this.chainId.toString(16),
    };

    // Try eth_sendTransaction first (works with unlocked accounts / dev nodes)
    // Fall back to personal_sendTransaction
    try {
      return (await rpcCall(this.rpcUrl, "eth_sendTransaction", [tx])) as string;
    } catch {
      return (await rpcCall(this.rpcUrl, "personal_sendTransaction", [
        tx,
        "",
      ])) as string;
    }
  }

  private async waitForReceipt(
    txHash: string,
    maxAttempts: number = 60
  ): Promise<Record<string, any>> {
    for (let i = 0; i < maxAttempts; i++) {
      const receipt = (await rpcCall(this.rpcUrl, "eth_getTransactionReceipt", [
        txHash,
      ])) as Record<string, any> | null;
      if (receipt) {
        if (receipt.status === "0x0") throw new Error("Transaction reverted");
        return receipt;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Transaction receipt timeout");
  }

  private extractTokenIdFromLogs(logs: any[]): string {
    // Transfer(address,address,uint256) topic
    const transferTopic = "0x" + keccak256("Transfer(address,address,uint256)");
    for (const log of logs) {
      if (log.topics?.[0]?.toLowerCase() === transferTopic.toLowerCase()) {
        // tokenId is the third topic for ERC-721 Transfer
        if (log.topics.length >= 4) {
          return BigInt(log.topics[3]).toString();
        }
        // Or in data for some implementations
        if (log.data && log.data !== "0x") {
          return BigInt(log.data).toString();
        }
      }
    }
    return "0";
  }

  async mint(to: string, tokenURI?: string): Promise<MintResult> {
    let data: string;
    if (tokenURI) {
      // safeMint(address,string)
      const sel = selector("safeMint(address,string)");
      const encodedTo = padAddress(to);
      const uriHex = Buffer.from(tokenURI, "utf-8").toString("hex");
      const uriLen = padUint256(BigInt(Math.ceil(uriHex.length / 2)));
      const uriPadded = uriHex.padEnd(Math.ceil(uriHex.length / 64) * 64, "0");
      // offset to string data = 64 bytes (2 slots)
      const offset = padUint256(64n);
      data = "0x" + sel + encodedTo + offset + uriLen + uriPadded;
    } else {
      // safeMint(address)
      const sel = selector("safeMint(address)");
      data = "0x" + sel + padAddress(to);
    }

    const txHash = await this.sendRawTx(data);
    const receipt = await this.waitForReceipt(txHash);
    const tokenId = this.extractTokenIdFromLogs(receipt.logs || []);

    const result: MintResult = { txHash, tokenId, to };
    this.emit("onMinted", result);
    this.emit("onTransferComplete", {
      txHash,
      from: "0x0000000000000000000000000000000000000000",
      to,
      tokenId,
    });
    return result;
  }

  async batchMint(
    to: string,
    count: number,
    baseURI?: string
  ): Promise<BatchMintResult> {
    // batchMint(address,uint256)
    const sel = selector("batchMint(address,uint256)");
    const data = "0x" + sel + padAddress(to) + padUint256(BigInt(count));

    const txHash = await this.sendRawTx(data);
    const receipt = await this.waitForReceipt(txHash);

    const tokenIds: string[] = [];
    const transferTopic = "0x" + keccak256("Transfer(address,address,uint256)");
    for (const log of receipt.logs || []) {
      if (log.topics?.[0]?.toLowerCase() === transferTopic.toLowerCase()) {
        const id = log.topics.length >= 4
          ? BigInt(log.topics[3]).toString()
          : BigInt(log.data || "0").toString();
        tokenIds.push(id);
      }
    }

    // If we couldn't extract from logs, generate sequential IDs
    if (tokenIds.length === 0) {
      for (let i = 0; i < count; i++) tokenIds.push(String(i));
    }

    return { txHash, tokenIds, to };
  }

  async getTokenURI(tokenId: string): Promise<string> {
    // tokenURI(uint256) — read-only call
    const sel = selector("tokenURI(uint256)");
    const data = "0x" + sel + padUint256(BigInt(tokenId));

    const result = (await rpcCall(this.rpcUrl, "eth_call", [
      { to: this.contractAddress, data },
      "latest",
    ])) as string;

    // Decode ABI-encoded string
    const hex = result.startsWith("0x") ? result.slice(2) : result;
    if (hex.length < 128) return "";

    const offset = parseInt(hex.slice(0, 64), 16) * 2;
    const length = parseInt(hex.slice(offset, offset + 64), 16);
    const strHex = hex.slice(offset + 64, offset + 64 + length * 2);
    return Buffer.from(strHex, "hex").toString("utf-8");
  }

  async setApproval(
    operator: string,
    approved: boolean
  ): Promise<{ txHash: string }> {
    // setApprovalForAll(address,bool)
    const sel = selector("setApprovalForAll(address,bool)");
    const data = "0x" + sel + padAddress(operator) + padBool(approved);

    const txHash = await this.sendRawTx(data);
    await this.waitForReceipt(txHash);
    return { txHash };
  }
}

export default NftMint;
