# How to integrate @radzor/token-swap

## Overview
Swap ERC-20 tokens on EVM chains via Uniswap V2-style DEX routers. Get quotes, execute swaps with slippage protection, and query token balances — all via raw JSON-RPC with no SDK dependency.

## Integration Steps

### TypeScript

1. **No external dependencies required.** Uses native `fetch()` and Node.js `crypto`.

2. **Create an instance:**
```typescript
import { TokenSwap } from "@radzor/token-swap";

const swapper = new TokenSwap({
  rpcUrl: process.env.ETH_RPC_URL!,
  routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 Router
  privateKey: process.env.ETH_PRIVATE_KEY!,
  chainId: 1,
  slippageBps: 50, // 0.5%
});
```

3. **Get a quote before swapping:**
```typescript
const quote = await swapper.getQuote(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
  "1000000000" // 1000 USDC (6 decimals)
);
console.log(`Expected output: ${quote.amountOut}, impact: ${quote.priceImpact}`);
```

4. **Execute the swap:**
```typescript
const result = await swapper.executeSwap(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "1000000000"
);
```

5. **Listen for events:**
```typescript
swapper.on("onSwapCompleted", (e) => {
  console.log(`Swapped ${e.amountIn} of ${e.tokenIn} for ${e.amountOut} of ${e.tokenOut}`);
});
```

### Python

```python
from token_swap import TokenSwap, TokenSwapConfig
import os

swapper = TokenSwap(TokenSwapConfig(
    rpc_url=os.environ["ETH_RPC_URL"],
    router_address="0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    private_key=os.environ["ETH_PRIVATE_KEY"],
    chain_id=1,
    slippage_bps=50,
))

quote = swapper.get_quote(usdc_address, weth_address, "1000000000")
result = swapper.execute_swap(usdc_address, weth_address, "1000000000")
```

## Environment Variables Required

| Variable | Description |
|---|---|
| `ETH_RPC_URL` | JSON-RPC endpoint |
| `ETH_PRIVATE_KEY` | Private key with funded wallet |

## Constraints

- Wallet must hold sufficient input tokens AND ETH for gas.
- Token approval is handled automatically (infinite approval on first swap).
- Always call `getQuote` before `executeSwap` to check price impact.
- `slippageBps` is applied automatically when `minAmountOut` is not provided to `executeSwap`.
- Router address must be a Uniswap V2-compatible router (SushiSwap, PancakeSwap, etc.).
- Amounts are in token's smallest unit (wei). Divide by 10^decimals for human-readable values.

## Composability

Swap results can be piped into notification or logging components. Connections will be configured in a future pass.
