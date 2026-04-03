# @radzor/smart-contract — EVM smart contract interaction via JSON-RPC

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Callable
from urllib.request import Request, urlopen


@dataclass
class AbiParam:
    name: str
    type: str


@dataclass
class AbiItem:
    name: str
    type: str  # function | event | constructor
    inputs: list[AbiParam] | None = None
    outputs: list[AbiParam] | None = None
    state_mutability: str | None = None


@dataclass
class SmartContractConfig:
    rpc_url: str
    contract_address: str
    abi: list[dict[str, Any]]


def _pad_left(hex_str: str, byte_len: int = 32) -> str:
    return hex_str.zfill(byte_len * 2)


def _function_selector(name: str, inputs: list[AbiParam]) -> str:
    sig = f"{name}({','.join(i.type for i in inputs)})"
    h = hashlib.sha256(sig.encode()).hexdigest()
    return h[:8]


def _encode_param(param_type: str, value: Any) -> str:
    if param_type == "address":
        return _pad_left(str(value).replace("0x", "").lower())
    if param_type.startswith("uint") or param_type.startswith("int"):
        return _pad_left(hex(int(value))[2:])
    if param_type == "bool":
        return _pad_left("1" if value else "0")
    if param_type == "bytes32":
        return _pad_left(str(value).replace("0x", ""))
    return _pad_left("0")


def _decode_param(param_type: str, hex_str: str) -> Any:
    if param_type == "address":
        return "0x" + hex_str[-40:]
    if param_type.startswith("uint") or param_type.startswith("int"):
        return str(int(hex_str, 16))
    if param_type == "bool":
        return int(hex_str, 16) != 0
    return "0x" + hex_str


class SmartContract:
    def __init__(self, config: SmartContractConfig) -> None:
        self._rpc_url = config.rpc_url
        self._address = config.contract_address
        self._abi = self._parse_abi(config.abi)
        self._listeners: dict[str, list[Callable]] = {}

    def _parse_abi(self, raw: list[dict[str, Any]]) -> list[AbiItem]:
        items = []
        for entry in raw:
            inputs = [AbiParam(name=p.get("name", ""), type=p["type"]) for p in entry.get("inputs", [])]
            outputs = [AbiParam(name=p.get("name", ""), type=p["type"]) for p in entry.get("outputs", [])]
            items.append(AbiItem(
                name=entry.get("name", ""),
                type=entry.get("type", "function"),
                inputs=inputs or None,
                outputs=outputs or None,
                state_mutability=entry.get("stateMutability"),
            ))
        return items

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def encode_function_data(self, method_name: str, params: list[Any] | None = None) -> str:
        fn = next((a for a in self._abi if a.name == method_name and a.type == "function"), None)
        if not fn:
            raise ValueError(f"Function {method_name} not found in ABI")

        inputs = fn.inputs or []
        selector = _function_selector(method_name, inputs)
        encoded_params = "".join(_encode_param(inp.type, (params or [])[i]) for i, inp in enumerate(inputs))
        return "0x" + selector + encoded_params

    def decode_function_result(self, method_name: str, data: str) -> list[Any]:
        fn = next((a for a in self._abi if a.name == method_name and a.type == "function"), None)
        if not fn:
            raise ValueError(f"Function {method_name} not found in ABI")

        hex_data = data[2:] if data.startswith("0x") else data
        outputs = fn.outputs or []
        return [_decode_param(out.type, hex_data[i * 64 : (i + 1) * 64]) for i, out in enumerate(outputs)]

    def call(self, method_name: str, params: list[Any] | None = None) -> Any:
        try:
            data = self.encode_function_data(method_name, params)

            body = json.dumps({
                "jsonrpc": "2.0",
                "method": "eth_call",
                "params": [{"to": self._address, "data": data}, "latest"],
                "id": 1,
            }).encode()

            req = Request(self._rpc_url, data=body, headers={"Content-Type": "application/json"})

            with urlopen(req) as resp:
                result = json.loads(resp.read().decode())

            if "error" in result:
                raise Exception(result["error"].get("message", "RPC error"))

            decoded = self.decode_function_result(method_name, result["result"])
            ret = decoded[0] if len(decoded) == 1 else decoded
            self._emit("onCallResult", {"method": method_name, "result": ret})
            return ret
        except Exception as e:
            self._emit("onError", {"code": "CALL_ERROR", "message": str(e)})
            raise
