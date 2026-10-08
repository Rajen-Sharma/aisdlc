import Link from 'next/link'
import type { User } from '../../../payload-types'
import { storyReadiness } from '../../../sdlc/eligibility'
import { reviewStory, queueStoryReservation } from './actions'
import SubmitButton from './SubmitButton'

export default async function StoryReviews({ payload, user, projectKey }: { payload: import('payload').Payload; user: User; projectKey: string }) {
  const stories = await payload.find({ collection: 'sdlc-stories', user, overrideAccess: false, where: { projectKey: { equals: projectKey } }, sort: '-id', limit: 20, depth: 0 })
  return <section className="delivery-panel runs-panel"><span className="eyebrow">04 / APPROVE THE EXACT SCOPE</span><h2>Versioned stories & security gates</h2><p>Review acceptance criteria, permitted files and evidence hashes. Accept sprint scope and design security separately. Changed requirements need a new version and fresh decisions.</p><Link href="/admin/collections/sdlc-stories/create" className="button">Prepare a story version →</Link><p className="muted">Latest 20 of {stories.totalDocs} versions. Coding remains blocked until its worker and verifier are qualified.</p>{await Promise.all(stories.docs.map(async story => {
    const readiness = await storyReadiness(payload, story.id)
    const gates = await payload.find({ collection: 'sdlc-gates', user, overrideAccess: false, where: { story: { equals: story.id } }, limit: 10, depth: 0 })
    return <article className="run-card" key={story.id}><div className="run-heading"><h3>{story.storyKey} · v{story.revision}</h3><span className="pill">{readiness.planningReady ? 'Scope accepted' : 'Review required'}</span></div><h4>{story.title}</h4><details><summary>Acceptance criteria, file scope & evidence hashes</summary><pre>{JSON.stringify(story.contract, null, 2)}</pre><p className="hash">Scope SHA-256 {story.scopeHash}</p></details>{readiness.blockers.length > 0 && <ul>{readiness.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}{['sprint', 'design-security'].map(kind => {
      const decision = gates.docs.find(gate => gate.kind === kind)
      return decision ? <div className="review-record" key={kind}><b>{kind}: {decision.decision}</b><p>{decision.notes}</p><small>Human actor #{String(decision.actor)} · Scope {decision.scopeHash.slice(0, 12)}…</small></div> : !readiness.blockers.includes('Story is superseded.') && <form key={kind} action={reviewStory} className="review-form"><input type="hidden" name="story" value={story.id}/><input type="hidden" name="scopeHash" value={story.scopeHash}/><input type="hidden" name="kind" value={kind}/><label>{kind === 'sprint' ? 'Sprint scope review' : 'Design security review'}<textarea name="notes" required maxLength={4000} rows={2}/></label><div className="actions"><SubmitButton name="decision" value="accept">Accept {kind === 'sprint' ? 'sprint scope' : 'security design'}</SubmitButton><SubmitButton name="decision" value="reject" secondary>Return for revision</SubmitButton></div></form>
    })}{readiness.planningReady && <form action={queueStoryReservation}><input type="hidden" name="story" value={story.id}/><SubmitButton>Queue reservation only</SubmitButton><p className="muted">Creates a traceable task. It does not start AI coding.</p></form>}<p className="muted">{readiness.executionBlocker}</p></article>
  }))}</section>
}
