# @radzor/nft-mint — Usage Examples

## Mint a single NFT with metadata

```typescript
import { NftMint } from "@radzor/nft-mint";

const minter = new NftMint({
  rpcUrl: "https://polygon-rpc.com",
  contractAddress: "0xYourContract...",
  privateKey: process.env.ETH_PRIVATE_KEY!,
  chainId: 137,
});

const result = await minter.mint(
  "0xRecipient...",
  "ipfs://QmXyz.../metadata.json"
);
console.log(`Token #${result.tokenId} minted — tx: ${result.txHash}`);
```

## Batch mint 10 NFTs

```typescript
const batch = await minter.batchMint("0xRecipient...", 10, "ipfs://QmBase.../");
console.log(`Minted ${batch.tokenIds.length} tokens:`, batch.tokenIds);
console.log(`Transaction: ${batch.txHash}`);
```

## Read token metadata URI

```typescript
const uri = await minter.getTokenURI("42");
console.log(`Token 42 metadata: ${uri}`);

// Fetch the metadata
const metadata = await fetch(uri).then((r) => r.json());
console.log(`Name: ${metadata.name}, Image: ${metadata.image}`);
```

## Approve a marketplace to transfer your NFTs

```typescript
const openseaConduit = "0x1E0049783F008A0085193E00003D00cd54003c71";
const { txHash } = await minter.setApproval(openseaConduit, true);
console.log(`Approval granted — tx: ${txHash}`);

// Revoke later
await minter.setApproval(openseaConduit, false);
```

## Track minting events

```typescript
minter.on("onMinted", ({ txHash, tokenId, to }) => {
  console.log(`[MINT] Token ${tokenId} → ${to} (${txHash})`);
});

minter.on("onTransferComplete", ({ from, to, tokenId }) => {
  console.log(`[TRANSFER] ${tokenId}: ${from} → ${to}`);
});

// Mint triggers both events
await minter.mint("0xBuyer...", "ipfs://QmNew.../1.json");
```

## Error handling pattern

```typescript
try {
  await minter.mint("0xInvalidAddress", "ipfs://...");
} catch (err) {
  if (err.message.includes("reverted")) {
    console.error("Contract rejected the mint — check allowlist or supply");
  } else if (err.message.includes("timeout")) {
    console.error("Transaction not confirmed in time — check block explorer");
  } else {
    console.error("Mint failed:", err.message);
  }
}
```

---

## Python Examples

### Mint a single NFT

```python
from nft_mint import NftMint, NftMintConfig
import os

minter = NftMint(NftMintConfig(
    rpc_url="https://polygon-rpc.com",
    contract_address="0xYourContract...",
    private_key=os.environ["ETH_PRIVATE_KEY"],
    chain_id=137,
))

result = minter.mint("0xRecipient...", "ipfs://QmXyz.../metadata.json")
print(f"Token #{result.token_id} minted — tx: {result.tx_hash}")
```

### Batch mint

```python
batch = minter.batch_mint("0xRecipient...", 10, "ipfs://QmBase.../")
print(f"Minted {len(batch.token_ids)} tokens")
```

### Read token URI

```python
uri = minter.get_token_uri("42")
print(f"Metadata URI: {uri}")
```

### Event handling

```python
minter.on("onMinted", lambda e: print(f"Minted #{e['token_id']} to {e['to']}"))
minter.mint("0xBuyer...", "ipfs://QmNew.../1.json")
```
