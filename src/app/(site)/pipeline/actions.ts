'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { role } from '../../../security'
import { digest, intakeKinds } from '../../../sdlc/contracts'
import { activeProject } from '../../../sdlc/project'
import { queueReservation } from '../../../sdlc/task-coordinator'
import { registerApprovedTask } from '../../../sdlc/approved-task-registration'
async function session() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (role(user) !== 'admin') throw new Error('Administrator sign-in required for delivery control.')
  return { payload, user: user! }
}
const text = (form: FormData, key: string, max: number) => {
  const value = form.get(key)
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${key}.`)
  return value.trim()
}
export async function registerRecordedTask(form: FormData) {
  const { payload, user } = await session()
  await registerApprovedTask(payload, user, text(form, 'scopeHash', 64))
  revalidatePath('/pipeline'); redirect('/pipeline?notice=task-registered')
}
export async function queueStoryReservation(form: FormData) {
  const { payload } = await session()
  const id = Number(text(form, 'story', 20))
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid story.')
  await queueReservation(payload, id)
  revalidatePath('/pipeline'); redirect('/pipeline')
}
export async function reviewStory(form: FormData) {
  const { payload, user } = await session()
  const id = Number(text(form, 'story', 20)), kind = text(form, 'kind', 30), decision = text(form, 'decision', 20)
  if (!Number.isSafeInteger(id) || id < 1 || !['sprint', 'design-security'].includes(kind) || !['accept', 'reject'].includes(decision)) throw new Error('Invalid story review.')
  await payload.create({ collection: 'sdlc-gates', user, overrideAccess: false, depth: 0, data: {
    story: id, kind: kind as 'sprint' | 'design-security', decision: decision as 'accept' | 'reject',
    scopeHash: text(form, 'scopeHash', 64), notes: text(form, 'notes', 4000), actor: user.id, projectKey: '', decisionKey: '',
  } })
  revalidatePath('/pipeline'); redirect('/pipeline')
}
export async function reviewDeliveryArtifact(_previous: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  try {
    const { payload, user } = await session()
    const story = Number(text(form, 'story', 20)), kind = text(form, 'kind', 30), decision = text(form, 'decision', 20)
    if (!Number.isSafeInteger(story) || story < 1 || !['code-security', 'outcome', 'mvp'].includes(kind) || !['accept', 'reject'].includes(decision)) throw new Error('Invalid artifact review.')
    await payload.create({ collection: 'sdlc-gates', user, overrideAccess: false, data: {
      story, scopeHash: text(form, 'scopeHash', 64), artifactHash: text(form, 'artifactHash', 64),
      kind: kind as 'code-security' | 'outcome' | 'mvp', decision: decision as 'accept' | 'reject', notes: text(form, 'notes', 4000),
      actor: user.id, projectKey: '', decisionKey: '',
    } })
    revalidatePath('/pipeline')
    return { success: 'Your decision was recorded for this exact artifact.' }
  } catch { return { error: 'Decision was not recorded. Refresh the evidence and check earlier reviews. Your notes are preserved.' } }
}

export async function recordDeliveryFeedback(form: FormData) {
  const { payload, user } = await session()
  const story = Number(text(form, 'story', 20))
  if (!Number.isSafeInteger(story) || story < 1) throw new Error('Invalid story.')
  await payload.create({ collection: 'sdlc-delivery-feedback', user, overrideAccess: false, data: {
    story, artifactHash: text(form, 'artifactHash', 64), content: text(form, 'content', 4000),
    actor: user.id, projectKey: '', scopeHash: '', feedbackHash: '',
  } })
  revalidatePath('/pipeline'); redirect('/pipeline?notice=delivery-feedback')
}

export async function reviseDeliveryFeedback(form: FormData) {
  const { payload, user } = await session()
  const id = Number(text(form, 'feedback', 20))
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid feedback.')
  const feedback = await payload.findByID({ collection: 'sdlc-delivery-feedback', id, user, overrideAccess: false, depth: 0 })
  const story = await payload.findByID({ collection: 'sdlc-stories', id: typeof feedback.story === 'number' ? feedback.story : feedback.story.id, user, overrideAccess: false, depth: 0 })
  const project = await activeProject()
  if (story.projectKey !== project.key || story.contextHash !== digest(project)) throw new Error('Feedback project is stale.')
  const old = story.contract as Record<string, unknown>
  const acceptanceCriteria = text(form, 'acceptanceCriteria', 12000).split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  await payload.create({ collection: 'sdlc-stories', user, overrideAccess: false, data: {
    projectKey: project.key, contextHash: digest(project), storyKey: story.storyKey, title: text(form, 'title', 200),
    contract: { ...old, acceptanceCriteria, checkPolicyHash: text(form, 'checkPolicyHash', 64) }, supersedes: story.id, feedback: feedback.id,
    revision: 0, scopeHash: '', versionKey: '', actor: user.id,
  } })
  revalidatePath('/pipeline'); redirect('/pipeline?notice=delivery-revised')
}
export async function submitIntake(form: FormData) {
  const { payload, user } = await session()
  const project = await activeProject()
  const kind = text(form, 'kind', 20) as typeof intakeKinds[number]
  if (!intakeKinds.includes(kind)) throw new Error('Invalid intake type.')
  if (text(form, 'projectKey', 64) !== project.key || text(form, 'contextHash', 64) !== digest(project)) throw new Error('Project context changed. Reload before submitting.')
  const data = { projectKey: project.key, contextHash: digest(project), submissionKey: text(form, 'submissionKey', 100), title: text(form, 'title', 200), content: text(form, 'content', 12000), target: text(form, 'target', 120), origin: text(form, 'origin', 200), kind }
  const prior = await payload.find({ collection: 'sdlc-intake', where: { submissionKey: { equals: data.submissionKey } }, user, overrideAccess: false, limit: 1 })
  if (prior.docs.length) {
    const old = prior.docs[0]
    if (['projectKey', 'contextHash', 'title', 'content', 'target', 'origin', 'kind'].some(k => old[k as keyof typeof old] !== data[k as keyof typeof data])) throw new Error('Submission key reused with changed content.')
  } else await payload.create({ collection: 'sdlc-intake', data: { ...data, actor: user.id, sourceHash: '' }, user, overrideAccess: false })
  revalidatePath('/pipeline'); redirect('/pipeline?notice=submitted')
}
export async function queueTriage(form: FormData) {
  const { payload, user } = await session()
  const project = await activeProject()
  if (text(form, 'contextHash', 64) !== digest(project)) throw new Error('Project context changed. Reload before queueing.')
  const intake = await payload.find({ collection: 'sdlc-intake', where: { projectKey: { equals: project.key } }, user, overrideAccess: false, limit: 100, sort: 'id', depth: 0 })
  if (!intake.docs.length || intake.totalDocs > 100) throw new Error('Select a bounded intake batch: 1–100 records supported in this increment.')
  const snapshot = intake.docs.map(({ id, title, content, kind, target, sourceHash, supersedes, projectKey, contextHash }) => ({ id, title, content, kind, target, sourceHash, supersedes, projectKey, contextHash }))
  const taskKey = digest({ project, records: snapshot })
  const prior = await payload.find({ collection: 'sdlc-runs', where: { taskKey: { equals: taskKey } }, user, overrideAccess: false, limit: 1 })
  if (!prior.docs.length) await payload.create({ collection: 'sdlc-runs', data: { taskKey, snapshot, status: 'queued', projectKey: project.key, projectContext: project, contextHash: digest(project) }, overrideAccess: true })
  revalidatePath('/pipeline'); redirect('/pipeline?notice=queued')
}
export async function reviewTriage(form: FormData) {
  const { payload, user } = await session()
  const id = Number(text(form, 'run', 20))
  const decision = text(form, 'decision', 30)
  if (!Number.isSafeInteger(id) || !['accept-triage', 'return-findings'].includes(decision)) throw new Error('Invalid decision.')
  await payload.create({ collection: 'sdlc-decisions', user, overrideAccess: false, data: {
    run: id, scopeHash: text(form, 'scopeHash', 64), decision: decision as 'accept-triage' | 'return-findings', notes: text(form, 'notes', 4000), actor: user.id, decisionKey: '',
  } })
  revalidatePath('/pipeline'); redirect('/pipeline?notice=reviewed')
}
