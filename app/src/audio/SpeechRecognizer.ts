/**
 * Real-time Speech Recognition Engine for Web Clients
 * Converts microphone audio into live draft and final captions using the browser's
 * Web Speech API (webkitSpeechRecognition), and records raw audio via MediaRecorder.
 */

import { CaptionMessage } from "@roundtable/protocol";
import { getMonotonicTimeMs } from "../utils/clock";

export interface SpeechRecognizerOptions {
  speakerId: number | null;
  speakerName: string;
  speakerColor: string;
  onCaption: (caption: CaptionMessage) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

export class BrowserSpeechRecognizer {
  private recognition: any = null;
  private mediaRecorder: any = null;
  private recordedChunks: Blob[] = [];
  private isListening = false;
  private currentLineId: string | null = null;
  private currentRev = 1;
  private speechStartTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: SpeechRecognizerOptions) {}

  public updateSpeaker(id: number | null, name: string, color: string) {
    this.options.speakerId = id;
    this.options.speakerName = name;
    this.options.speakerColor = color;
  }

  public isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  public start(): boolean {
    if (typeof window === "undefined" || this.isListening) return false;

    const SpeechRecClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecClass) {
      console.warn("[SpeechRecognizer] Web Speech API not supported in this browser.");
      return false;
    }

    try {
      const recognition = new SpeechRecClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        this.isListening = true;
      };

      recognition.onspeechstart = () => {
        this.options.onSpeakingChange?.(true);
      };

      recognition.onspeechend = () => {
        this.options.onSpeakingChange?.(false);
      };

      recognition.onresult = (event: any) => {
        const now = getMonotonicTimeMs();
        this.options.onSpeakingChange?.(true);

        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
        }
        this.silenceTimer = setTimeout(() => {
          this.options.onSpeakingChange?.(false);
        }, 1200);

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript?.trim();
          if (!transcript) continue;

          if (!this.currentLineId) {
            this.currentLineId = `line-mic-${Math.floor(now)}-${Math.floor(Math.random() * 1000)}`;
            this.currentRev = 1;
            this.speechStartTime = now;
          }

          if (result.isFinal) {
            // Emits final caption
            const finalCaption: CaptionMessage = {
              type: "caption",
              line_id: this.currentLineId,
              rev: this.currentRev++,
              speaker_id: this.options.speakerId,
              text: transcript,
              state: "final",
              t_start: this.speechStartTime,
              t_end: now,
            };

            this.options.onCaption(finalCaption);
            // Reset for next sentence
            this.currentLineId = null;
            this.currentRev = 1;
          } else {
            // Emits streaming draft caption
            const draftCaption: CaptionMessage = {
              type: "caption",
              line_id: this.currentLineId,
              rev: this.currentRev++,
              speaker_id: this.options.speakerId,
              text: transcript,
              state: "draft",
              t_start: this.speechStartTime,
              t_end: now,
            };

            this.options.onCaption(draftCaption);
          }
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          console.warn("[SpeechRecognizer] recognition error:", e.error);
        }
      };

      recognition.onend = () => {
        if (this.isListening) {
          try {
            recognition.start();
          } catch {
            // will restart on next frame
          }
        }
      };

      recognition.start();
      this.recognition = recognition;
      this.isListening = true;

      // Also record microphone audio via MediaRecorder if supported
      if (
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function"
      ) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            try {
              const recorder = new (window as any).MediaRecorder(stream);
              this.recordedChunks = [];
              recorder.ondataavailable = (e: any) => {
                if (e.data && e.data.size > 0) {
                  this.recordedChunks.push(e.data);
                }
              };
              recorder.start(1000);
              this.mediaRecorder = recorder;
            } catch (err) {
              console.debug("MediaRecorder not available:", err);
            }
          })
          .catch(() => {});
      }

      return true;
    } catch (err) {
      console.warn("[SpeechRecognizer] Failed to start speech recognition:", err);
      return false;
    }
  }

  public getRecordedAudioUrl(): string | null {
    if (this.recordedChunks.length === 0 || typeof window === "undefined") {
      return null;
    }
    const blob = new Blob(this.recordedChunks, { type: "audio/webm" });
    return URL.createObjectURL(blob);
  }

  public stop(): void {
    this.isListening = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }
    this.options.onSpeakingChange?.(false);
  }
}
