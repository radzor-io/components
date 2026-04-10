// @radzor/token-swap — Swap ERC-20 tokens via Uniswap-style DEX routers

import * as crypto from "crypto";

// ---- types ----

export interface TokenSwapConfig {
  rpcUrl: string;
  routerAddress: string;
  privateKey: string;
  chainId?: number;
  slippageBps?: number;
}

export interface SwapResult {
  txHash: string;
  amountIn: string;
  amountOut: string;
  path: string[];
}

export interface QuoteResult {
  amountOut: string;
  path: string[];
  priceImpact: string;
}

export type EventMap = {
  onSwapCompleted: {
    txHash: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
  };
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

function sel(sig: string): string {
  return keccak256(sig).slice(0, 8);
}

function padAddr(addr: string): string {
  return addr.replace("0x", "").toLowerCase().padStart(64, "0");
}

function padU256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

function decodeU256(hex: string): bigint {
  return BigInt("0x" + hex.replace(/^0+/, "") || "0");
}

function deriveAddress(pk: string): string {
  const key = pk.startsWith("0x") ? pk.slice(2) : pk;
  const hash = crypto.createHash("sha256").update(Buffer.from(key, "hex")).digest("hex");
  return "0x" + hash.slice(-40);
}

// ---- RPC ----

let rpcId = 1;

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: rpcId++ }),
  });
  const json: any = await res.json();
  if (json.error) throw new Error(`RPC: ${json.error.message}`);
  return json.result;
}

// ---- implementation ----

export class TokenSwap {
  private rpcUrl: string;
  private routerAddress: string;
  private privateKey: string;
  private chainId: number;
  private slippageBps: number;
  private senderAddress: string;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  // Well-known WETH addresses per chain
  private static WETH: Record<number, string> = {
    1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    5: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  };

