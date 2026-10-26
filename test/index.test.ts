import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutputBundle, NormalizedOutputOptions } from 'rollup'

const { writeFileMock } = vi.hoisted(() => ({
  writeFileMock: vi.fn(
    (_path: string, _data: string, cb: (err: Error | null) => void) => cb(null)
  )
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, writeFile: writeFileMock }
})

import { sitemapPlugin } from '../src/index'

type PluginOptions = Parameters<typeof sitemapPlugin>[0]
type RouteList = NonNullable<PluginOptions['routes']>

const createContext = () => ({
  debug: vi.fn(),
  error: vi.fn((err: { message: string }): never => {
    throw new Error(err.message)
  })
})

const runPlugin = async (
  options: PluginOptions,
  {
    outputOptions = { dir: 'dist' },
    bundle = {},
    context = createContext()
  }: {
    outputOptions?: Partial<NormalizedOutputOptions>
    bundle?: Record<string, unknown>
    context?: ReturnType<typeof createContext>
  } = {}
) => {
  const hook = sitemapPlugin(options).writeBundle as unknown as (
    this: unknown,
    outputOptions: NormalizedOutputOptions,
    bundle: OutputBundle
  ) => Promise<void>
  await hook.call(
    context,
    outputOptions as NormalizedOutputOptions,
    bundle as OutputBundle
  )
  return context
}

const writtenXml = () => writeFileMock.mock.calls.at(-1)?.[1] as string
const writtenPath = () => writeFileMock.mock.calls.at(-1)?.[0] as string
const locs = (xml: string) =>
  [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])

type TestRoute = { path: string; children?: TestRoute[] }
const routes = (list: TestRoute[]) => list as unknown as RouteList

beforeEach(() => {
  writeFileMock.mockClear()
})

