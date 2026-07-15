/**
 * useSpeechToText
 *
 * Strategy:
 *   1. If window.SpeechRecognition (or webkitSpeechRecognition) is available,
 *      use the Web Speech API for live streaming transcription.
 *   2. Otherwise, record audio via MediaRecorder, collect the Blob, and send it
 *      to ai-run transcribe (placeholder — mark with TODO for real STT wiring).
 *
 * Returns:
 *   - isListening: boolean
 *   - isSupported: boolean
 *   - transcript: string (interim + final, accumulated)
 *   - start(): void
 *   - stop(): void
 *   - reset(): void
 */

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

type TranscribeResult = { text: string };

// ─── helpers ────────────────────────────────────────────────────────────────

function getRecognitionConstructor(): any | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

/**
 * TODO: Replace this stub with a real call to your ai-run transcribe edge
 * function once the AI layer is fully wired in Part G.
 *
 * Expected signature:
 *   POST /functions/v1/ai-run
 *   body: { kind: "transcribe", input: { audio_b64: string } }
 *   returns: { text: string }
 */
async function callTranscribeStub(blob: Blob): Promise<TranscribeResult> {
  // Stub: in a real implementation, convert blob to base64 and POST to ai-run.
  return { text: "[Transcription not yet wired — connect ai-run transcribe here]" };
}

// ─── hook ────────────────────────────────────────────────────────────────────

export interface UseSpeechToTextOptions {
  /** Called every time new text arrives (interim or final for Web Speech, final for fallback). */
  onTranscript: (text: string) => void;
  language?: string;
}

export interface UseSpeechToTextReturn {
  isListening: boolean;
  isSupported: boolean;
  usingNative: boolean;
  start: () => void;
  stop: () => void;
}

export function useSpeechToText({
  onTranscript,
  language = "en-US",
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const SpeechRecognitionCtor = getRecognitionConstructor();
  const usingNative = Boolean(SpeechRecognitionCtor);
  const isSupported = usingNative || Boolean(navigator?.mediaDevices?.getUserMedia);

  // ── Native Web Speech API path ────────────────────────────────────────────
  const startNative = useCallback(() => {
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      // Deliver final chunks as committed text; interim as preview
      if (final) onTranscript(final);
    };

    recognition.onerror = (event: any) => {
      console.error("SpeechRecognition error:", event.error);
      toast.error(`Voice capture error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [SpeechRecognitionCtor, language, onTranscript]);

  const stopNative = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  // ── MediaRecorder fallback path ───────────────────────────────────────────
  const startFallback = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setIsListening(false);

        toast.loading("Transcribing audio…", { id: "transcribe" });
        try {
          const result = await callTranscribeStub(blob);
          onTranscript(result.text);
          toast.success("Transcription complete", { id: "transcribe" });
        } catch {
          toast.error("Transcription failed", { id: "transcribe" });
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsListening(true);
    } catch (err) {
      toast.error("Microphone access denied or unavailable.");
    }
  }, [onTranscript]);

  const stopFallback = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }, []);

  // ── Unified API ───────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (usingNative) startNative();
    else startFallback();
  }, [usingNative, startNative, startFallback]);

  const stop = useCallback(() => {
    if (usingNative) stopNative();
    else stopFallback();
  }, [usingNative, stopNative, stopFallback]);

  return { isListening, isSupported, usingNative, start, stop };
}
