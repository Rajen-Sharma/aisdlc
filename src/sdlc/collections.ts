import { APIError, type CollectionConfig } from 'payload'
import { admin } from '../security'
import { digest, intakeKinds } from './contracts'
const immutable = { read: admin, create: admin, update: () => false, delete: () => false }
export const Intake: CollectionConfig = {
  slug: 'sdlc-intake', admin: { useAsTitle: 'title', group: 'AI delivery' }, access: immutable,
  hooks: { beforeValidate: [({ data, operation, req }) => {
    if (operation !== 'create') return data
    if (!data || !req.user) throw new APIError('Authenticated human intake required.', 403)
    data.sourceHash = digest({ title: data.title, kind: data.kind, content: data.content, target: data.target, origin: data.origin, supersedes: data.supersedes ?? null })
    data.actor = req.user.id
    return data
  }] },
  fields: [
    { name: 'submissionKey', type: 'text', required: true, unique: true, maxLength: 100 },
    { name: 'title', type: 'text', required: true, maxLength: 200 },
    { name: 'kind', type: 'select', required: true, options: [...intakeKinds] },
    { name: 'content', type: 'textarea', required: true, maxLength: 12000 },
    { name: 'target', type: 'text', required: true, maxLength: 120 },
    { name: 'origin', type: 'text', required: true, maxLength: 200 },
    { name: 'supersedes', type: 'relationship', relationTo: 'sdlc-intake' },
    { name: 'sourceHash', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true, admin: { readOnly: true } },
  ],
}
export const Runs: CollectionConfig = {
  slug: 'sdlc-runs', admin: { useAsTitle: 'taskKey', group: 'AI delivery' },
  access: { read: admin, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'taskKey', type: 'text', unique: true, required: true },
    { name: 'status', type: 'select', required: true, options: ['queued', 'running', 'awaiting-review', 'failed'] },
    { name: 'snapshot', type: 'json', required: true },
    { name: 'result', type: 'json' }, { name: 'resultHash', type: 'text' },
    { name: 'failure', type: 'textarea' }, { name: 'elapsedMs', type: 'number' },
    { name: 'toolVersion', type: 'text' }, { name: 'exitCode', type: 'number' },
  ],
}
export const Decisions: CollectionConfig = {
  slug: 'sdlc-decisions', admin: { useAsTitle: 'scopeHash', group: 'AI delivery' }, access: immutable,
  hooks: { beforeValidate: [async ({ data, req, operation }) => {
    if (operation !== 'create') return data
    if (!req.user || !data?.run) throw new APIError('Human decision requires a reviewed run.', 403)
    const run = await req.payload.findByID({ collection: 'sdlc-runs', id: data.run, user: req.user, overrideAccess: false, depth: 0 })
    if (run.status !== 'awaiting-review' || !run.resultHash || data.scopeHash !== run.resultHash) throw new APIError('Decision is stale or run is not reviewable.', 409)
    data.actor = req.user.id
    // Decision identity is derived server-side. Contradictory decisions require a new reviewed run.
    data.decisionKey = `${run.id}:${run.resultHash}`
    return data
  }] },
  fields: [
    { name: 'decisionKey', type: 'text', unique: true, required: true, admin: { readOnly: true } },
    { name: 'run', type: 'relationship', relationTo: 'sdlc-runs', required: true },
    { name: 'scopeHash', type: 'text', required: true },
    { name: 'decision', type: 'select', required: true, options: ['accept-triage', 'return-findings'] },
    { name: 'notes', type: 'textarea', required: true, maxLength: 4000 },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true, admin: { readOnly: true } },
  ],
}
