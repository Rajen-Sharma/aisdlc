'use client'
import { useActionState, useState } from 'react'
import { reviewDeliveryArtifact } from './actions'
import SubmitButton from './SubmitButton'

export default function ArtifactDecisionForm({ story, scopeHash, artifactHash, kind }: {
  story: number; scopeHash: string; artifactHash: string; kind: 'code-security' | 'outcome' | 'mvp'
}) {
  const [state, action] = useActionState(reviewDeliveryArtifact, {})
  const [notes, setNotes] = useState('')
  const label = { 'code-security': 'Code security', outcome: 'Sprint outcome', mvp: 'MVP outcome' }[kind]
  return <form action={action} className="review-form">
    <input type="hidden" name="story" value={story}/><input type="hidden" name="scopeHash" value={scopeHash}/>
    <input type="hidden" name="artifactHash" value={artifactHash}/><input type="hidden" name="kind" value={kind}/>
    <label>{label} review notes<textarea name="notes" required maxLength={4000} rows={3} value={notes} onChange={event => setNotes(event.target.value)}/></label>
    {state.error && <p role="alert" className="failure">{state.error}</p>}
    {state.success ? <p role="status">{state.success}</p> : <div className="actions">
      <SubmitButton name="decision" value="accept">Accept {label.toLowerCase()}</SubmitButton>
      <SubmitButton name="decision" value="reject" secondary>Return findings</SubmitButton>
    </div>}
  </form>
}
