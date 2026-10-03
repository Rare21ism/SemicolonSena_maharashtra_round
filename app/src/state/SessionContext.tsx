import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CaptionMessage, DeviceInfo } from "@roundtable/protocol";
import { ExtendedCaptionMessage } from "../components/CaptionLine";
import { ConnectionStatus, RoundtableClient } from "../net/ws";
import { BrowserSpeechRecognizer, createAudioSource } from "../audio";
import { getSpeakerColor } from "../theme";
import {
  DEMO_SCRIPT_STEPS,
  INITIAL_DEMO_ROSTER,
} from "./demoSimulation";

interface SessionContextType {
  sessionCode: string;
  setSessionCode: (code: string) => void;
  sessionName: string;
  setSessionName: (name: string) => void;
  isHost: boolean;
  setIsHost: (host: boolean) => void;
  name: string;
  setName: (name: string) => void;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  myDeviceIdx: number | null;
  status: ConnectionStatus;
  rttMs: number;
  offsetMs: number;
  roster: DeviceInfo[];
  captions: ExtendedCaptionMessage[];
  activeSpeakerId: number | null;
  overlappingCount: number;
  isBackfilling: boolean;
  backfillSeconds: number;
  isMuted: boolean;
  toggleMute: () => void;
  micLevel: number;
  micQuality: "good" | "fair" | "poor";
  toastMessage: string | null;
  showToast: (msg: string) => void;
  clearToast: () => void;
  isDemoMode: boolean;
  startDemoMode: () => void;
  stopDemoMode: () => void;
  connectToSession: (code: string, participantName: string) => void;
  leaveSession: () => void;
  retryConnection: () => void;
  voiceEnrolled: boolean;
  setVoiceEnrolled: (enrolled: boolean) => void;
  createSessionOnBackend: (roomName?: string) => Promise<string>;
  querySessionOnBackend: (code: string) => Promise<{ exists: boolean; roster: DeviceInfo[] }>;
  startTimeMs: number;
  evalOpen: boolean;
  setEvalOpen: (open: boolean) => void;
  recordedAudioUrl: string | null;
}

const SessionContext = createContext<SessionContextType | null>(null);

