# How to integrate @radzor/smart-contract

## Overview
Interact with EVM smart contracts via JSON-RPC. Read state, call functions, and send transactions.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { SmartContract } from "@radzor/smart-contract";

const smartContract = new SmartContract({
  rpcUrl: "your-rpcUrl",
  contractAddress: "your-contractAddress",
  abi: "your-abi",
});
```

3. **Use the component:**
```typescript
const result = await smartContract.call("example-method", /* args */);
smartContract.encodeFunctionData("example-method", /* args */);
smartContract.decodeFunctionResult("example-method", "example-data");
```

### Python

```python
from smart_contract import SmartContract, SmartContractConfig
import os

smartContract = SmartContract(SmartContractConfig(
    rpc_url="your-rpc_url",
    contract_address="your-contract_address",
    abi="your-abi",
))
```

## Events

- **onCallResult** — Fired on successful contract read call. Payload: `method: string`, `result: string`
- **onError** — Fired on JSON-RPC or ABI error. Payload: `code: string`, `message: string`, `method: string`
