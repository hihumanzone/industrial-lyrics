export interface LyricWord {
  text: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
}

export interface LyricLine {
  id: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
  words: LyricWord[];
  isPause?: boolean;
}

export interface LyricMetadata {
  title?: string;
  artist?: string;
  album?: string;
  by?: string;
  offset?: number; // in seconds (parsed from offset in ms, e.g. [offset:+250] is +0.25s)
}

export interface ParsedLyrics {
  metadata: LyricMetadata;
  lines: LyricLine[];
  hasWordTiming: boolean;
}
