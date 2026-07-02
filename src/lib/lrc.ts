import { LyricLine, LyricWord, LyricMetadata, ParsedLyrics } from '../types/lyrics';

/**
 * Parses a timestamp string into seconds.
 * Supports: [mm:ss.xx], [hh:mm:ss.xx], [ss.xx], <mm:ss.xx>, etc.
 */
export function parseTimestamp(timeStr: string): number | null {
  const cleanStr = timeStr.trim().replace(/[\[\]<>]/g, '');
  if (!cleanStr) return null;

  const parts = cleanStr.split(':');
  
  try {
    if (parts.length === 3) {
      // hh:mm:ss.xx
      const hrs = parseFloat(parts[0]);
      const mins = parseFloat(parts[1]);
      const secs = parseFloat(parts[2]);
      if (isNaN(hrs) || isNaN(mins) || isNaN(secs)) return null;
      return hrs * 3600 + mins * 60 + secs;
    } else if (parts.length === 2) {
      // mm:ss.xx
      const mins = parseFloat(parts[0]);
      const secs = parseFloat(parts[1]);
      if (isNaN(mins) || isNaN(secs)) return null;
      return mins * 60 + secs;
    } else if (parts.length === 1) {
      // ss.xx
      const secs = parseFloat(parts[0]);
      if (isNaN(secs)) return null;
      return secs;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Parses an LRC lyrics file contents.
 */
export function parseLRC(lrcText: string): ParsedLyrics {
  const lines = lrcText.split(/\r?\n/);
  const metadata: LyricMetadata = { offset: 0 };
  const rawLines: { startTime: number; text: string }[] = [];
  
  let hasWordTiming = false;

  const metadataRegex = /^\[(ar|ti|al|by|offset|length):(.*)\]$/i;
  const lineTimestampPrefixRegex = /^(\[[\d:.]+\])+/;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    // Check for metadata
    const metaMatch = line.match(metadataRegex);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      
      if (key === 'ti') metadata.title = val;
      else if (key === 'ar') metadata.artist = val;
      else if (key === 'al') metadata.album = val;
      else if (key === 'by') metadata.by = val;
      else if (key === 'offset') {
        // Offset is in milliseconds (e.g. [offset:+250] or [offset:-500])
        const ms = parseFloat(val);
        if (!isNaN(ms)) {
          // Convert to seconds
          metadata.offset = ms / 1000;
        }
      }
      continue;
    }

    // Check for standard line-level timestamp prefix
    const timestampMatch = line.match(lineTimestampPrefixRegex);
    if (timestampMatch) {
      const prefix = timestampMatch[0];
      const text = line.substring(prefix.length);

      // Extract all timestamps in the prefix (e.g., [00:12.00][00:45.00] lyric)
      const timestampStrings = prefix.match(/\[[\d:.]+\]/g) || [];
      
      for (const tStr of timestampStrings) {
        const time = parseTimestamp(tStr);
        if (time !== null) {
          rawLines.push({
            startTime: time,
            text: text
          });
        }
      }
    }
  }

  // Sort raw lines by start time
  rawLines.sort((a, b) => a.startTime - b.startTime);

  // Apply offset to all raw line start times
  const offset = metadata.offset || 0;
  for (const line of rawLines) {
    line.startTime = Math.max(0, line.startTime + offset);
  }

  const parsedLines: LyricLine[] = [];

  // Parse lines and infer line endTimes
  for (let i = 0; i < rawLines.length; i++) {
    const currentRaw = rawLines[i];
    const nextRaw = rawLines[i + 1];
    
    // Infer line end time: either the next line's start time, or start + 8s as default
    const lineStartTime = currentRaw.startTime;
    const lineEndTime = nextRaw ? nextRaw.startTime : lineStartTime + 8.0;

    const words: LyricWord[] = [];
    const text = currentRaw.text;

    // Check if the line has inline word timing tags, e.g. <00:10.00>
    const hasInlineTags = /<[\d:.]+>/.test(text);

    if (hasInlineTags) {
      hasWordTiming = true;
      
      // Split the text by inline tags, e.g. "<00:10.00>Hello <00:10.50>world"
      // Split captures timestamps in odd indices: [ "", "00:10.00", "Hello ", "00:10.50", "world" ]
      const tokens = text.split(/<([\d:.]+)>/);
      
      let currentWordTime = lineStartTime;
      let pendingWordIndex = -1;

      for (let j = 0; j < tokens.length; j++) {
        const token = tokens[j];
        if (j % 2 === 1) {
          // Odd indices are timestamps
          const parsedWordTime = parseTimestamp(token);
          if (parsedWordTime !== null) {
            // Apply offset to word times as well
            currentWordTime = Math.max(0, parsedWordTime + offset);
            
            // If we have a pending word that needs an end time, this timestamp is its end time
            if (pendingWordIndex !== -1) {
              words[pendingWordIndex].endTime = currentWordTime;
              pendingWordIndex = -1;
            }
          }
        } else {
          // Even indices are word text
          const cleanedText = token.trim();
          if (cleanedText) {
            words.push({
              text: cleanedText,
              startTime: currentWordTime,
              endTime: currentWordTime // Will be adjusted below if it stays equal to startTime
            });
            pendingWordIndex = words.length - 1;
          }
        }
      }

      // Adjust word endTimes for any word that didn't get an explicit closing timestamp
      for (let w = 0; w < words.length; w++) {
        if (words[w].endTime === words[w].startTime) {
          const nextWord = words[w + 1];
          words[w].endTime = nextWord ? nextWord.startTime : lineEndTime;
        }
      }
    } else {
      // Fallback: entire line is treated as a single word spanning the entire duration of the line
      words.push({
        text: text.trim(),
        startTime: lineStartTime,
        endTime: lineEndTime
      });
    }

    parsedLines.push({
      id: `line-${i}-${lineStartTime.toFixed(3)}`,
      startTime: lineStartTime,
      endTime: lineEndTime,
      text: text.replace(/<[\d:.]+>/g, '').replace(/\s+/g, ' ').trim(), // Clean version of the text
      words: words
    });
  }

  const linesWithPauses: LyricLine[] = [];
  const pauseThreshold = 2.0;

  for (let i = 0; i < parsedLines.length; i++) {
    const currentLine = parsedLines[i];
    linesWithPauses.push(currentLine);

    const nextLine = parsedLines[i + 1];
    if (nextLine) {
      let vocalEndTime = currentLine.endTime;
      if (hasWordTiming && currentLine.words.length > 0) {
        vocalEndTime = currentLine.words[currentLine.words.length - 1].endTime;
      } else {
        const wordsCount = currentLine.text.split(/\s+/).filter(Boolean).length;
        const estimatedDuration = Math.min(6.0, Math.max(1.5, wordsCount * 0.35 + 0.8));
        vocalEndTime = Math.min(currentLine.startTime + estimatedDuration, nextLine.startTime);
      }

      currentLine.endTime = vocalEndTime;
      if (currentLine.words.length > 0) {
        currentLine.words[currentLine.words.length - 1].endTime = vocalEndTime;
      }

      const gap = nextLine.startTime - vocalEndTime;
      if (gap >= pauseThreshold) {
        linesWithPauses.push({
          id: `pause-${i}-${vocalEndTime.toFixed(3)}`,
          startTime: vocalEndTime,
          endTime: nextLine.startTime,
          text: '[Instrumental]',
          words: [],
          isPause: true
        });
      }
    }
  }

  return {
    metadata,
    lines: linesWithPauses,
    hasWordTiming
  };
}
