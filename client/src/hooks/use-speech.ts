import { useCallback, useEffect, useRef, useState } from "react";

type UseSpeechOptions = {
  onError?: (message: string) => void;
};

const MAX_CHUNK_LENGTH = 1200;

function cleanTextForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~]+/g, " ")
    .replace(/\s+-\s+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpeechText(text: string) {
  const cleanText = cleanTextForSpeech(text);
  const sentences = cleanText.match(/[^.!?]+[.!?]+|\S.+$/g) ?? [cleanText];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (next.length <= MAX_CHUNK_LENGTH) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = sentence.trim();

    while (current.length > MAX_CHUNK_LENGTH) {
      const splitAt = current.lastIndexOf(" ", MAX_CHUNK_LENGTH);
      const index = splitAt > 200 ? splitAt : MAX_CHUNK_LENGTH;
      chunks.push(current.slice(0, index).trim());
      current = current.slice(index).trim();
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function fetchSpeechAudio(text: string, signal: AbortSignal) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message || "Failed to generate speech");
  }

  const data = await res.json();
  if (!data.audioUrl) throw new Error("No audio data returned");
  return data.audioUrl as string;
}

export function useSpeech({ onError }: UseSpeechOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackIdRef = useRef(0);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    playbackIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsPreparing(false);
    setIsSpeaking(false);
  }, []);

  const playAudio = useCallback(
    (audioUrl: string, playbackId: number) =>
      new Promise<void>((resolve, reject) => {
        if (playbackId !== playbackIdRef.current || stoppedRef.current) {
          resolve();
          return;
        }

        const audio = new Audio(audioUrl);
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };

        audioRef.current = audio;
        audio.onplay = () => {
          if (playbackId === playbackIdRef.current) {
            setIsPreparing(false);
            setIsSpeaking(true);
          }
        };
        audio.onended = finish;
        audio.onpause = () => {
          if (stoppedRef.current || playbackId !== playbackIdRef.current) finish();
        };
        audio.onerror = () => fail(new Error("Failed to play audio"));
        audio.play().catch(fail);
      }),
    [],
  );

  const speak = useCallback(
    async (text: string) => {
      const chunks = splitSpeechText(text);
      if (chunks.length === 0) return;

      stop();
      stoppedRef.current = false;
      setIsPreparing(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const playbackId = playbackIdRef.current;

      try {
        let nextAudio = fetchSpeechAudio(chunks[0], controller.signal);

        for (let index = 0; index < chunks.length; index += 1) {
          const audioUrl = await nextAudio;
          if (stoppedRef.current || playbackId !== playbackIdRef.current) return;

          nextAudio =
            index + 1 < chunks.length
              ? fetchSpeechAudio(chunks[index + 1], controller.signal)
              : Promise.resolve("");

          await playAudio(audioUrl, playbackId);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("TTS playback error:", error);
          onError?.("Failed to generate speech.");
        }
      } finally {
        if (playbackId === playbackIdRef.current) {
          abortRef.current = null;
          audioRef.current = null;
          setIsPreparing(false);
          setIsSpeaking(false);
        }
      }
    },
    [onError, playAudio, stop],
  );

  useEffect(() => stop, [stop]);

  return { isPreparing, isSpeaking, speak, stop };
}
