import { readFile } from 'node:fs/promises'
import path from 'node:path'
export type ProjectContext = { key: string; name: string; version: number; objective: string; constraints: string[] }
export function validateProject(value: unknown): ProjectContext {
  if (!value || typeof value !== 'object') throw new Error('Invalid project configuration.')
  const project = value as ProjectContext
  if (Object.keys(project).sort().join(',') !== 'constraints,key,name,objective,version' || typeof project.key !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(project.key) || typeof project.name !== 'string' || !project.name.trim() || project.name.length > 120 || !Number.isSafeInteger(project.version) || project.version < 1 || typeof project.objective !== 'string' || !project.objective.trim() || project.objective.length > 2000 || !Array.isArray(project.constraints) || project.constraints.length > 20 || project.constraints.some(x => typeof x !== 'string' || !x.trim() || x.length > 1000)) throw new Error('Invalid project configuration.')
  return project
}
export async function activeProject() {
  // Operator-controlled fixed file; intake cannot select arbitrary files or executable commands.
  return validateProject(JSON.parse(await readFile(path.join(process.cwd(), 'projects', 'active.json'), 'utf8')))
}
