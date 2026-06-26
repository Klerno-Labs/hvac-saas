import { vi, describe, it, expect } from 'vitest'
vi.mock('server-only', () => ({}))

import { classifyInboundKeyword, isOptOutKeyword } from '@/lib/sms/opt-out'

describe('classifyInboundKeyword — STOP synonyms', () => {
  it.each([
    ['STOP'],
    ['STOPALL'],
    ['UNSUBSCRIBE'],
    ['CANCEL'],
    ['END'],
    ['QUIT'],
  ])('classifies "%s" as stop', (input) => {
    expect(classifyInboundKeyword(input)).toBe('stop')
  })

  it.each([
    ['stop'],
    ['Stop'],
    ['  STOP  '],
    ['STOP.'],
    ['STOP!'],
    ['\tSTOP\t'],
    ['...STOP...'],
  ])('normalizes "%s" to stop', (input) => {
    expect(classifyInboundKeyword(input)).toBe('stop')
  })
})

describe('classifyInboundKeyword — START synonyms', () => {
  it.each([
    ['START'],
    ['YES'],
    ['UNSTOP'],
  ])('classifies "%s" as start', (input) => {
    expect(classifyInboundKeyword(input)).toBe('start')
  })

  it.each([
    ['start'],
    ['yes'],
    ['  YES  '],
    ['YES!'],
  ])('normalizes "%s" to start', (input) => {
    expect(classifyInboundKeyword(input)).toBe('start')
  })
})

describe('classifyInboundKeyword — HELP synonyms', () => {
  it.each([
    ['HELP'],
    ['INFO'],
  ])('classifies "%s" as help', (input) => {
    expect(classifyInboundKeyword(input)).toBe('help')
  })

  it.each([
    ['help'],
    ['info'],
    ['HELP?'],
    ['  INFO  '],
  ])('normalizes "%s" to help', (input) => {
    expect(classifyInboundKeyword(input)).toBe('help')
  })
})

describe('classifyInboundKeyword — none', () => {
  it.each([
    ['Hello how are you'],
    ['Please call me back'],
    ['Is anyone there?'],
    [''],
    ['OK sounds good'],
    ['STOPPING by'],
  ])('classifies "%s" as none', (input) => {
    expect(classifyInboundKeyword(input)).toBe('none')
  })
})

describe('isOptOutKeyword', () => {
  it('returns true for every STOP synonym', () => {
    for (const kw of ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']) {
      expect(isOptOutKeyword(kw)).toBe(true)
    }
  })

  it('returns false for START, HELP, and arbitrary messages', () => {
    for (const kw of ['START', 'YES', 'UNSTOP', 'HELP', 'INFO', 'hello', '']) {
      expect(isOptOutKeyword(kw)).toBe(false)
    }
  })
})
