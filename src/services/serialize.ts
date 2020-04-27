import cloneDeep from 'lodash/cloneDeep'
import keyBy from 'lodash/keyBy'
import { Node, Path } from 'slate'
import { Block, Page } from '../models'
import { ModelInit } from '@aws-amplify/datastore'

function shouldCreateBlock(node: Node) {
  if (
    node.type === 'list_item' ||
    node.type === 'paragraph' ||
    node.type === 'title'
  ) {
    return true
  }
  return false
}

function _slateToModel(root: Node, page: Page, { recursive = true } = {}) {
  let blocks: Block[] = []

  let from: Path = []

  while (true) {
    let next = false
    for (const [n, p] of Node.nodes(root, { from })) {
      // don't need to create block of the root here
      if (p.length === 0) {
        continue
      }
      if (shouldCreateBlock(n) || n.block != null) {
        let block = n.block || _slateToModel(n, page)
        blocks.push(block)
        const parent = Node.parent(root, p)
        parent.children[p[p.length - 1]] = {
          type: 'block',
          blockId: block.id,
          children: [],
        }

        next = true
        from = p
        break
      }
    }
    if (!next) {
      break
    }
  }

  return new Block({
    type: root.type,
    json: JSON.stringify(root),
    children: blocks,
    page,
  } as ModelInit<Block>)
}

export function slateToModel(
  root: Node,
  page: Page,
  { recursive = true } = {}
) {
  root = cloneDeep(root)
  return _slateToModel(root, page, { recursive })
}

function _modelToSlate(block: Block) {
  const json = JSON.parse(block.json)
  for (const [n, p] of Node.nodes(json)) {
    if (n.type === 'block') {
      const childBlock = block.children!.find((child) => child.id === n.blockId)
      if (!childBlock) throw new Error(`Cannot find block of id ${n.blockId}`)
      const node = _modelToSlate(childBlock)
      const parent = Node.parent(json, p)
      parent.children[p[p.length - 1]] = node
    }
  }
  return {
    ...json,
    type: block.type,
    block: block,
  }
}

export function modelToSlate(page: Page) {
  return {
    children: page.blocks.map(_modelToSlate),
  }
}

// doesn't work
// export function compareChanges(
//   oldVal: Node,
//   newVal: Node,
//   page: Page
// ): Block[] {
//   const changed: Block[] = []
//   const diffEntries: [Node, Path][] = []

//   // assuming Node.nodes is depth-first traversal
//   let lastEqualPath: Path
//   function skip([node, path]: [Node, Path]) {
//     if (lastEqualPath && Path.isDescendant(path, lastEqualPath)) return true
//     return false
//   }

//   // compare by path
//   for (const [n, p] of Node.nodes(newVal, { pass: skip })) {
//     try {
//       const oldN = Node.get(oldVal, p)
//       if (oldN === n) {
//         lastEqualPath = p
//         continue
//       }
//     } catch (e) {
//       // error from cannot get some path from oldVal
//     }
//     diffEntries.push([n, p])
//   }

//   if (diffEntries.length === 0) return changed

//   const oldValEntryBlockIdMap = {}

//   for (const [n, p] of Node.nodes(oldVal)) {
//     if (n.blockId) {
//       oldValEntryBlockIdMap[n.blockId] = [n, p]
//     }
//   }

//   for (let i = 0; i < diffEntries.length; i++) {
//     const [n, p] = diffEntries[i]!

//     // because the tree is immutable so if some node change then it's parent will also be changed
//     // so we can skip those node that shouldn't be save as block and let their ancestor compare the diff
//     if (!shouldCreateBlock(n)) continue

//     // compare by blockId
//     let oldNode
//     if (n.blockId && n.blockId in oldValEntryBlockIdMap) {
//       oldNode = oldValEntryBlockIdMap[n.blockId][0]
//       if (n === oldNode) {
//         continue
//       }
//     }

//     let newBlock = slateToModel(n, page)
//     if (oldNode) {
//       // TODO: optimize this path
//       const oldBlock = slateToModel(oldNode, page)

//       const equal =
//         oldBlock.type === newBlock.type && oldBlock.json === newBlock.json
//       if (equal) continue
//     }

//     changed.push(newBlock)
//   }

//   return changed
// }
