import type { PublishButtonServerProps } from 'payload'
import { PublishButton as DefaultPublishButton } from '@payloadcms/ui'
import { publisher } from '../security'
export default function PublishButton({ user }: PublishButtonServerProps) {
  return publisher(user) ? <DefaultPublishButton /> : null
}
