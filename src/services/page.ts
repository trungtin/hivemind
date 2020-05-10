import { DataStore, Predicates } from '@aws-amplify/datastore'
import { Node } from 'slate'
import { Block, Page } from '../models'
import { batchAsync } from '../utils/batch'

export async function initPage() {
  return await DataStore.save(
    new Page({
      title: '',
      rootBlock: new Block({
        type: 'root',
        json: JSON.stringify({
          type: 'root',
          children: [
            {
              type: 'title',
              children: [{ text: '' }],
            },
            {
              type: 'ul_list',
              children: [
                {
                  type: 'list_item',
                  children: [{ type: 'paragraph', children: [{ text: '' }] }],
                },
              ],
            },
          ],
        }),
        children: [],
      }),
    })
  )
}

export async function getPage(id: string) {
  const page = await DataStore.query(Page, p => p.id('eq', id)).then(res => {
    let page = res[0]
    if (!page) throw new Error('Page not found')
    return page
  })
  // const rb = await DataStore.query(Block, (b) => b.id('eq', page.rootBlock.id))
  console.log('page.rootBlock.children: ', page.rootBlock)
  return page
}

export function pageServices(page: Page) {
  const newBlockMap = new WeakMap<object, Block>()

  const services = {
    update: batchAsync(
      async (...updaters: Parameters<typeof Page.copyOf>[1][]) => {
        const saved = await DataStore.save(
          Page.copyOf(page, p => updaters.forEach(u => u(p)))
        )
        return saved
      },
      400
    ),
    createBlockInstances: (
      blocks: { id: string; fromNode: Node; content: string }[]
    ) => {
      // const map = keyBy(page.blocks, 'id')
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
    },
    resolveNewBlock: (blockObject: object) => {
      return newBlockMap.get(blockObject)
    },
    searchPage: async (searchText: string) => {
      const pages = await DataStore.query(
        Page,
        searchText === ''
          ? Predicates.ALL
          : p => p.title('contains', searchText),
        { limit: 10 }
      )
      return pages
    },
  }
  return services
}
