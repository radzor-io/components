# @radzor/token-swap — Usage Examples

## Get a swap quote

```typescript
import { TokenSwap } from "@radzor/token-swap";

const swapper = new TokenSwap({
  rpcUrl: "https://mainnet.infura.io/v3/YOUR_KEY",
  routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  privateKey: process.env.ETH_PRIVATE_KEY!,
  chainId: 1,
});

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const quote = await swapper.getQuote(USDC, WETH, "1000000000"); // 1000 USDC
console.log(`Expected: ${quote.amountOut} WETH (wei)`);
console.log(`Price impact: ${quote.priceImpact}`);
console.log(`Path: ${quote.path.join(" → ")}`);
```

## Execute a swap with automatic slippage

```typescript
const result = await swapper.executeSwap(USDC, WETH, "1000000000");
console.log(`Swap executed — tx: ${result.txHash}`);
console.log(`Spent: ${result.amountIn}, Received: ${result.amountOut}`);
```

## Execute a swap with explicit minimum output

```typescript
const quote = await swapper.getQuote(USDC, WETH, "5000000000"); // 5000 USDC
const minOut = (BigInt(quote.amountOut) * 99n / 100n).toString(); // 1% slippage

const result = await swapper.executeSwap(USDC, WETH, "5000000000", minOut);
console.log(`Swap tx: ${result.txHash}`);
```

## Check token balance before swapping

```typescript
const balance = await swapper.getTokenBalance(
  USDC,
  "0xYourWallet..."
);
console.log(`USDC balance: ${balance} (smallest unit)`);

const humanReadable = Number(balance) / 1e6; // USDC has 6 decimals
console.log(`USDC balance: ${humanReadable}`);

if (BigInt(balance) >= BigInt("1000000000")) {
  await swapper.executeSwap(USDC, WETH, "1000000000");
}
```

## Track swap completions

```typescript
swapper.on("onSwapCompleted", (event) => {
  console.log(`Swapped ${event.amountIn} ${event.tokenIn}`);
  console.log(`     → ${event.amountOut} ${event.tokenOut}`);
  console.log(`  tx: ${event.txHash}`);
});
```

## Swap on Polygon with SushiSwap

```typescript
const polySwapper = new TokenSwap({
  rpcUrl: "https://polygon-rpc.com",
  routerAddress: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", // SushiSwap
  privateKey: process.env.ETH_PRIVATE_KEY!,
  chainId: 137,
  slippageBps: 100, // 1% slippage
});

const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

const result = await polySwapper.executeSwap(WMATIC, USDT, "1000000000000000000"); // 1 MATIC
console.log(`Got ${result.amountOut} USDT`);
```

---

## Python Examples

### Get a quote

```python
from token_swap import TokenSwap, TokenSwapConfig
import os

swapper = TokenSwap(TokenSwapConfig(
    rpc_url="https://mainnet.infura.io/v3/YOUR_KEY",
    router_address="0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    private_key=os.environ["ETH_PRIVATE_KEY"],
    chain_id=1,
))

USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

quote = swapper.get_quote(USDC, WETH, "1000000000")
print(f"Expected output: {quote.amount_out}, impact: {quote.price_impact}")
```

### Execute a swap

```python
result = swapper.execute_swap(USDC, WETH, "1000000000")
print(f"Swap tx: {result.tx_hash}")
```

### Check balance

```python
balance = swapper.get_token_balance(USDC, "0xYourWallet...")
print(f"USDC balance: {int(balance) / 1e6}")
```

### Event handling

```python
swapper.on("onSwapCompleted", lambda e: print(
    f"Swapped {e['amount_in']} → {e['amount_out']}"
))
```
