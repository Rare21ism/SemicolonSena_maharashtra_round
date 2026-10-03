import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { CaptionMessage, DeviceInfo } from "@roundtable/protocol";
import { ExtendedCaptionMessage } from "../components/CaptionLine";
import { ConnectionStatus, RoundtableClient } from "../net/ws";
import { createAudioSource } from "../audio";

const getDefaultServerUrl = (): string => {
  if (process.env.EXPO_PUBLIC_SERVER_URL) {
    return process.env.EXPO_PUBLIC_SERVER_URL;
  }
  if (Platform.OS !== "web") {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
      (Constants as any).manifest?.debuggerHost;
    if (hostUri) {
      const host = hostUri.split(":")[0];
      if (host) {
        return `http://${host}:8000`;
      }
    }
  }
  return "http://localhost:8000";
};

const DEFAULT_SERVER_URL = getDefaultServerUrl();

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

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [sessionCode, setSessionCode] = useState<string>("");
  const [sessionName, setSessionName] = useState<string>("Team Discussion");
  const [isHost, setIsHost] = useState<boolean>(false);
  const [name, setName] = useState<string>("Participant");
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
  const [myDeviceIdx, setMyDeviceIdx] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [rttMs, setRttMs] = useState<number>(0);
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const [roster, setRoster] = useState<DeviceInfo[]>([]);
  const [captions, setCaptions] = useState<ExtendedCaptionMessage[]>([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState<number | null>(null);
  const [overlappingCount, setOverlappingCount] = useState<number>(0);
  const [isBackfilling, setIsBackfilling] = useState<boolean>(false);
  const [backfillSeconds, setBackfillSeconds] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [micQuality, setMicQuality] = useState<"good" | "fair" | "poor">("poor");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [voiceEnrolled, setVoiceEnrolled] = useState<boolean>(false);
  const [startTimeMs, setStartTimeMs] = useState<number>(Date.now());
  const [evalOpen, setEvalOpen] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);

  const clientRef = useRef<RoundtableClient | null>(null);
  const audioSourceRef = useRef<any>(null);
  const connectedCodeRef = useRef<string | null>(null);

  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const myDeviceIdxRef = useRef(myDeviceIdx);
  useEffect(() => {
    myDeviceIdxRef.current = myDeviceIdx;
  }, [myDeviceIdx]);

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
        const current = prev[index];
        // If current is already final, don't revert back to draft
        if (current.state === "final" && caption.state === "draft") {
          return prev;
        }
        // If incoming revision is older than what we currently have, ignore
        if (caption.rev < current.rev) {
          return prev;
        }
        const next = [...prev];
        next[index] = { ...current, ...caption };
        return next;
      }
      return [...prev, caption];
    });

    if (caption.speaker_id !== null) {
      setActiveSpeakerId(caption.speaker_id);
    }
  }, []);

  const getEffectiveServerUrl = useCallback((url?: string): string => {
    let candidate = (url || serverUrl || "").trim().replace(/\/+$/, "");
    if (!candidate || (Platform.OS !== "web" && (candidate.includes("localhost") || candidate.includes("127.0.0.1")))) {
      const detected = getDefaultServerUrl();
      if (detected && !detected.includes("localhost") && !detected.includes("127.0.0.1")) {
        return detected;
      }
      return "http://192.168.1.3:8000";
    }
    return candidate;
  }, [serverUrl]);

  // Create session on backend REST
  const createSessionOnBackend = async (roomName?: string): Promise<string> => {
    try {
      const base = getEffectiveServerUrl();
      const res = await fetch(`${base}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errorBody = await res.json();
          if (typeof errorBody.detail === "string") detail = errorBody.detail;
        } catch {}
        throw new Error(detail);
      }
      const data = await res.json();
      setSessionCode(data.code);
      if (roomName) setSessionName(roomName);
      setIsHost(true);
      return data.code;
    } catch (error) {
      throw new Error(`Could not create a meeting on the server: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Query session on backend REST
  const querySessionOnBackend = async (
    code: string
  ): Promise<{ exists: boolean; roster: DeviceInfo[] }> => {
    try {
      const base = getEffectiveServerUrl();
      const res = await fetch(`${base}/sessions/${code}`);
      if (res.status === 404) return { exists: false, roster: [] };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { exists: true, roster: data.roster || [] };
    } catch (error) {
      throw new Error(`Could not check the meeting on the server: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Connect to real WebSocket & Start live microphone speech-to-text
  const connectToSession = useCallback(
    (code: string, participantName: string) => {
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
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      }

      const effectiveUrl = getEffectiveServerUrl();

      const client = new RoundtableClient({
        serverUrl: effectiveUrl,
        sessionId: code,
        name: participantName,
        onStatusChange: (newStatus) => setStatus(newStatus),
        onJoined: (msg) => {
          setMyDeviceIdx(msg.device_idx);
          myDeviceIdxRef.current = msg.device_idx;
          showToast(`Joined as device #${msg.device_idx}`);
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

      // Stream real 16 kHz PCM; caption recognition and speaker IDs come from the server pipeline.
      const audioSource = createAudioSource();
      audioSourceRef.current = audioSource;
      audioSource.onChunk((pcm, ts) => {
        if (!isMutedRef.current) {
          client.sendAudioFrame(pcm, ts);
        }
      });
      audioSource.start().catch((e) => {
        console.error("Audio capture could not start:", e);
        showToast(e instanceof Error ? e.message : "Audio capture could not start.");
      });
    },
    [getEffectiveServerUrl, handleIncomingCaption, showToast]
  );

  // Leave session
  const leaveSession = useCallback(() => {
    connectedCodeRef.current = null;
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  const retryConnection = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.connect();
    } else {
      connectToSession(sessionCode, name);
    }
  }, [connectToSession, name, sessionCode]);

  useEffect(() => {
    return () => {
      leaveSession();
    };
  }, [leaveSession]);

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
