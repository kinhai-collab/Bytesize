declare module "youtube-transcript/dist/youtube-transcript.esm.js" {
  export interface TranscriptItem {
    text: string;
    duration: number;
    offset: number;
    lang?: string;
  }

  export function fetchTranscript(videoId: string): Promise<TranscriptItem[]>;
}