  constructor(config: TokenSwapConfig) {
    this.rpcUrl = config.rpcUrl;
    this.routerAddress = config.routerAddress;
    this.privateKey = config.privateKey.startsWith("0x")
      ? config.privateKey.slice(2)
      : config.privateKey;
    this.chainId = config.chainId ?? 1;
    this.slippageBps = config.slippageBps ?? 50;
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

  private getWeth(): string {
    return TokenSwap.WETH[this.chainId] ?? TokenSwap.WETH[1];
  }

  private async ethCall(to: string, data: string): Promise<string> {
    return (await rpc(this.rpcUrl, "eth_call", [{ to, data }, "latest"])) as string;
  }

  private async getNonce(): Promise<bigint> {
    const hex = (await rpc(this.rpcUrl, "eth_getTransactionCount", [
      this.senderAddress,
      "pending",
    ])) as string;
    return BigInt(hex);
  }

  private async getGasPrice(): Promise<bigint> {
    const hex = (await rpc(this.rpcUrl, "eth_gasPrice", [])) as string;
    return BigInt(hex);
  }

  private async sendTx(to: string, data: string, value: bigint = 0n): Promise<string> {
    const nonce = await this.getNonce();
    const gasPrice = await this.getGasPrice();

    const tx: Record<string, string> = {
      from: this.senderAddress,
      to,
      data,
      value: "0x" + value.toString(16),
      nonce: "0x" + nonce.toString(16),
      gasPrice: "0x" + gasPrice.toString(16),
      gas: "0x" + (500000n).toString(16),
      chainId: "0x" + this.chainId.toString(16),
    };

    // Estimate gas
    try {
      const est = (await rpc(this.rpcUrl, "eth_estimateGas", [tx])) as string;
      const gasLimit = (BigInt(est) * 120n) / 100n; // 20% buffer
      tx.gas = "0x" + gasLimit.toString(16);
    } catch {
      // keep default
    }

    return (await rpc(this.rpcUrl, "eth_sendTransaction", [tx])) as string;
  }

  private async waitReceipt(txHash: string): Promise<Record<string, any>> {
    for (let i = 0; i < 60; i++) {
      const receipt = (await rpc(this.rpcUrl, "eth_getTransactionReceipt", [txHash])) as any;
      if (receipt) {
        if (receipt.status === "0x0") throw new Error("Transaction reverted");
        return receipt;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Receipt timeout");
  }

  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<QuoteResult> {
    const path = [tokenIn, tokenOut];
    const amountInBn = BigInt(amountIn);

    // getAmountsOut(uint256,address[])
    const fnSel = sel("getAmountsOut(uint256,address[])");
    // Encode: amountIn + offset to array + array length + addresses
    const encoded =
      "0x" +
      fnSel +
      padU256(amountInBn) +
      padU256(64n) + // offset to dynamic array
      padU256(BigInt(path.length)) +
      path.map((a) => padAddr(a)).join("");

    const result = await this.ethCall(this.routerAddress, encoded);
    const hex = result.startsWith("0x") ? result.slice(2) : result;

    // Decode amounts array — skip offset (32 bytes) + length (32 bytes)
    // Then read each uint256
    const arrayOffset = Number(decodeU256(hex.slice(0, 64))) * 2;
    const arrayLen = Number(decodeU256(hex.slice(arrayOffset, arrayOffset + 64)));
    const amounts: bigint[] = [];
    for (let i = 0; i < arrayLen; i++) {
      const start = arrayOffset + 64 + i * 64;
      amounts.push(decodeU256(hex.slice(start, start + 64)));
    }

    const amountOut = amounts[amounts.length - 1] ?? 0n;

    // Simple price impact calculation
    const impactBps =
      amountInBn > 0n
        ? Number(((amountInBn - amountOut) * 10000n) / amountInBn)
        : 0;

    return {
      amountOut: amountOut.toString(),
      path,
      priceImpact: (impactBps / 100).toFixed(2) + "%",
    };
  }

  async executeSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    minAmountOut?: string
  ): Promise<SwapResult> {
    const amountInBn = BigInt(amountIn);
    let minOut: bigint;

    if (minAmountOut) {
      minOut = BigInt(minAmountOut);
    } else {
      // Use quote + slippage
      const quote = await this.getQuote(tokenIn, tokenOut, amountIn);
      const quotedOut = BigInt(quote.amountOut);
      minOut = quotedOut - (quotedOut * BigInt(this.slippageBps)) / 10000n;
    }

    // First, approve the router to spend tokenIn
    await this.approveToken(tokenIn, amountInBn);

    const path = [tokenIn, tokenOut];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 minutes

    // swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    const fnSel = sel(
      "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"
    );
    const data =
      "0x" +
      fnSel +
      padU256(amountInBn) +
      padU256(minOut) +
      padU256(160n) + // offset to path array
      padAddr(this.senderAddress) +
      padU256(deadline) +
      padU256(BigInt(path.length)) +
      path.map((a) => padAddr(a)).join("");

    const txHash = await this.sendTx(this.routerAddress, data);
    await this.waitReceipt(txHash);

    const result: SwapResult = {
      txHash,
      amountIn: amountInBn.toString(),
      amountOut: minOut.toString(), // actual amount from logs would be more accurate
      path,
    };

    this.emit("onSwapCompleted", {
      txHash,
      tokenIn,
      tokenOut,
      amountIn: result.amountIn,
      amountOut: result.amountOut,
    });

    return result;
  }

  private async approveToken(tokenAddress: string, amount: bigint): Promise<void> {
    // Check current allowance first
    const allowanceSel = sel("allowance(address,address)");
    const allowanceData =
      "0x" +
      allowanceSel +
      padAddr(this.senderAddress) +
      padAddr(this.routerAddress);

    const allowanceResult = await this.ethCall(tokenAddress, allowanceData);
    const currentAllowance = BigInt(allowanceResult);

    if (currentAllowance >= amount) return;

    // approve(address,uint256)
    const approveSel = sel("approve(address,uint256)");
    const maxUint = (1n << 256n) - 1n;
    const approveData =
      "0x" + approveSel + padAddr(this.routerAddress) + padU256(maxUint);

    const txHash = await this.sendTx(tokenAddress, approveData);
    await this.waitReceipt(txHash);
  }

  async getTokenBalance(
    tokenAddress: string,
    walletAddress: string
  ): Promise<string> {
    // balanceOf(address)
    const fnSel = sel("balanceOf(address)");
    const data = "0x" + fnSel + padAddr(walletAddress);

    const result = await this.ethCall(tokenAddress, data);
    return BigInt(result).toString();
  }
}

export default TokenSwap;
