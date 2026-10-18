// Trusted runner, mounted read-only inside a disposable container. Node vm is an
// extra language boundary, not the OS security boundary; the container is required.
import { readFileSync } from 'node:fs'
import { createContext, runInContext, SourceTextModule } from 'node:vm'
import { types, isDeepStrictEqual } from 'node:util'

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
  if (Array.isArray(value)) result.length = descriptors.length.value
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue
    const descriptor = descriptors[key]
    if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('Non-data property.')
    Object.defineProperty(result, key, { value: data(descriptor.value, depth + 1), enumerable: true })
  }
  return result
}

function references(value, seen = new Map()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return seen
  if (types.isProxy(value)) throw new Error('Proxy input.')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  seen.set(value, { descriptors, prototype: Object.getPrototypeOf(value), extensible: Object.isExtensible(value) })
  for (const descriptor of Object.values(descriptors)) references(descriptor.value, seen)
  return seen
}

function referencesUnchanged(snapshot) {
  for (const [object, saved] of snapshot) {
    const before = saved.descriptors
    if (Object.getPrototypeOf(object) !== saved.prototype || Object.isExtensible(object) !== saved.extensible) return false
    const after = Object.getOwnPropertyDescriptors(object)
    if (!isDeepStrictEqual(Reflect.ownKeys(before), Reflect.ownKeys(after))) return false
    for (const key of Reflect.ownKeys(before)) {
      const a = before[key], b = after[key]
      if (!Object.hasOwn(b, 'value') || !Object.is(a.value, b.value) ||
          a.writable !== b.writable || a.enumerable !== b.enumerable || a.configurable !== b.configurable) return false
    }
  }
  return true
}

const results = []
for (const entry of cases) {
  try {
    const context = createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate' })
    // Create inputs and retain intrinsic identity before candidate top-level code
    // can change JSON.parse, error constructors, or array prototype methods.
    const originalArray = runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(entry.tasks))})`, context, { timeout: 100 })
    const status = runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(entry.status))})`, context, { timeout: 100 })
    const typeErrorPrototype = runInContext('TypeError.prototype', context, { timeout: 100 })
    const originalItems = Array.from({ length: originalArray.length }, (_, index) =>
      Object.getOwnPropertyDescriptor(originalArray, String(index)).value)
    const before = data(originalArray)
    const originalReferences = references(originalArray)
    Object.defineProperties(context, {
      __tasks: { value: originalArray },
      __status: { value: status },
    })
    const module = new SourceTextModule(source, { context })
    await module.link(() => { throw new Error('Imports disabled.') })
    await module.evaluate({ timeout: 100 })
    if (typeof module.namespace.filterTasks !== 'function') throw new Error('Missing named function.')
    Object.defineProperty(context, '__fn', { value: module.namespace.filterTasks })
    // Only realm-owned data enters the candidate; no host functions/objects.
    let thrown = false, typeError = false
    let result
    try {
      result = runInContext('__fn(__tasks, __status)', context, { timeout: 100 })
    } catch (error) {
      thrown = true
      if (types.isNativeError(error)) {
        let prototype = Object.getPrototypeOf(error)
        for (let depth = 0; prototype && depth < 20; depth++) {
          if (types.isProxy(prototype)) break
          if (prototype === typeErrorPrototype) { typeError = true; break }
          prototype = Object.getPrototypeOf(prototype)
        }
      }
    }
    const after = data(originalArray)
    const isArray = Array.isArray(result) && !types.isProxy(result)
    const cleanResult = !thrown && isArray ? data(result) : null
    results.push({ id: entry.id, thrown, typeError, inputUnchanged: isDeepStrictEqual(before, after) && referencesUnchanged(originalReferences),
      result: cleanResult, indexes: !thrown && isArray ? Array.from({ length: cleanResult.length }, (_, index) =>
        originalItems.indexOf(Object.getOwnPropertyDescriptor(result, String(index))?.value)) : null,
      newArray: !thrown && isArray && result !== originalArray })
  } catch {
    results.push({ id: entry.id, rejected: true })
  }
}
process.stdout.write(JSON.stringify(results))
