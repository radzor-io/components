# How to integrate @radzor/wallet-connect

## Overview
Connect to Ethereum wallets (MetaMask, WalletConnect) for Web3 dApps. Client-side only.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { WalletConnect } from "@radzor/wallet-connect";

const walletConnect = new WalletConnect({

});
```

3. **Use the component:**
```typescript
const result = await walletConnect.connect();
const result = await walletConnect.disconnect();
const result = await walletConnect.getBalance("example-address");
```

## Events

- **onConnected** — Fired when a wallet is connected. Payload: `address: string`, `chainId: number`
- **onDisconnected** — Fired when the wallet disconnects. Payload: `address: string`
- **onChainChanged** — Fired when the user switches chains. Payload: `chainId: number`
- **onError** — Fired on connection or transaction error. Payload: `code: string`, `message: string`

## Constraints

Browser-only — requires window.ethereum injected by MetaMask or similar. Not available in Node.js or SSR. Always handle the case where no wallet is installed.
