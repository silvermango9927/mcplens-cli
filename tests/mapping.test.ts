import { describe, expect, it } from 'vitest'
import { applyResponseMap, getPath, transforms } from '../src/mapping/runtime.js'

describe('getPath', () => {
  const obj = { a: { b: [{ c: 1 }, { c: 2 }] }, s: 'x' }
  it('resolves dot paths', () => expect(getPath(obj, 's')).toBe('x'))
  it('maps over arrays with []', () => expect(getPath(obj, 'a.b[].c')).toEqual([1, 2]))
  it('returns undefined for missing paths', () => expect(getPath(obj, 'a.z.c')).toBeUndefined())
  it('returns undefined for [] on non-arrays', () => expect(getPath(obj, 's[].c')).toBeUndefined())
})

describe('transforms', () => {
  it('stripHtml', () => expect(transforms.stripHtml('<p>hi <b>there</b></p>')).toBe('hi there'))
  it('adfToPlainText walks content nodes', () => {
    const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }, { type: 'text', text: ' world' }] }] }
    expect(transforms.adfToPlainText(adf)).toBe('hello world')
  })
  it('count', () => expect(transforms.count([1, 2, 3])).toBe(3))
  it('firstLine', () => expect(transforms.firstLine('a\nb')).toBe('a'))
})

describe('applyResponseMap', () => {
  it('maps multiple sources, applies transforms element-wise, skips missing payloads', () => {
    const payloads = {
      main: { fields: { status: { name: 'Open' }, descHtml: '<p>x</p>' } },
      comments: { comments: [{ bodyHtml: '<i>a</i>' }, { bodyHtml: 'b' }] }
    }
    const out = applyResponseMap(payloads, [
      { from: 'fields.status.name', to: 'status' },
      { from: 'fields.descHtml', to: 'description', transform: 'stripHtml' },
      { from: 'comments[].bodyHtml', to: 'comments', source: 'comments', transform: 'stripHtml' },
      { from: 'comments[].bodyHtml', to: 'commentCount', source: 'comments', transform: 'count' },
      { from: 'anything', to: 'skipped', source: 'notFetched' }
    ])
    expect(out).toEqual({ status: 'Open', description: 'x', comments: ['a', 'b'], commentCount: 2 })
  })
})
