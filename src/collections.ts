import { APIError, type CollectionConfig } from 'payload'
import { admin, staff, staffAccess, publisher, publisherField, privateField, publicRead, role } from './security'

export const Users: CollectionConfig = {
  slug: 'users', auth: { tokenExpiration: 3600, maxLoginAttempts: 5, lockTime: 600_000 },
  admin: { useAsTitle: 'email' },
  access: {
    create: admin, delete: admin, admin: staffAccess,
    read: ({ req }) => role(req.user) === 'admin' ? true : req.user ? { id: { equals: req.user.id } } : false,
    update: ({ req }) => role(req.user) === 'admin' ? true : req.user ? { id: { equals: req.user.id } } : false,
  },
  hooks: { beforeOperation: [({ args, operation, req, overrideAccess }) => {
    if (!overrideAccess && req.user && role(req.user) !== 'admin' && ['create', 'update', 'updateByID'].includes(operation) && 'data' in args && args.data && 'role' in args.data)
      throw new APIError('Only administrators may set roles.', 403)
  }], beforeValidate: [({ data, originalDoc, req }) => {
    if (req.user && role(req.user) !== 'admin' && data?.role !== undefined && data.role !== originalDoc?.role)
      throw new APIError('Only administrators may change roles.', 403)
    return data
  }] },
  fields: [{ name: 'role', type: 'select', required: true, defaultValue: 'editor',
    options: ['editor', 'publisher', 'admin'], access: { create: ({ req }) => role(req.user) === 'admin', update: ({ req }) => role(req.user) === 'admin' } }],
}

export const Authors: CollectionConfig = {
  slug: 'authors', admin: { useAsTitle: 'name' },
  access: { read: staffAccess, create: admin, update: admin, delete: admin },
  fields: [{ name: 'name', type: 'text', required: true }, { name: 'sourceKey', type: 'text', unique: true, required: true }],
}

export const Articles: CollectionConfig = {
  slug: 'articles', admin: { useAsTitle: 'title', defaultColumns: ['title', '_status', 'visibility', 'updatedAt'], components: { edit: { PublishButton: '/admin/PublishButton#default' } } },
  versions: { drafts: true, maxPerDoc: 20 },
  access: {
    read: publicRead,
    readVersions: staffAccess,
    create: staffAccess,
    update: ({ req }) => publisher(req.user) ? true : role(req.user) === 'editor' ? { _status: { equals: 'draft' } } : false,
    delete: admin,
  },
  hooks: { beforeValidate: [({ data, req }) => {
    if (req.user && !publisher(req.user) && data?._status === 'published')
      throw new APIError('Only publishers may publish articles.', 403)
    if (typeof data?.body === 'string' && /[<>]/.test(data.body))
      throw new APIError('MVP 1 accepts plain text only; HTML is not supported.', 400)
    return data
  }] },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 200 },
    { name: 'body', type: 'textarea', required: true, maxLength: 50_000 },
    { name: 'visibility', type: 'select', defaultValue: 'private', required: true, options: ['private', 'public'],
      access: { create: publisherField, update: publisherField } },
    { name: 'author', type: 'relationship', relationTo: 'authors', required: true, access: { read: privateField } },
    { name: 'relatedArticles', type: 'relationship', relationTo: 'articles', hasMany: true },
    { name: 'sourceKey', type: 'text', unique: true, access: { read: privateField, create: () => false, update: () => false }, admin: { readOnly: true } },
    { name: 'sourceHash', type: 'text', access: { read: privateField, create: () => false, update: () => false }, admin: { hidden: true } },
    { name: 'importedHash', type: 'text', access: { read: privateField, create: () => false, update: () => false }, admin: { hidden: true } },
  ],
}
