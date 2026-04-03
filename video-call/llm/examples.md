# video-call — Examples

## Start a call (caller)

```typescript
import { VideoCall } from "./components/video-call/src";

const call = new VideoCall();

call.on("onLocalStream", (stream) => {
  const video = document.getElementById("localVideo") as HTMLVideoElement;
  video.srcObject = stream;
  video.play();
});

call.on("onRemoteStream", (stream) => {
  const video = document.getElementById("remoteVideo") as HTMLVideoElement;
  video.srcObject = stream;
  video.play();
});

call.on("onIceCandidate", (candidate) => {
  // Send to remote peer via your signaling channel
  signalingChannel.send({ type: "ice-candidate", candidate });
});

const offer = await call.startCall();
signalingChannel.send({ type: "offer", offer });
```

## Answer a call (callee)

```typescript
const call = new VideoCall();

// ... setup onLocalStream, onRemoteStream, onIceCandidate handlers ...

signalingChannel.on("message", async (msg) => {
  if (msg.type === "offer") {
    const answer = await call.answerCall(msg.offer);
    signalingChannel.send({ type: "answer", answer });
  }
  if (msg.type === "answer") {
    await call.handleAnswer(msg.answer);
  }
  if (msg.type === "ice-candidate") {
    await call.addIceCandidate(msg.candidate);
  }
});
```

## Mute/unmute

```typescript
document.getElementById("muteBtn")?.addEventListener("click", () => {
  const audioOn = call.toggleAudio();
  console.log("Audio:", audioOn ? "on" : "muted");
});

document.getElementById("videoBtn")?.addEventListener("click", () => {
  const videoOn = call.toggleVideo();
  console.log("Video:", videoOn ? "on" : "off");
});
```

## End call

```typescript
document.getElementById("endBtn")?.addEventListener("click", () => {
  call.endCall();
  signalingChannel.send({ type: "call-ended" });
});

call.on("onCallEnded", () => {
  console.log("Call ended");
});
```

## Custom TURN server

```typescript
const call = new VideoCall({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:turn.example.com:3478",
      username: "user",
      credential: "pass",
    },
  ],
});
```

## Check call state

```typescript
const state = call.getState();
console.log("Connected:", state.connected);
console.log("Audio:", state.audioEnabled);
console.log("Video:", state.videoEnabled);
```