const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:8000";

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [sessionCode, setSessionCode] = useState<string>("R7K4QM");
  const [sessionName, setSessionName] = useState<string>("Team Discussion");
  const [isHost, setIsHost] = useState<boolean>(true);
  const [name, setName] = useState<string>("Jim");
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
  const [myDeviceIdx, setMyDeviceIdx] = useState<number | null>(0);
  const [status, setStatus] = useState<ConnectionStatus>("connected");
  const [rttMs, setRttMs] = useState<number>(24);
  const [offsetMs, setOffsetMs] = useState<number>(2.1);
  const [roster, setRoster] = useState<DeviceInfo[]>(INITIAL_DEMO_ROSTER);
  const [captions, setCaptions] = useState<ExtendedCaptionMessage[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<number | null>(null);
  const [overlappingCount, setOverlappingCount] = useState<number>(0);
  const [isBackfilling, setIsBackfilling] = useState<boolean>(false);
  const [backfillSeconds, setBackfillSeconds] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0.55);
  const [micQuality, setMicQuality] = useState<"good" | "fair" | "poor">("good");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [voiceEnrolled, setVoiceEnrolled] = useState<boolean>(false);
  const [startTimeMs, setStartTimeMs] = useState<number>(Date.now());
  const [evalOpen, setEvalOpen] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const clientRef = useRef<RoundtableClient | null>(null);
  const audioSourceRef = useRef<any>(null);
  const recognizerRef = useRef<BrowserSpeechRecognizer | null>(null);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const connectedCodeRef = useRef<string | null>(null);

  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const myDeviceIdxRef = useRef(myDeviceIdx);
  useEffect(() => {
    myDeviceIdxRef.current = myDeviceIdx;
  }, [myDeviceIdx]);

  const activeSpeakerIdRef = useRef(activeSpeakerId);
  useEffect(() => {
    activeSpeakerIdRef.current = activeSpeakerId;
  }, [activeSpeakerId]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const clearToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Update caption or append
  const handleIncomingCaption = useCallback((caption: ExtendedCaptionMessage) => {
    setCaptions((prev) => {
      const index = prev.findIndex((c) => c.line_id === caption.line_id);
      if (index !== -1) {
        const next = [...prev];
        next[index] = { ...next[index], ...caption };
        return next;
      }
      return [...prev, caption];
    });

    if (caption.speaker_id !== null) {
      setActiveSpeakerId(caption.speaker_id);
    }
  }, []);

  // Create session on backend REST
  const createSessionOnBackend = async (roomName?: string): Promise<string> => {
    try {
      const base = serverUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${base}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessionCode(data.code);
      if (roomName) setSessionName(roomName);
      setIsHost(true);
      return data.code;
    } catch {
      const fallbackCode = "R7K4QM";
      setSessionCode(fallbackCode);
      if (roomName) setSessionName(roomName);
      setIsHost(true);
      return fallbackCode;
    }
  };

  // Query session on backend REST
  const querySessionOnBackend = async (
    code: string
  ): Promise<{ exists: boolean; roster: DeviceInfo[] }> => {
    try {
      const base = serverUrl.trim().replace(/\/+$/, "");
      const res = await fetch(`${base}/sessions/${code}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      return { exists: true, roster: data.roster || [] };
    } catch {
      return { exists: true, roster: INITIAL_DEMO_ROSTER };
    }
  };

  // Stop Demo Mode
  const stopDemoMode = useCallback(() => {
    setIsDemoMode(false);
    demoTimersRef.current.forEach((t) => clearTimeout(t));
    demoTimersRef.current = [];
  }, []);

  // Start Demo Mode
  const startDemoMode = useCallback(() => {
    stopDemoMode();
    setIsDemoMode(true);
    setCaptions([]);
    setRoster(INITIAL_DEMO_ROSTER);
    setMyDeviceIdx(0);
    setStatus("connected");
    setIsBackfilling(false);
    setOverlappingCount(0);
    showToast("Interactive Meeting Demo started");

    let accumulatedTime = 0;
    DEMO_SCRIPT_STEPS.forEach((step) => {
      accumulatedTime += step.delayMs;
      const timer = setTimeout(() => {
        switch (step.type) {
          case "speaking_start":
            setActiveSpeakerId(step.payload.speaker_id);
            break;
          case "caption_draft":
          case "caption_revision":
          case "caption_final":
            handleIncomingCaption(step.payload);
            break;
          case "overlap_start":
            setOverlappingCount(step.payload.count || 2);
            break;
          case "overlap_end":
            setOverlappingCount(0);
            break;
          case "connection_lost":
            setStatus("disconnected");
            break;
          case "reconnecting":
            setStatus("reconnecting");
            break;
          case "connection_restored":
            setStatus("connected");
            setIsBackfilling(true);
            setBackfillSeconds(step.payload.backfillSeconds || 2.1);
            break;
          case "backfill_complete":
            setIsBackfilling(false);
            showToast("Conversation synced");
            break;
          case "toast":
            showToast(step.payload.message);
            break;
        }
      }, accumulatedTime);
      demoTimersRef.current.push(timer);
    });
  }, [handleIncomingCaption, showToast, stopDemoMode]);

  // Connect to real WebSocket & Start live microphone speech-to-text
  const connectToSession = useCallback(
    (code: string, participantName: string) => {
      stopDemoMode();
      setSessionCode(code);
      setName(participantName);
      setStartTimeMs(Date.now());

      if (
        clientRef.current &&
        connectedCodeRef.current === code &&
        clientRef.current.getStatus() === "connected"
      ) {
        return;
      }

      connectedCodeRef.current = code;

      if (clientRef.current) {
        clientRef.current.disconnect();
      }

      const client = new RoundtableClient({
        serverUrl,
        sessionId: code,
        name: participantName,
        onStatusChange: (newStatus) => setStatus(newStatus),
        onJoined: (msg) => {
          setMyDeviceIdx(msg.device_idx);
          myDeviceIdxRef.current = msg.device_idx;
          showToast(`Joined as device #${msg.device_idx}`);
          recognizerRef.current?.updateSpeaker(
            msg.device_idx,
            participantName,
            getSpeakerColor(msg.device_idx).color
          );
        },
        onClockSync: (offset, rtt) => {
          setOffsetMs(offset);
          setRttMs(rtt);
        },
        onRoster: (devices) => {
          setRoster(devices);
        },
        onCaption: (caption) => {
          handleIncomingCaption(caption);
        },
      });

      clientRef.current = client;
      client.connect();

      // 1. Live Speech Recognition & Audio Recording
      if (recognizerRef.current) {
        recognizerRef.current.stop();
      }
      const recognizer = new BrowserSpeechRecognizer({
        speakerId: myDeviceIdxRef.current,
        speakerName: participantName,
        speakerColor: getSpeakerColor(myDeviceIdxRef.current).color,
        onCaption: (caption) => {
          if (!isMutedRef.current) {
            handleIncomingCaption(caption);
            client.sendCaption(caption);
          }
        },
        onSpeakingChange: (isSpeaking) => {
          if (isSpeaking && !isMutedRef.current) {
            setActiveSpeakerId(myDeviceIdxRef.current);
          } else if (!isSpeaking) {
            setActiveSpeakerId((prev) =>
              prev === myDeviceIdxRef.current ? null : prev
            );
          }
        },
      });
      recognizerRef.current = recognizer;
      recognizer.start();

      // 2. 16 kHz PCM Audio Frame Capture
      const audioSource = createAudioSource();
      audioSourceRef.current = audioSource;
      audioSource.onChunk((pcm, ts) => {
        if (!isMutedRef.current) {
          client.sendAudioFrame(pcm, ts);
        }
      });
      audioSource.start().catch((e) => {
        console.warn("Audio start error:", e);
      });
    },
    [handleIncomingCaption, serverUrl, showToast, stopDemoMode]
  );

  // Leave session
  const leaveSession = useCallback(() => {
    stopDemoMode();
    connectedCodeRef.current = null;
    if (recognizerRef.current) {
      const url = recognizerRef.current.getRecordedAudioUrl();
      if (url) setRecordedAudioUrl(url);
      recognizerRef.current.stop();
      recognizerRef.current = null;
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setStatus("disconnected");
  }, [stopDemoMode]);

  const retryConnection = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.connect();
    } else {
      connectToSession(sessionCode, name);
    }
  }, [connectToSession, name, sessionCode]);

  useEffect(() => {
    return () => {
      stopDemoMode();
      leaveSession();
    };
  }, [leaveSession, stopDemoMode]);

  return (
    <SessionContext.Provider
      value={{
        sessionCode,
        setSessionCode,
        sessionName,
        setSessionName,
        isHost,
        setIsHost,
        name,
        setName,
        serverUrl,
        setServerUrl,
        myDeviceIdx,
        status,
        rttMs,
        offsetMs,
        roster,
        captions,
        activeSpeakerId,
        overlappingCount,
        isBackfilling,
        backfillSeconds,
        isMuted,
        toggleMute,
        micLevel,
        micQuality,
        toastMessage,
        showToast,
        clearToast,
        isDemoMode,
        startDemoMode,
        stopDemoMode,
        connectToSession,
        leaveSession,
        retryConnection,
        voiceEnrolled,
        setVoiceEnrolled,
        createSessionOnBackend,
        querySessionOnBackend,
        startTimeMs,
        evalOpen,
        setEvalOpen,
        recordedAudioUrl,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
};
