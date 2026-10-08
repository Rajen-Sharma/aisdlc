import type { Access, FieldAccess, PayloadRequest, Where } from 'payload'
export function role(user: unknown): string {
  return user && typeof user === 'object' && 'role' in user ? String(user.role) : ''
}
export const staff = (user: unknown) => ['editor', 'publisher', 'admin'].includes(role(user))
export const publisher = (user: unknown) => ['publisher', 'admin'].includes(role(user))
export const admin: Access = ({ req }) => role(req.user) === 'admin'
export const staffAccess = ({ req }: { req: PayloadRequest }): boolean => staff(req.user)
export const publisherField: FieldAccess = ({ req }) => publisher(req.user)
export const privateField: FieldAccess = ({ req }) => staff(req.user)
export function publicRead({ req }: { req: PayloadRequest }): boolean | Where {
  if (staff(req.user)) return true
  return { and: [{ _status: { equals: 'published' } }, { visibility: { equals: 'public' } }] }
}
