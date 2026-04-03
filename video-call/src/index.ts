// @radzor/video-call — WebRTC peer-to-peer video calling

// ---- types ----

export interface VideoCallConfig {
  iceServers?: RTCIceServer[];
  signalingUrl?: string;
}

export interface CallState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connected: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
}

type EventMap = {
  onLocalStream: MediaStream;
  onRemoteStream: MediaStream;
  onCallEnded: void;
  onIceCandidate: RTCIceCandidate;
  onSignalingMessage: { type: string; payload: unknown };
  onError: { code: string; message: string };
};

// ---- implementation ----

export class VideoCall {
  private iceServers: RTCIceServer[];
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private audioEnabled = true;
  private videoEnabled = true;
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: VideoCallConfig = {}) {
    this.iceServers = config.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }];
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  async startCall(): Promise<RTCSessionDescriptionInit> {
    try {
      await this.initMedia();
      this.createPeerConnection();

      const offer = await this.pc!.createOffer();
      await this.pc!.setLocalDescription(offer);

      return offer;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "START_ERROR", message });
      throw err;
    }
  }

  async answerCall(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    try {
      await this.initMedia();
      this.createPeerConnection();

      await this.pc!.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.pc!.createAnswer();
      await this.pc!.setLocalDescription(answer);

      return answer;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "ANSWER_ERROR", message });
      throw err;
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc?.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc?.addIceCandidate(new RTCIceCandidate(candidate));
  }

  endCall(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.localStream = null;
    this.remoteStream = null;
    this.pc = null;
    this.emit("onCallEnded", undefined as any);
  }

  toggleAudio(): boolean {
    this.audioEnabled = !this.audioEnabled;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = this.audioEnabled));
    return this.audioEnabled;
  }

  toggleVideo(): boolean {
    this.videoEnabled = !this.videoEnabled;
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = this.videoEnabled));
    return this.videoEnabled;
  }

  getState(): CallState {
    return {
      localStream: this.localStream,
      remoteStream: this.remoteStream,
      connected: this.pc?.connectionState === "connected",
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
    };
  }

  private async initMedia(): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    this.emit("onLocalStream", this.localStream);
  }

  private createPeerConnection(): void {
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    this.localStream?.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!);
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit("onIceCandidate", event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.emit("onRemoteStream", this.remoteStream);
      }
      this.remoteStream.addTrack(event.track);
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === "disconnected" || this.pc?.connectionState === "failed") {
        this.endCall();
      }
    };
  }
}
