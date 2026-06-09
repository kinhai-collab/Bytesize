import { useCallback, useEffect, useRef, useState } from "react";

type UseSpeechOptions = {
  onError?: (message: string) => void;
};

const MAX_CHUNK_LENGTH = 900;

function cleanTextForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~|-]+/g, " ")
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

export function useSpeech({ onError }: UseSpeechOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    utterancesRef.current = [];
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        onError?.("Read aloud is not supported in this browser.");
        return;
      }

      const chunks = splitSpeechText(text);
      if (chunks.length === 0) return;

      stoppedRef.current = false;
      window.speechSynthesis.cancel();

      const utterances = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
          if (!stoppedRef.current && index === chunks.length - 1) {
            utterancesRef.current = [];
            setIsSpeaking(false);
          }
        };
        utterance.onerror = () => {
          utterancesRef.current = [];
          setIsSpeaking(false);
          onError?.("Failed to play audio.");
        };
        return utterance;
      });

      utterancesRef.current = utterances;
      utterances.forEach((utterance) => window.speechSynthesis.speak(utterance));
    },
    [onError],
  );

  useEffect(() => stop, [stop]);

  return { isSpeaking, speak, stop };
}
