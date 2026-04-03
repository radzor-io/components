# smart-contract — Integration Guide

## Overview

Interact with EVM smart contracts via JSON-RPC. Read contract state, encode function calls, and decode return values. Works with any EVM chain (Ethereum, Polygon, Arbitrum, etc.).

## Installation

```bash
radzor add smart-contract
```

## Configuration

| Input             | Type   | Required | Description                          |
| ----------------- | ------ | -------- | ------------------------------------ |
| `rpcUrl`          | string | yes      | JSON-RPC endpoint (Infura, Alchemy)  |
| `contractAddress` | string | yes      | Deployed contract address            |
| `abi`             | array  | yes      | Contract ABI (JSON array)            |

## Quick Start

### TypeScript

```typescript
import { SmartContract } from "./components/smart-contract/src";

const contract = new SmartContract({
  rpcUrl: "https://mainnet.infura.io/v3/YOUR_KEY",
  contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  abi: [
    { name: "balanceOf", type: "function", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  ],
});

const balance = await contract.call("balanceOf", ["0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"]);
```

### Python

```python
from components.smart_contract.src import SmartContract, SmartContractConfig

contract = SmartContract(SmartContractConfig(
    rpc_url="https://mainnet.infura.io/v3/YOUR_KEY",
    contract_address="0xdAC17F958D2ee523a2206206994597C13D831ec7",
    abi=[{"name": "balanceOf", "type": "function", "inputs": [{"name": "owner", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view"}],
))

balance = contract.call("balanceOf", ["0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18"])
```

## Actions

### call

Read-only call to a contract function. Returns decoded result.

### encodeFunctionData / encode_function_data

Encode a function call into hex calldata (useful for building transactions).

### decodeFunctionResult / decode_function_result

Decode hex return data into typed values.

## Supported types

`address`, `uint256`/`uint*`, `int256`/`int*`, `bool`, `bytes32`, `string` (basic encoding).

## Requirements

- JSON-RPC endpoint URL
- Contract ABI
- No external dependencies — uses stdlib only
