# wallet-connect — Examples

## Connect wallet

```typescript
import { WalletConnect } from "./components/wallet-connect/src";

const wallet = new WalletConnect({ chainId: 1 });

wallet.on("onConnected", (state) => {
  console.log("Connected:", state.address, "on chain", state.chainId);
});

wallet.on("onError", (err) => {
  console.error("Wallet error:", err.message);
});

const state = await wallet.connect();
```

## Get ETH balance

```typescript
const balanceWei = await wallet.getBalance();
const balanceEth = Number(BigInt(balanceWei)) / 1e18;
console.log(`Balance: ${balanceEth} ETH`);
```

## Send ETH

```typescript
const tx = await wallet.sendTransaction({
  to: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  value: "0x" + (0.01 * 1e18).toString(16), // 0.01 ETH
});

console.log("Transaction hash:", tx.hash);
```

## Sign a message

```typescript
const signature = await wallet.signMessage("Hello from Radzor!");
console.log("Signature:", signature);
```

## Switch to Polygon

```typescript
const wallet = new WalletConnect({ chainId: 137 }); // Polygon
await wallet.connect();
// Will prompt user to switch to Polygon if not already on it
```

## Listen for chain changes

```typescript
wallet.on("onChainChanged", ({ chainId }) => {
  console.log("Switched to chain:", chainId);
});

wallet.on("onDisconnected", () => {
  console.log("Wallet disconnected");
});
```

## Check connection state

```typescript
const state = wallet.getState();
if (state.connected) {
  console.log(`Connected as ${state.address}`);
} else {
  console.log("Not connected");
}
```
