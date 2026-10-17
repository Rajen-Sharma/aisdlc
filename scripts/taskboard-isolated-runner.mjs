// Trusted runner, mounted read-only inside a disposable container. Node vm is an
// extra language boundary, not the OS security boundary; the container is required.
import { readFileSync } from 'node:fs'
import { createContext, runInContext, SourceTextModule } from 'node:vm'
import { types } from 'node:util'

if (process.platform !== 'linux' || process.env.AISDLC_ISOLATED_RUNNER !== '1') {
  throw new Error('Requires the isolated Linux verifier.')
}
const source = readFileSync('/source/src/filter-tasks.mjs', 'utf8')
const cases = JSON.parse(process.argv[2])
if (Buffer.byteLength(source) > 65536 || !Array.isArray(cases) || cases.length > 32) throw new Error('Bound exceeded.')

// Snapshot data without invoking candidate getters/toJSON or accepting proxies.
function data(value, depth = 0) {
  if (depth > 20) throw new Error('Snapshot depth exceeded.')
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value
  if (typeof value !== 'object' || types.isProxy(value)) throw new Error('Non-data value.')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const result = Array.isArray(value) ? [] : Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue
    const descriptor = descriptors[key]
    if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('Non-data property.')
    Object.defineProperty(result, key, { value: data(descriptor.value, depth + 1), enumerable: true })
  }
  return result
}

const results = []
for (const entry of cases) {
  try {
    const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' })
    const module = new SourceTextModule(source, { context })
    await module.link(() => { throw new Error('Imports disabled.') })
    await module.evaluate({ timeout: 100 })
    if (typeof module.namespace.filterTasks !== 'function') throw new Error('Missing named function.')
    context.__fn = module.namespace.filterTasks
    // Only serialized data enters the candidate realm; no host functions/objects.
    runInContext(`globalThis.__tasks = JSON.parse(${JSON.stringify(JSON.stringify(entry.tasks))});
      globalThis.__status = JSON.parse(${JSON.stringify(JSON.stringify(entry.status))});`, context, { timeout: 100 })
    const originalArray = context.__tasks
    const originalItems = Array.from(originalArray)
    const before = JSON.stringify(data(originalArray))
    let thrown = false, typeError = false
    try {
      runInContext('globalThis.__result = __fn(__tasks, __status)', context, { timeout: 100 })
    } catch (error) {
      thrown = true
      typeError = types.isNativeError(error) && error.name === 'TypeError'
    }
    const after = JSON.stringify(data(originalArray))
    const result = context.__result
    const isArray = Array.isArray(result) && !types.isProxy(result)
    const cleanResult = !thrown && isArray ? data(result) : null
    results.push({ id: entry.id, thrown, typeError, inputUnchanged: before === after,
      result: cleanResult, indexes: !thrown && isArray ? Array.from(result, item => originalItems.indexOf(item)) : null,
      newArray: !thrown && isArray && result !== originalArray })
  } catch {
    results.push({ id: entry.id, rejected: true })
  }
}
process.stdout.write(JSON.stringify(results))