describe('sitemapPlugin', () => {
  it('exposes the expected plugin metadata', () => {
    const plugin = sitemapPlugin({})
    expect(plugin.name).toBe('vite-plugin-sitemap-router')
    expect(plugin.apply).toBe('build')
    expect(typeof plugin.writeBundle).toBe('function')
  })

  it('writes a sitemap for the provided routes', async () => {
    await runPlugin({
      appUrl: 'https://example.com',
      routes: routes([{ path: '/' }, { path: '/about' }])
    })

    expect(writeFileMock).toHaveBeenCalledOnce()
    const xml = writtenXml()
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
    )
    expect(xml.trim().endsWith('</urlset>')).toBe(true)
    expect(locs(xml)).toEqual([
      'https://example.com',
      'https://example.com/about'
    ])
  })

  it('defaults appUrl to http://localhost', async () => {
    await runPlugin({ routes: routes([{ path: '/home' }]) })
    expect(locs(writtenXml())).toEqual(['http://localhost/home'])
  })

  it('writes to <outDir>/sitemap.xml by default', async () => {
    await runPlugin(
      { routes: routes([{ path: '/' }]) },
      { outputOptions: { dir: 'build/out' } }
    )
    expect(writtenPath()).toBe('build/out/sitemap.xml')
  })

  it('falls back to dist/ when no output dir is set', async () => {
    await runPlugin({ routes: routes([{ path: '/' }]) }, { outputOptions: {} })
    expect(writtenPath()).toBe('dist/sitemap.xml')
  })

  it('respects a custom outfile', async () => {
    await runPlugin({
      routes: routes([{ path: '/' }]),
      outfile: 'public/custom-sitemap.xml'
    })
    expect(writtenPath()).toBe('public/custom-sitemap.xml')
  })

  it('includes nested child routes', async () => {
    await runPlugin({
      appUrl: 'https://example.com',
      routes: routes([
        {
          path: '/docs',
          children: [
            { path: 'intro' },
            { path: 'guide', children: [{ path: 'advanced' }] }
          ]
        }
      ])
    })

    expect(locs(writtenXml())).toEqual([
      'https://example.com/docs',
      'https://example.com/docs/guide',
      'https://example.com/docs/guide/advanced',
      'https://example.com/docs/intro'
    ])
  })

  it('skips empty child paths', async () => {
    await runPlugin({
      appUrl: 'https://example.com',
      routes: routes([
        { path: '/blog', children: [{ path: '' }, { path: 'post' }] }
      ])
    })

    expect(locs(writtenXml())).toEqual([
      'https://example.com/blog',
      'https://example.com/blog/post'
    ])
  })

  it('excludes catch-all routes', async () => {
    await runPlugin({
      appUrl: 'https://example.com',
      routes: routes([{ path: '/' }, { path: '*' }, { path: '/:catchAll(.*)' }])
    })

    expect(locs(writtenXml())).toEqual(['https://example.com'])
  })

  it('strips trailing slashes, de-duplicates and sorts routes', async () => {
    await runPlugin({
      appUrl: 'https://example.com',
      routes: routes([
        { path: '/zeta/' },
        { path: '/alpha' },
        { path: '/zeta' },
        { path: '/alpha' }
      ])
    })

    expect(locs(writtenXml())).toEqual([
      'https://example.com/alpha',
      'https://example.com/zeta'
    ])
  })

  it('applies the filter to top-level routes', async () => {
    const filter = vi.fn(
      (route?: { path: string }) => !route?.path.startsWith('/admin')
    )

    await runPlugin({
      appUrl: 'https://example.com',
      filter,
      routes: routes([
        { path: '/' },
        { path: '/admin', children: [{ path: 'users' }] },
        { path: '/contact' }
      ])
    })

    expect(filter).toHaveBeenCalledTimes(3)
    expect(locs(writtenXml())).toEqual([
      'https://example.com',
      'https://example.com/contact'
    ])
  })

  it('reports an error when writing the sitemap fails', async () => {
    writeFileMock.mockImplementationOnce((_path, _data, cb) =>
      cb(new Error('disk full'))
    )
    const context = createContext()
    context.error.mockImplementation(() => undefined as never)

    await runPlugin({ routes: routes([{ path: '/' }]) }, { context })

    expect(context.error).toHaveBeenCalledWith({
      message: expect.stringContaining('disk full')
    })
  })

  describe('routerFile', () => {
    const routerFile = 'src/router.ts'
    const routerModuleId = `${process.cwd()}/${routerFile}`
    let outDir: string

    beforeEach(() => {
      outDir = mkdtempSync(join(tmpdir(), 'sitemap-router-'))
    })

    afterEach(() => {
      rmSync(outDir, { recursive: true, force: true })
    })

    const writeChunk = (fileName: string, source: string) =>
      writeFileSync(join(outDir, fileName), source)

    it('loads routes from the router exported by the built chunk', async () => {
      writeChunk(
        'router-abc123.mjs',
        `export const router = {
          install() {},
          getRoutes() {
            return [{ path: '/' }, { path: '/from-router' }]
          }
        }`
      )

      const context = await runPlugin(
        { appUrl: 'https://example.com', routerFile },
        {
          outputOptions: { dir: outDir },
          bundle: {
            'style.css': { type: 'asset' },
            'router-abc123.mjs': {
              type: 'chunk',
              modules: { [routerModuleId]: {} }
            }
          }
        }
      )

      expect(context.error).not.toHaveBeenCalled()
      expect(locs(writtenXml())).toEqual([
        'https://example.com',
        'https://example.com/from-router'
      ])
    })

    it('accepts an absolute router file path', async () => {
      writeChunk(
        'router.mjs',
        `export default { install() {}, getRoutes: () => [{ path: '/abs' }] }`
      )

      await runPlugin(
        { appUrl: 'https://example.com', routerFile: routerModuleId },
        {
          outputOptions: { dir: outDir },
          bundle: {
            'router.mjs': { type: 'chunk', modules: { [routerModuleId]: {} } }
          }
        }
      )

      expect(locs(writtenXml())).toEqual(['https://example.com/abs'])
    })

    it('prefers explicit routes over the router file', async () => {
      await runPlugin(
        {
          appUrl: 'https://example.com',
          routerFile,
          routes: routes([{ path: '/explicit' }])
        },
        { outputOptions: { dir: outDir } }
      )

      expect(locs(writtenXml())).toEqual(['https://example.com/explicit'])
    })

    it('errors when the router file is not found in the bundle', async () => {
      await expect(
        runPlugin({ routerFile }, { outputOptions: { dir: outDir } })
      ).rejects.toThrow(/No data found in router file/)

      expect(writeFileMock).not.toHaveBeenCalled()
    })

    it('errors when the chunk does not export a router', async () => {
      writeChunk('router.mjs', 'export const notARouter = { foo: 1 }')

      await expect(
        runPlugin(
          { routerFile },
          {
            outputOptions: { dir: outDir },
            bundle: {
              'router.mjs': { type: 'chunk', modules: { [routerModuleId]: {} } }
            }
          }
        )
      ).rejects.toThrow(/No data found in router file/)
    })
  })
})
