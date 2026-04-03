# wallet-connect — Integration Guide

## Overview

Client-side Ethereum wallet connection using EIP-1193 (MetaMask and compatible wallets). Connect wallets, get balances, send transactions, and sign messages.

**TypeScript only** — this component runs in the browser and relies on `window.ethereum`.

## Installation

```bash
radzor add wallet-connect
```

## Configuration

| Input     | Type   | Required | Description                                |
| --------- | ------ | -------- | ------------------------------------------ |
| `chainId` | number | no       | Target chain ID (default: 1 = Ethereum)    |
| `rpcUrl`  | string | no       | JSON-RPC endpoint URL                      |

## Quick Start

```typescript
import { WalletConnect } from "./components/wallet-connect/src";

const wallet = new WalletConnect({ chainId: 1 });

const state = await wallet.connect();
console.log("Connected:", state.address);

const balance = await wallet.getBalance();
console.log("Balance (wei):", balance);
```

## Actions

### connect

Request wallet connection. Prompts user to approve. Returns `WalletState` with `address`, `chainId`, `connected`.

### disconnect

Disconnect the wallet (resets local state).

### getBalance

Get ETH balance in wei for the connected address (or a specified address).

### sendTransaction

Send an ETH transaction. Parameters: `to`, `value` (hex wei), optional `data` and `gasLimit`.

### signMessage

Sign a message with `personal_sign`. Returns hex signature.

## Events

- `onConnected` — wallet connected with `WalletState`
- `onDisconnected` — wallet disconnected
- `onChainChanged` — user switched chain
- `onError` — error with `{ code, message }`

## Requirements

- Browser environment with MetaMask or EIP-1193 compatible wallet
- No external dependencies
