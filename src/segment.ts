export type Segment = { start: number; end: number; text: string }

// The part of `current` that is not shared with `baseline` at either end.
export function findSegment(baseline: string, current: string): Segment {
  const max = Math.min(baseline.length, current.length)
  let prefix = 0
  while (prefix < max && baseline[prefix] === current[prefix]) prefix++
  let suffix = 0
  while (suffix < max - prefix && baseline[baseline.length - 1 - suffix] === current[current.length - 1 - suffix]) suffix++
  const end = current.length - suffix
  return { start: prefix, end, text: current.slice(prefix, end) }
}

export function replaceSegment(current: string, seg: Segment, replacement: string): string {
  return current.slice(0, seg.start) + replacement + current.slice(seg.end)
}
