import { DataStore, Predicates } from '@aws-amplify/datastore'
import { Node, Editor, Element } from 'slate'
import { Page, Block } from '../models'
import { batchAsync } from '../utils/batch'
import keyBy from 'lodash/keyBy'

function wrapResolve<
  T,
  U extends (...args: any[]) => unknown | Promise<unknown>
>(p: Promise<T>, f: (t: T) => U): U {
  const res = ((async (...args) => {
    const t = await p
    const e = await f(t)(...args)
    return e
  }) as unknown) as U
  return res
}

export async function initPage() {
  return await DataStore.save(new Page({ title: '', blocks: [] }))
}

export function pageServices(id: string) {
  const pageResolve = DataStore.query(Page, (p) => p.id('eq', id)).then(
    (res) => {
      let page = res[0]
      if (!page) throw new Error('Page not found')
      return page
    }
  )
  const newBlockMap = new WeakMap<object, Block>()

  const services = {
    pageResolve,
    async serialize(editor: Editor) {
      const visited = new Set()
      const serializableTypes = ['paragraph']
      for (const [node, path] of Node.nodes(editor, {})) {
        if (
          Element.isElement(node) &&
          serializableTypes.indexOf(node.type) !== -1
        ) {
          // if
        }
      }
    },
    update: batchAsync(
      wrapResolve(
        pageResolve,
        (page: Page) => async (
          ...updaters: Parameters<typeof Page.copyOf>[1][]
        ) => {
          const saved = await DataStore.save(
            Page.copyOf(page, (p) => updaters.forEach((u) => u(p)))
          )
          return saved
        }
      ),
      400
    ),
    createBlockInstances: wrapResolve(
      pageResolve,
      (page: Page) => (
        blocks: { id: string; fromNode: Node; content: string }[]
      ) => {
        const map = keyBy(page.blocks, 'id')

        // return blocks.map((b) => {
        //   const content = b.content || ''
        //   if (b.id != null && map[b.id] != null) {
        //     return Block.copyOf(map[b.id], (block) => {
        //       block.content = content
        //     })
        //   }
        //   const newBlock = new Block({ content: content, page })
        //   newBlockMap.set(b.fromNode, newBlock)
        //   return newBlock
        // })
      }
    ),
    resolveNewBlock: (blockObject: object) => {
      return newBlockMap.get(blockObject)
    },
    searchPage: async (searchText: string) => {
      const pages = await DataStore.query(
        Page,
        searchText === ''
          ? Predicates.ALL
          : (p) => p.title('contains', searchText),
        { limit: 10 }
      )
      return pages
    },
  }
  return services
}
