# video-call — Integration Guide

## Overview

WebRTC-based peer-to-peer video calling. Manage local/remote media streams, ICE candidates, and call lifecycle. Requires a signaling mechanism to exchange offers/answers between peers.

**TypeScript only** — this component runs in the browser and uses WebRTC APIs.

## Installation

```bash
radzor add video-call
```

## Configuration

| Input          | Type   | Required | Description                                     |
| -------------- | ------ | -------- | ----------------------------------------------- |
| `iceServers`   | array  | no       | ICE/STUN/TURN servers (default: Google STUN)    |
| `signalingUrl` | string | no       | WebSocket signaling server URL                  |

## Quick Start

```typescript
import { VideoCall } from "./components/video-call/src";

const call = new VideoCall();

call.on("onLocalStream", (stream) => {
  document.querySelector<HTMLVideoElement>("#local")!.srcObject = stream;
});

call.on("onRemoteStream", (stream) => {
  document.querySelector<HTMLVideoElement>("#remote")!.srcObject = stream;
});

// Caller
const offer = await call.startCall();
// Send offer to remote peer via signaling

// Callee
const answer = await call.answerCall(receivedOffer);
// Send answer back via signaling
```

## Actions

### startCall — Create offer and start local media
### answerCall — Accept offer and create answer
### handleAnswer — Set remote answer (caller side)
### addIceCandidate — Add ICE candidate from remote peer
### endCall — Stop all tracks and close connection
### toggleAudio — Mute/unmute microphone
### toggleVideo — Enable/disable camera

## Events

- `onLocalStream` — local media stream ready
- `onRemoteStream` — remote stream received
- `onIceCandidate` — ICE candidate to send to remote peer
- `onCallEnded` — call ended
- `onError` — error occurred

## Requirements

- Browser with WebRTC support
- Signaling server for exchanging offers/answers/candidates
- No external dependencies
