# How to integrate @radzor/video-call

## Overview
WebRTC-based peer-to-peer video calling. Manage local/remote streams, signaling, and call lifecycle.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { VideoCall } from "@radzor/video-call";

const videoCall = new VideoCall({

});
```

3. **Use the component:**
```typescript
const result = await videoCall.startCall(/* constraints */);
const result = await videoCall.answerCall(/* offer */);
videoCall.endCall();
```

## Events

- **onLocalStream** — Fired when local media stream is ready. Payload: `trackCount: number`
- **onRemoteStream** — Fired when remote stream arrives from the peer. Payload: `trackCount: number`
- **onCallEnded** — Fired when the call ends. Payload: `durationMs: number`
- **onError** — Fired on ICE, media, or signaling error. Payload: `code: string`, `message: string`

## Constraints

Browser-only — uses WebRTC and getUserMedia APIs not available in Node.js. Requires HTTPS in production. For peer discovery and signaling, a WebSocket server is needed.
