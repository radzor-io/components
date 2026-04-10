# How to integrate @radzor/nft-mint

## Overview
Mint NFTs on EVM-compatible chains (Ethereum, Polygon, Arbitrum, etc.) using raw JSON-RPC calls. Supports single minting, batch minting, token URI retrieval, and approval management. No external Web3 library required.

## Integration Steps

### TypeScript

1. **No external dependencies required.** Uses native `fetch()` and Node.js `crypto`.

2. **Create an instance:**
```typescript
import { NftMint } from "@radzor/nft-mint";

const minter = new NftMint({
  rpcUrl: process.env.ETH_RPC_URL!,
  contractAddress: "0xYourERC721Contract...",
  privateKey: process.env.ETH_PRIVATE_KEY!,
  chainId: 1, // optional, default: 1 (mainnet)
});
```

3. **Mint an NFT:**
```typescript
const result = await minter.mint("0xRecipient...", "https://metadata.example.com/1.json");
console.log(`Minted token ${result.tokenId}, tx: ${result.txHash}`);
```

4. **Listen for events:**
```typescript
minter.on("onMinted", (e) => console.log(`Token ${e.tokenId} minted to ${e.to}`));
minter.on("onTransferComplete", (e) => console.log(`Transfer confirmed: ${e.txHash}`));
```

### Python

```python
from nft_mint import NftMint, NftMintConfig
import os

minter = NftMint(NftMintConfig(
    rpc_url=os.environ["ETH_RPC_URL"],
    contract_address="0xYourERC721Contract...",
    private_key=os.environ["ETH_PRIVATE_KEY"],
    chain_id=1,
))

result = minter.mint("0xRecipient...", "https://metadata.example.com/1.json")
print(f"Minted token {result.token_id}")
```

## Environment Variables Required

| Variable | Description |
|---|---|
| `ETH_RPC_URL` | JSON-RPC endpoint (Infura, Alchemy, local node) |
| `ETH_PRIVATE_KEY` | Private key for signing transactions |

## Constraints

- Private key must have sufficient ETH/native token for gas fees.
- The target contract must implement `safeMint(address)` or `safeMint(address,string)` for single mints, and `batchMint(address,uint256)` for batch mints.
- `chainId` must match the network your RPC URL points to.
- Read-only operations (`getTokenURI`) do not require a private key.
- Transaction confirmation polling waits up to 120 seconds.

## Composability

This component can feed minted token data (txHash, tokenId) into other components. Connections will be configured in a future pass.
