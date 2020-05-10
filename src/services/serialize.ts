import { Editor, Node, Path, Text, Transforms } from 'slate'
import { Block, Page } from '../models'
import { isModelConstructor } from '@aws-amplify/datastore/lib-esm/util'
import { isBlock } from '../utils/block'

function nextPath(root: Node, p: Path) {
  if (p.length === 0) return
  let base = [...p]

  while (true) {
    let next = Path.next(base)
    try {
      if (Node.get(root, next)) return next
    } catch {}
    base = Path.parent(base)
    if (base.length === 0) {
      return
    }
  }
}

function nodeType(node: Node) {
  return (
    node.type ||
    (Editor.isEditor(node) && 'root') ||
    (Text.isText(node) && 'text')
  )
}

export function isBlockNode(node: Node) {
  if (
    node.type === 'list_item' ||
    node.type === 'paragraph' ||
    node.type === 'title' ||
    Editor.isEditor(node)
  ) {
    return true
  }
  return false
}

function stringifyNode(node: Node) {
  let copy
  if (Text.isText(node)) copy = node
  else {
    copy = {
      // toJSON: node.toJSON,
      type: nodeType(node),
      children: node.children,
    }
  }
  return JSON.stringify(copy, (key, value) => {
    if (isBlock(value.block)) {
      return replacement(value.block)
    }
    return value
  })
}

const replacement = (block: Block) => ({
  type: 'block',
  blockId: block.id,
  children: [],
})

function setBlockNode(root: Editor, path: Path, block: Block) {
  Transforms.setNodes(
    root,
    {
      block,
      // toJSON: () => replacement(block),
    },
    { at: path }
  )
}

function _slateToModel(
  root: Editor,
  { recursive = true, at }: { recursive?: boolean; at?: Path } = {}
): [Block, ...Block[]] {
  let node = at ? Node.get(root, at) : root
  if (!isBlockNode(node))
    throw new Error('Cannot create Block from non-block node')

  let block: Block =
    node.block ||
    new Block({
      type: nodeType(node),
      json: '{}',
      children: [],
      // TODO: block.page for rootBlock
    })

  let childBlocks: Block[] = []

  let skipUntil: Path | undefined = undefined
  while (true) {
    let finish = true
    for (const [n, p] of Node.nodes(node, { from: skipUntil })) {
      const rootPath = at ? [...at, ...p] : p
      // don't need to create block of the root here
      if (p.length === 0) {
        continue
      }

      if (isBlockNode(n) || n.block != null) {
        let childBlock = n.block

        if (!childBlock || n.dirty === true) {
          const [b, ...c] = _slateToModel(root, { at: rootPath })
          childBlock = b
          childBlocks.push(...c)
        }

        if (childBlock.parent !== block) {
          childBlock = Block.copyOf(
            childBlock,
            childBlock => (childBlock.parent = block)
          )
        }

        if (n.block !== childBlock) {
          childBlocks.push(childBlock)
          setBlockNode(root, rootPath, childBlock)
        }

        finish = false
        skipUntil = nextPath(node, p)
        if (!skipUntil) finish = true
        break
      }
    }
    if (finish) {
      break
    }
  }

  if (node.dirty) {
    Transforms.setNodes(root, { dirty: false }, { at: at })
    node = at ? Node.get(root, at) : root
  }

  return [
    Block.copyOf(block, block => {
      const json = stringifyNode(node)
      block.json = json
    }),
    ...childBlocks,
  ]
}

export function slateToModel(
  root: Editor,
  { recursive = true, at }: { recursive?: boolean; at?: Path } = {}
): [Block, ...Block[]] {
  return _slateToModel(root, { recursive, at })
}

function _modelToSlate(block: Block) {
  const json = JSON.parse(block.json)
  for (const [n, p] of Node.nodes(json)) {
    if (n.type === 'block') {
      const childBlock = block.children!.find(child => child.id === n.blockId)
      if (!childBlock)
        throw new Error(
          `Cannot find block of id ${n.blockId}, parent: ${block.id}`
        )
      const node = _modelToSlate(childBlock)
      const parent = Node.parent(json, p)
      parent.children[p[p.length - 1]] = node
    }
  }
  return {
    ...json,
    type: block.type,
    block: block,
    // toJSON: () => replacement(block),
  }
}

export function modelToSlate(page: Page) {
  return _modelToSlate(page.rootBlock)
}
