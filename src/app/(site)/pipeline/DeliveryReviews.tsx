import { createLocalReq, type Payload } from 'payload'
import type { User } from '../../../payload-types'
import { reviewArtifact } from '../../../sdlc/artifact-collections'
import ArtifactDecisionForm from './ArtifactDecisionForm'
import { recordDeliveryFeedback, reviseDeliveryFeedback } from './actions'
import SubmitButton from './SubmitButton'

export default async function DeliveryReviews({ payload, user, projectKey }: { payload: Payload; user: User; projectKey: string }) {
  const artifacts = await payload.find({ collection: 'sdlc-delivery-artifacts', user, overrideAccess: false,
    where: { projectKey: { equals: projectKey } }, sort: '-id', limit: 20, depth: 0 })
  const req = await createLocalReq({ user }, payload)
  return <section className="delivery-panel runs-panel"><span className="eyebrow">06 / REVIEW THE DELIVERED CHANGE</span>
    <h2>Code, showcase & outcome</h2><p>Review the exact source and independent checks, then record code security, sprint outcome and MVP decisions separately.</p>
    {!artifacts.docs.length && <div className="delivery-empty"><h3>No verified delivery yet</h3><p>The first real AI patch and its independent check evidence will appear here. Human artifact review opens when that evidence is available.</p></div>}
    <p className="muted">Latest 20 of {artifacts.totalDocs} retained artifacts. Acceptance applies to one artifact and story version.</p>
    {await Promise.all(artifacts.docs.map(async row => {
      const story = await payload.findByID({ collection: 'sdlc-stories', id: typeof row.story === 'number' ? row.story : row.story.id, user, overrideAccess: false, depth: 0 })
      let verified
      try { verified = await reviewArtifact(req, story, row.artifactHash) } catch { /* Unavailable or stale evidence never enables review. */ }
      if (!verified) return <article className="run-card" key={row.id}><h3>{story.storyKey} · v{story.revision}</h3><p className="hash">Artifact {row.artifactHash}</p><p role="status">Review blocked: current independent evidence is unavailable, expired or superseded. Refresh when the verifier service is available.</p></article>
      const { artifact, gates, passed } = verified, claim = artifact.envelope.claim
      const feedback = await payload.find({ collection: 'sdlc-delivery-feedback', user, overrideAccess: false, depth: 0,
        where: { and: [{ story: { equals: story.id } }, { artifactHash: { equals: row.artifactHash } }] }, sort: '-id', limit: 20 })
      const contract = story.contract as { acceptanceCriteria: string[]; checkPolicyHash: string }
      return <article className="run-card" key={row.id}>
        <div className="run-heading"><h3>{story.storyKey} · v{story.revision}</h3><span className="pill">{passed ? 'Checks passed · human review pending' : `Checks ${claim.verdict}`}</span></div>
        <p>{claim.criteriaPassed}/{claim.criteriaTotal} criteria passed · Attempt {claim.attempt}/3 · Native Codex candidate</p>
        <ol>{contract.acceptanceCriteria.map((criterion, i) => <li key={i}>{criterion}</li>)}</ol>
        <details><summary>Exact source changes</summary>{artifact.candidate.files.map((file, index) => <div key={file.path}>
          <h4>{file.path}</h4><p>{file.sha256 === artifact.source.files[index].sha256 ? 'Unchanged' : 'Changed'}</p>
          <details><summary>Before</summary><pre>{Buffer.from(artifact.source.files[index].content, 'base64').toString('utf8')}</pre></details>
          <details><summary>Candidate</summary><pre>{Buffer.from(file.content, 'base64').toString('utf8')}</pre></details>
        </div>)}</details>
        <details><summary>Source, runtime & independent check evidence</summary><p className="hash">Artifact {row.artifactHash}</p><pre>{JSON.stringify(claim, null, 2)}</pre></details>
        {(['code-security', 'outcome', 'mvp'] as const).map(kind => {
          const decision = gates.find(g => g.kind === kind && g.artifactHash === row.artifactHash)
          const prerequisite = kind === 'mvp' ? ['code-security', 'outcome'] : kind === 'outcome' ? ['code-security'] : []
          const ready = passed && prerequisite.every(k => gates.some(g => g.kind === k && g.artifactHash === row.artifactHash && g.decision === 'accept'))
          return decision ? <div className="review-record" key={kind}><b>{kind}: {decision.decision}</b><p>{decision.notes}</p><small>Human actor #{typeof decision.actor === 'number' ? decision.actor : decision.actor.id} · {decision.createdAt}</small></div>
            : ready ? <ArtifactDecisionForm key={kind} kind={kind} story={story.id} scopeHash={story.scopeHash} artifactHash={row.artifactHash}/>
              : <p key={kind} className="muted">{kind}: waiting for {passed ? 'earlier artifact reviews' : 'passing independent checks'}.</p>
        })}
        <form action={recordDeliveryFeedback} className="review-form"><input type="hidden" name="story" value={story.id}/><input type="hidden" name="artifactHash" value={row.artifactHash}/>
          <label>Showcase feedback or finding<textarea name="content" required maxLength={4000} rows={3}/></label><SubmitButton>Record artifact feedback</SubmitButton></form>
        {feedback.docs.map(item => <div className="review-record" key={item.id}><h4>Feedback #{item.id}</h4><p>{item.content}</p>
          <form action={reviseDeliveryFeedback} className="review-form"><input type="hidden" name="feedback" value={item.id}/>
            <label>Revised story title<input name="title" required maxLength={200} defaultValue={story.title}/></label>
            <label>Acceptance criteria, one per line<textarea name="acceptanceCriteria" required maxLength={12000} rows={5} defaultValue={contract.acceptanceCriteria.join('\n')}/></label>
            <label>Reviewed check policy SHA-256<input name="checkPolicyHash" required pattern="[a-f0-9]{64}" defaultValue={contract.checkPolicyHash}/></label>
            <SubmitButton>Prepare a new story version</SubmitButton><p className="muted">The new version requires sprint and design approval. Existing decisions stay with this version.</p>
          </form></div>)}
      </article>
    }))}
  </section>
}
