import { NeonWord } from './NeonWord';

/**
 * Represents a single sub-line: a subset of words that fit within the max width.
 */
export interface SubLine {
  words: NeonWord[];
  totalWidth: number; // sum of word widths + inter-word spacing
}

/** Maximum panel width in 3D units — fits comfortably in the viewport at all camera Z positions. */
export const MAX_PANEL_WIDTH = 6.0;

/** Horizontal padding inside the plate (left + right combined). */
export const PANEL_PADDING = 1.4;

/** Maximum content width available for text within a panel. */
export const MAX_CONTENT_WIDTH = MAX_PANEL_WIDTH - PANEL_PADDING;

/**
 * Calculates sub-line breaks for a list of NeonWord instances.
 *
 * Uses a greedy algorithm: adds words to the current sub-line until the next
 * word would exceed the maximum content width, then starts a new sub-line.
 *
 * @param neonWords - Array of NeonWord instances (already constructed with measured widths)
 * @param maxContentWidth - Maximum width available for text content
 * @param wordSpacing - Spacing in 3D units between adjacent words
 * @returns Array of SubLine objects, each containing words that fit within the max width
 */
export function calculateSubLines(
  neonWords: NeonWord[],
  maxContentWidth: number,
  wordSpacing: number
): SubLine[] {
  if (neonWords.length === 0) {
    return [];
  }

  const subLines: SubLine[] = [];
  let currentWords: NeonWord[] = [];
  let currentWidth = 0;

  for (let i = 0; i < neonWords.length; i++) {
    const word = neonWords[i];
    const wordWidth = word.getWidth3D();

    if (currentWords.length === 0) {
      // First word on a sub-line always fits (even if it's wider than max, we can't break words)
      currentWords.push(word);
      currentWidth = wordWidth;
    } else {
      // Check if adding this word (plus spacing) would exceed the max width
      const widthWithWord = currentWidth + wordSpacing + wordWidth;

      if (widthWithWord > maxContentWidth) {
        // Finalize the current sub-line
        subLines.push({
          words: currentWords,
          totalWidth: currentWidth
        });

        // Start a new sub-line with this word
        currentWords = [word];
        currentWidth = wordWidth;
      } else {
        // Word fits, add it to the current sub-line
        currentWords.push(word);
        currentWidth = widthWithWord;
      }
    }
  }

  // Finalize the last sub-line
  if (currentWords.length > 0) {
    subLines.push({
      words: currentWords,
      totalWidth: currentWidth
    });
  }

  return subLines;
}
