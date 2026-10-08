import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { templateDefinitions } from '../../../sdlc/library'
import Guide from './Guide'
export const dynamic = 'force-static'
export const metadata = { title: 'AI SDLC & Templates | Content Studio' }
export default async function Page() {
  const templates = await Promise.all(templateDefinitions.map(async definition => ({ ...definition,
    content: await readFile(path.join(process.cwd(), 'docs', 'templates', `${definition.id}.md`), 'utf8'),
  })))
  return <Guide templates={templates} />
}
