# smart-contract — Examples

## Read ERC-20 balance

### TypeScript

```typescript
import { SmartContract } from "./components/smart-contract/src";

const usdt = new SmartContract({
  rpcUrl: "https://mainnet.infura.io/v3/YOUR_KEY",
  contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  abi: [
    { name: "balanceOf", type: "function", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
    { name: "decimals", type: "function", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  ],
});

const balance = await usdt.call("balanceOf", ["0x742d35Cc..."]);
const decimals = await usdt.call("decimals");
console.log(`Balance: ${Number(balance) / 10 ** Number(decimals)} USDT`);
```

### Python

```python
from components.smart_contract.src import SmartContract, SmartContractConfig

usdt = SmartContract(SmartContractConfig(
    rpc_url="https://mainnet.infura.io/v3/YOUR_KEY",
    contract_address="0xdAC17F958D2ee523a2206206994597C13D831ec7",
    abi=[
        {"name": "balanceOf", "type": "function", "inputs": [{"name": "owner", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view"},
        {"name": "decimals", "type": "function", "inputs": [], "outputs": [{"name": "", "type": "uint256"}], "stateMutability": "view"},
    ],
))

balance = usdt.call("balanceOf", ["0x742d35Cc..."])
decimals = usdt.call("decimals")
print(f"Balance: {int(balance) / 10 ** int(decimals)} USDT")
```

## Encode function data for a transaction

### TypeScript

```typescript
const data = usdt.encodeFunctionData("balanceOf", ["0x742d35Cc..."]);
console.log("Calldata:", data);
// Use this data in a transaction via wallet-connect
```

### Python

```python
data = usdt.encode_function_data("balanceOf", ["0x742d35Cc..."])
print("Calldata:", data)
```

## Decode raw return data

### TypeScript

```typescript
const rawHex = "0x00000000000000000000000000000000000000000000000000000000001e8480";
const decoded = usdt.decodeFunctionResult("balanceOf", rawHex);
console.log("Balance:", decoded[0]); // "2000000"
```

### Python

```python
raw_hex = "0x00000000000000000000000000000000000000000000000000000000001e8480"
decoded = usdt.decode_function_result("balanceOf", raw_hex)
print("Balance:", decoded[0])  # "2000000"
```

## Error handling

### TypeScript

```typescript
usdt.on("onError", (err) => console.error(err.code, err.message));
usdt.on("onCallResult", (r) => console.log(r.method, r.result));
```

### Python

```python
usdt.on("onError", lambda err: print(err["code"], err["message"]))
usdt.on("onCallResult", lambda r: print(r["method"], r["result"]))
```
