'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { role } from '../../../security'
import { digest, intakeKinds } from '../../../sdlc/contracts'
import { activeProject } from '../../../sdlc/project'
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
