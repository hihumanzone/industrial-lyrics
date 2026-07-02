import { describe, it, expect } from 'vitest';
import { parseTimestamp, parseLRC } from '../lib/lrc';

describe('LRC Timestamp Parser', () => {
  it('should parse standard mm:ss.xx format', () => {
    expect(parseTimestamp('[00:12.34]')).toBe(12.34);
    expect(parseTimestamp('01:02.30')).toBe(62.3);
  });

  it('should parse hour format hh:mm:ss.xx', () => {
    expect(parseTimestamp('[01:02:03.40]')).toBe(3723.4);
  });

  it('should parse single digit minutes [m:ss.xx]', () => {
    expect(parseTimestamp('2:05.10')).toBe(125.10);
  });

  it('should parse ss.xx format', () => {
    expect(parseTimestamp('45.50')).toBe(45.5);
  });

  it('should return null for malformed timestamps', () => {
    expect(parseTimestamp('abc')).toBeNull();
    expect(parseTimestamp('12:abc')).toBeNull();
  });
});

describe('LRC Document Parser', () => {
  it('should parse metadata lines', () => {
    const lrc = `
      [ti:Testing Song]
      [ar:AI Developer]
      [al:Gemini Album]
      [offset:+1000]
    `;
    const result = parseLRC(lrc);
    expect(result.metadata.title).toBe('Testing Song');
    expect(result.metadata.artist).toBe('AI Developer');
    expect(result.metadata.album).toBe('Gemini Album');
    expect(result.metadata.offset).toBe(1.0); // +1000ms = 1s
  });

  it('should parse standard lyrics and infer end times', () => {
    const lrc = `
      [00:10.00] First lyric line
      [00:15.50] Second lyric line
    `;
    const result = parseLRC(lrc);
    expect(result.lines).toHaveLength(3);
    
    // Check first line
    expect(result.lines[0].text).toBe('First lyric line');
    expect(result.lines[0].startTime).toBe(10.0);
    expect(result.lines[0].endTime).toBe(11.85); // Adjusted to estimated vocal duration
    
    // Check pause line
    expect(result.lines[1].isPause).toBe(true);
    expect(result.lines[1].text).toBe('[Instrumental]');
    expect(result.lines[1].startTime).toBe(11.85);
    expect(result.lines[1].endTime).toBe(15.5);

    // Check second line
    expect(result.lines[2].text).toBe('Second lyric line');
    expect(result.lines[2].startTime).toBe(15.5);
    expect(result.lines[2].endTime).toBe(23.5); // Default end offset (15.5 + 8)
  });

  it('should handle multiple timestamps per line', () => {
    const lrc = `
      [00:10.00][00:20.00] Repeated chorus line
    `;
    const result = parseLRC(lrc);
    expect(result.lines).toHaveLength(3);
    
    expect(result.lines[0].startTime).toBe(10.0);
    expect(result.lines[0].endTime).toBe(11.85);
    expect(result.lines[0].text).toBe('Repeated chorus line');
    
    expect(result.lines[1].isPause).toBe(true);
    expect(result.lines[1].startTime).toBe(11.85);
    expect(result.lines[1].endTime).toBe(20.0);
    expect(result.lines[1].text).toBe('[Instrumental]');

    expect(result.lines[2].startTime).toBe(20.0);
    expect(result.lines[2].text).toBe('Repeated chorus line');
  });

  it('should apply metadata offsets to line start times', () => {
    const lrc = `
      [offset:-500]
      [00:10.00] Line one
    `;
    const result = parseLRC(lrc);
    expect(result.lines[0].startTime).toBe(9.5); // 10.0 - 0.5s
  });

  it('should parse enhanced word-timed LRC', () => {
    const lrc = `
      [00:10.00] <00:10.00> Hello <00:10.50> World <00:11.20> Again
    `;
    const result = parseLRC(lrc);
    expect(result.hasWordTiming).toBe(true);
    expect(result.lines).toHaveLength(1);
    
    const line = result.lines[0];
    expect(line.text).toBe('Hello World Again');
    expect(line.words).toHaveLength(3);
    
    // Check individual word contents and timings
    expect(line.words[0].text).toBe('Hello');
    expect(line.words[0].startTime).toBe(10.0);
    expect(line.words[0].endTime).toBe(10.5);
    
    expect(line.words[1].text).toBe('World');
    expect(line.words[1].startTime).toBe(10.5);
    expect(line.words[1].endTime).toBe(11.2);
    
    expect(line.words[2].text).toBe('Again');
    expect(line.words[2].startTime).toBe(11.2);
    expect(line.words[2].endTime).toBe(18.0); // line.endTime (10.0 + 8.0)
  });
});
