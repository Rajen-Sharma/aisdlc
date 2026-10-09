import { APIError, type CollectionConfig } from 'payload'
import { admin } from '../security'
const coordinatorOnly = { read: admin, create: () => false, update: () => false, delete: () => false }
export const Tasks: CollectionConfig = {
  slug: 'sdlc-tasks', admin: { group: 'AI delivery', useAsTitle: 'taskKey' }, access: coordinatorOnly,
  fields: [
    { name: 'taskKey', type: 'text', unique: true, required: true },
    { name: 'story', type: 'relationship', relationTo: 'sdlc-stories', required: true },
    { name: 'projectKey', type: 'text', required: true }, { name: 'scopeHash', type: 'text', required: true },
    { name: 'status', type: 'select', required: true, options: ['queued', 'reserved', 'uncertain', 'awaiting-verification', 'exhausted'] },
    { name: 'owner', type: 'text' }, { name: 'fence', type: 'number', required: true, defaultValue: 0 },
    { name: 'attemptCount', type: 'number', required: true, defaultValue: 0 },
    { name: 'leaseExpiresAt', type: 'date' }, { name: 'deadlineAt', type: 'date' }, { name: 'resultHash', type: 'text' },
  ],
}
export const TaskEvents: CollectionConfig = {
  slug: 'sdlc-task-events', admin: { group: 'AI delivery', useAsTitle: 'eventKey' }, access: coordinatorOnly,
  fields: [
    { name: 'eventKey', type: 'text', unique: true, required: true },
    { name: 'task', type: 'relationship', relationTo: 'sdlc-tasks', required: true },
    { name: 'attempt', type: 'number', required: true }, { name: 'fence', type: 'number', required: true },
    { name: 'owner', type: 'text' },
    { name: 'kind', type: 'select', required: true, options: ['queued', 'claimed', 'heartbeat', 'uncertain', 'candidate', 'recovered', 'artifacts-bound'] },
    { name: 'evidenceHash', type: 'text' }, { name: 'actor', type: 'relationship', relationTo: 'users' },
  ],
}
export const TaskBindings: CollectionConfig = {
  slug: 'sdlc-task-bindings', admin: { group: 'AI delivery', useAsTitle: 'bindingHash' }, access: coordinatorOnly,
  // Even Local API overrideAccess cannot impersonate the SQL coordinator writer.
  hooks: {
    beforeChange: [() => { throw new APIError('Task bindings require the internal coordinator.', 403) }],
    beforeDelete: [() => { throw new APIError('Task bindings are immutable.', 403) }],
  },
  fields: [
    { name: 'task', type: 'relationship', relationTo: 'sdlc-tasks', required: true },
    { name: 'bindingKey', type: 'text', unique: true, required: true },
    { name: 'bindingHash', type: 'text', unique: true, required: true },
    { name: 'recoveryKey', type: 'text', unique: true, required: true },
    { name: 'record', type: 'json', required: true },
  ],
}
