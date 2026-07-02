import { describe, it, expect } from 'vitest';
import { findActiveLineIndex, findActiveWordIndex, getSyncState } from '../lib/sync';
import { LyricLine } from '../types/lyrics';

describe('Sync Engine - Active Line Lookup', () => {
  const mockLines: LyricLine[] = [
    { id: '1', startTime: 10, endTime: 15, text: 'First line', words: [] },
    { id: '2', startTime: 15, endTime: 20, text: 'Second line', words: [] },
    { id: '3', startTime: 25, endTime: 30, text: 'Third line', words: [] }
  ];

  it('should return -1 when time is before the first line', () => {
    expect(findActiveLineIndex(mockLines, 5)).toBe(-1);
    expect(findActiveLineIndex(mockLines, 9.9)).toBe(-1);
  });

  it('should find line at exact boundary', () => {
    expect(findActiveLineIndex(mockLines, 10)).toBe(0);
    expect(findActiveLineIndex(mockLines, 15)).toBe(1);
    expect(findActiveLineIndex(mockLines, 25)).toBe(2);
  });

  it('should find line in between lines', () => {
    expect(findActiveLineIndex(mockLines, 12)).toBe(0);
    expect(findActiveLineIndex(mockLines, 18)).toBe(1);
  });

  it('should find line in timing gap (but out of bounds)', () => {
    // There is a gap between 20s and 25s
    expect(findActiveLineIndex(mockLines, 22)).toBe(1); // The second line is still the "most recently started"
    
    const state = getSyncState(mockLines, 22);
    expect(state.activeLineIndex).toBe(1);
    expect(state.inLineBounds).toBe(false); // But not active inside bounds
  });

  it('should find last line when time is after the last line', () => {
    expect(findActiveLineIndex(mockLines, 40)).toBe(2);
  });
});

describe('Sync Engine - Active Word Lookup', () => {
  const mockWords = [
    { text: 'One', startTime: 10.0, endTime: 11.0 },
    { text: 'Two', startTime: 11.0, endTime: 12.5 },
    { text: 'Three', startTime: 12.5, endTime: 14.0 }
  ];

  it('should return -1 if time is before first word', () => {
    expect(findActiveWordIndex(mockWords, 9.5)).toBe(-1);
  });

  it('should return correct index at exact boundaries', () => {
    expect(findActiveWordIndex(mockWords, 10.0)).toBe(0);
    expect(findActiveWordIndex(mockWords, 11.0)).toBe(1);
    expect(findActiveWordIndex(mockWords, 12.5)).toBe(2);
  });

  it('should return correct index between boundaries', () => {
    expect(findActiveWordIndex(mockWords, 10.5)).toBe(0);
    expect(findActiveWordIndex(mockWords, 12.0)).toBe(1);
    expect(findActiveWordIndex(mockWords, 13.0)).toBe(2);
  });

  it('should return -1 if time is after last word', () => {
    expect(findActiveWordIndex(mockWords, 14.5)).toBe(-1);
  });
});
