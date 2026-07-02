import { LyricLine, LyricWord } from '../types/lyrics';

export interface SyncResult {
  activeLineIndex: number; // -1 if before the first line
  activeLine: LyricLine | null;
  activeWordIndex: number; // -1 if no word is active
  activeWord: LyricWord | null;
  inLineBounds: boolean; // True if currentTime is strictly between activeLine.startTime and activeLine.endTime
}

/**
 * Performs a binary search to find the index of the active lyric line at the current playback time.
 * Returns the index of the line that started most recently before or at currentTime.
 */
export function findActiveLineIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  if (currentTime < lines[0].startTime) return -1;

  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].startTime <= currentTime) {
      result = mid; // This is a candidate active line
      low = mid + 1; // Look for a later start time
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/**
 * Searches for the active word inside a line's word array at the current playback time.
 */
export function findActiveWordIndex(words: LyricWord[], currentTime: number): number {
  if (words.length === 0) return -1;
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (currentTime >= word.startTime && currentTime < word.endTime) {
      return i;
    }
  }
  
  return -1;
}

/**
 * Computes the synchronization state for a given playback time.
 */
export function getSyncState(lines: LyricLine[], currentTime: number): SyncResult {
  const activeLineIndex = findActiveLineIndex(lines, currentTime);
  
  if (activeLineIndex === -1) {
    return {
      activeLineIndex: -1,
      activeLine: null,
      activeWordIndex: -1,
      activeWord: null,
      inLineBounds: false
    };
  }

  const activeLine = lines[activeLineIndex];
  const inLineBounds = currentTime >= activeLine.startTime && currentTime < activeLine.endTime;
  
  let activeWordIndex = -1;
  let activeWord: LyricWord | null = null;

  if (inLineBounds) {
    activeWordIndex = findActiveWordIndex(activeLine.words, currentTime);
    if (activeWordIndex !== -1) {
      activeWord = activeLine.words[activeWordIndex];
    }
  }

  return {
    activeLineIndex,
    activeLine,
    activeWordIndex,
    activeWord,
    inLineBounds
  };
}
