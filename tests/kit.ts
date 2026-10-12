import { test as base, expect } from 'claude-code/testing'

// The tests written before 0.2 drive a polish at each pause and read the band and the
// transcript: they run with polish_on pause and details on, unless a test sets them itself.
const BEFORE_0_2 = { polish_on: 'pause', debug: true }

type Rest = Parameters<typeof base> extends [string, ...infer R] ? R : never

export function test(name: string, ...rest: Rest): void {
  if (rest.length === 1) {
    base(name, { options: BEFORE_0_2 }, rest[0])
    return
  }
  const [opts, body] = rest
  base(name, { ...opts, options: { ...BEFORE_0_2, ...opts.options } }, body)
}

export { expect }
