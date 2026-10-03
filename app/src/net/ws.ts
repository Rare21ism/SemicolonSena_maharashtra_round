/**
 * WebSocket client for Roundtable with reconnect, token resumption, NTP clock offset sync,
 * and binary audio frame streaming.
 */

import {
  CaptionMessage,
  ClientMessage,
  DeviceInfo,
  JoinedMessage,
  PongMessage,
  RosterMessage,
  ServerMessage,
  packAudioFrame,
} from "@roundtable/protocol";
import { Platform as RNPlatform } from "react-native";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface RoundtableClientOptions {
  serverUrl: string; // http:// or ws://
  sessionId: string; // 6-letter code or session_id
  name: string;
  onCaption?: (caption: CaptionMessage) => void;
  onRoster?: (devices: DeviceInfo[]) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onJoined?: (msg: JoinedMessage) => void;
  onClockSync?: (offsetMs: number, rttMs: number) => void;
}

export class RoundtableClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "disconnected";
  private token: string | null = null;
  private deviceIdx: number | null = null;
  private seq = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private reconnectAttempts = 0;

  // Clock synchronization (NTP style)
  public clockOffsetMs = 0.0;
  public rttMs = 0.0;

  constructor(private options: RoundtableClientOptions) {}

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getDeviceIdx(): number | null {
    return this.deviceIdx;
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.options.onStatusChange?.(status);
  }

  private getPlatform(): "web" | "android" | "ios" {
    if (RNPlatform.OS === "ios") return "ios";
    if (RNPlatform.OS === "android") return "android";
    return "web";
  }

  private getWebSocketUrl(): string {
    let url = this.options.serverUrl.trim();
    if (url.startsWith("http://")) {
      url = "ws://" + url.substring(7);
    } else if (url.startsWith("https://")) {
      url = "wss://" + url.substring(8);
    } else if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      url = "ws://" + url;
    }
    url = url.replace(/\/+$/, "");
    return `${url}/ws/${this.options.sessionId}`;
  }

  public connect(): void {
    this.shouldReconnect = true;
    this.setStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    const wsUrl = this.getWebSocketUrl();
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus("connected");

        // Send Join message
        const joinMsg: ClientMessage = {
          type: "join",
          name: this.options.name,
          platform: this.getPlatform(),
          token: this.token || undefined,
        };
        this.ws?.send(JSON.stringify(joinMsg));

        // Start NTP-style ping loop
        this.startPingLoop();
      };

      this.ws.onmessage = (event: WebSocketMessageEvent) => {
        if (typeof event.data === "string") {
          try {
            const data = JSON.parse(event.data) as ServerMessage;
            this.handleServerMessage(data);
          } catch (e) {
            console.warn("[RoundtableClient] Failed to parse message JSON:", e);
          }
        }
      };

      this.ws.onerror = (e) => {
        console.warn("[RoundtableClient] WebSocket error:", e);
      };

      this.ws.onclose = () => {
        this.stopPingLoop();
        if (this.shouldReconnect) {
          this.setStatus("reconnecting");
          this.scheduleReconnect();
        } else {
          this.setStatus("disconnected");
        }
      };
    } catch (err) {
      console.error("[RoundtableClient] Failed to instantiate WebSocket:", err);
      this.scheduleReconnect();
    }
  }

  private handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "joined":
        this.deviceIdx = msg.device_idx;
        this.token = msg.token;
        this.options.onJoined?.(msg);
        break;

      case "pong": {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const rtt = now - msg.t0;
        // Estimated clock offset: server_time - client_time_at_midpoint
        const offset = msg.server_ts_ms - (msg.t0 + rtt / 2.0);
        this.rttMs = rtt;
        this.clockOffsetMs = offset;
        this.options.onClockSync?.(offset, rtt);
        break;
      }

      case "roster":
        this.options.onRoster?.(msg.devices);
        break;

      case "caption":
        this.options.onCaption?.(msg);
        break;
    }
  }

  private startPingLoop() {
    this.stopPingLoop();
    // Send ping every 2 seconds
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const pingMsg: ClientMessage = { type: "ping", t0 };
        this.ws.send(JSON.stringify(pingMsg));
      }
    }, 2000);
  }

  private stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 8000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Packs and sends a binary audio frame over the open WebSocket.
   */
  public sendAudioFrame(pcm: Int16Array, captureTsMs: number): void {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      this.deviceIdx === null
    ) {
      return;
    }

    const frameBytes = packAudioFrame({
      device_idx: this.deviceIdx,
      seq: this.seq++,
      capture_ts_ms: captureTsMs,
      pcm,
    });

    this.ws.send(frameBytes.buffer);
  }

  /**
   * Broadcasts a real-time speech caption to all participants in the session.
   */
  public sendCaption(caption: CaptionMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(caption));
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.stopPingLoop();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }
}
