import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'
import { activeCueIndex, parseTranscript } from './transcript'
import { parseYouTubeId } from './youtube'

describe('parseTranscript', () => {
  it('reads "time text" lines', () => {
    expect(parseTranscript('0:00 Welcome\n1:05 - Vectors\n1:02:03 Late')).toEqual([
      { start: 0, text: 'Welcome' },
      { start: 65, text: 'Vectors' },
      { start: 3723, text: 'Late' },
    ])
  })

  it('reads YouTube copy format (time line, then text)', () => {
    expect(parseTranscript('0:00\nhello there\n0:04\nsecond line\ncontinues')).toEqual([
      { start: 0, text: 'hello there' },
      { start: 4, text: 'second line continues' },
    ])
  })

  it('reads WebVTT cues', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nFirst\n\n2\n00:01:10.500 --> 00:01:12.000\nSecond'
    expect(parseTranscript(vtt)).toEqual([
      { start: 1, text: 'First' },
      { start: 70, text: 'Second' },
    ])
  })

  it('finds the active cue', () => {
    const cues = parseTranscript('0:00 a\n0:10 b\n0:20 c')
    expect(activeCueIndex(cues, 0)).toBe(0)
    expect(activeCueIndex(cues, 15)).toBe(1)
    expect(activeCueIndex(cues, 99)).toBe(2)
  })
})

describe('parseYouTubeId', () => {
  it.each([
    ['fNk_zzaMoSs', 'fNk_zzaMoSs'],
    ['https://www.youtube.com/watch?v=fNk_zzaMoSs&t=4s', 'fNk_zzaMoSs'],
    ['https://youtu.be/fNk_zzaMoSs?si=abc', 'fNk_zzaMoSs'],
    ['youtube.com/embed/fNk_zzaMoSs', 'fNk_zzaMoSs'],
    ['https://www.youtube.com/shorts/fNk_zzaMoSs', 'fNk_zzaMoSs'],
    ['https://example.com/watch?v=fNk_zzaMoSs', null],
    ['not a video', null],
  ])('%s', (input, expected) => {
    expect(parseYouTubeId(input)).toBe(expected)
  })
})

describe('toCsv', () => {
  it('quotes and neutralises spreadsheet formulas', () => {
    expect(toCsv([['name', 'note'], ['=HYPERLINK("x")', 'a,b'], ['Ann "A"', null]])).toBe(
      'name,note\r\n"\'=HYPERLINK(""x"")","a,b"\r\n"Ann ""A""",\r\n',
    )
  })
})
