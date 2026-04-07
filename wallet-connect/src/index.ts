// @radzor/wallet-connect — Ethereum wallet connection (MetaMask / EIP-1193)

// ---- types ----

export interface WalletConnectConfig {
  chainId?: number;
  rpcUrl?: string;
}

export interface WalletState {
  address: string;
  chainId: number;
  connected: boolean;
}

export interface TransactionRequest {
  to: string;
  value: string; // value in wei (hex)
  data?: string;
  gasLimit?: string;
}

export interface TransactionResult {
  hash: string;
}

export type EventMap = {
  onConnected: WalletState;
  onDisconnected: void;
  onChainChanged: { chainId: number };
  onError: { code: string; message: string };
};

// EIP-1193 provider interface
export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare const window: { ethereum?: EIP1193Provider };

// ---- implementation ----

export class WalletConnect {
  private chainId: number;
  private rpcUrl?: string;
  private state: WalletState = { address: "", chainId: 0, connected: false };
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: WalletConnectConfig = {}) {
    this.chainId = config.chainId ?? 1;
    this.rpcUrl = config.rpcUrl;
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

  private getProvider(): EIP1193Provider {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("No Ethereum provider found. Install MetaMask or a compatible wallet.");
    }
    return window.ethereum;
  }

  async connect(): Promise<WalletState> {
    try {
      const provider = this.getProvider();

      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];

      if (!accounts.length) {
        throw new Error("No accounts returned");
      }

      const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
      const currentChainId = parseInt(chainIdHex, 16);

      // Switch chain if needed
      if (currentChainId !== this.chainId) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${this.chainId.toString(16)}` }],
          });
        } catch {
          // Chain not added — emit error but continue
        }
      }

      this.state = { address: accounts[0], chainId: this.chainId, connected: true };

      // Listen for changes
      provider.on("accountsChanged", (accs: unknown) => {
        const addresses = accs as string[];
        if (addresses.length === 0) {
          this.state.connected = false;
          this.emit("onDisconnected", undefined as any);
        } else {
          this.state.address = addresses[0];
          this.emit("onConnected", { ...this.state });
        }
      });

      provider.on("chainChanged", (id: unknown) => {
        const newChainId = parseInt(id as string, 16);
        this.state.chainId = newChainId;
        this.emit("onChainChanged", { chainId: newChainId });
      });

      this.emit("onConnected", { ...this.state });
      return { ...this.state };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CONNECT_ERROR", message });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.state = { address: "", chainId: 0, connected: false };
    this.emit("onDisconnected", undefined as any);
  }

  async getBalance(address?: string): Promise<string> {
    const provider = this.getProvider();
    const addr = address || this.state.address;
    if (!addr) throw new Error("No address provided");

    const balanceHex = (await provider.request({
      method: "eth_getBalance",
      params: [addr, "latest"],
    })) as string;

    return BigInt(balanceHex).toString();
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResult> {
    try {
      const provider = this.getProvider();
      if (!this.state.connected) throw new Error("Wallet not connected");

      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: this.state.address, ...tx }],
      })) as string;

      return { hash };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "TX_ERROR", message });
      throw err;
    }
  }

  async signMessage(message: string): Promise<string> {
    try {
      const provider = this.getProvider();
      if (!this.state.connected) throw new Error("Wallet not connected");

      const signature = (await provider.request({
        method: "personal_sign",
        params: [message, this.state.address],
      })) as string;

      return signature;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "SIGN_ERROR", message: msg });
      throw err;
    }
  }

  getState(): WalletState {
    return { ...this.state };
  }
}
