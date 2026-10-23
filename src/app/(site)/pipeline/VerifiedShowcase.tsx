'use client'
import { useId, useState } from 'react'
import type { ShowcaseCase } from '../../../sdlc/delivery-showcase'

export default function VerifiedShowcase({ cases }: { cases: ShowcaseCase[] }) {
  const id = useId(), [selected, select] = useState(0), entry = cases[selected]
  if (!entry) return null
  return <div className="review-record"><h4>Recorded behavior showcase</h4>
    <p>Choose an independently checked case to replay its recorded input and result.</p>
    <label htmlFor={id}>Verified case</label><select id={id} value={selected} onChange={event => select(Number(event.target.value))}>
      {cases.map((item, index) => <option key={item.id} value={index}>{item.id} · {item.passed ? 'passed' : 'failed'}</option>)}</select>
    <p role="status">{entry.passed ? 'Case passed.' : 'Case failed or did not complete.'}</p>
    <details open><summary>Input</summary><pre>{JSON.stringify(entry.input, null, 2)}</pre></details>
    <details open><summary>Observed result</summary><pre>{JSON.stringify(entry.observed, null, 2)}</pre></details>
    <details><summary>Expected result</summary><pre>{JSON.stringify(entry.expected, null, 2)}</pre></details>
  </div>
}
