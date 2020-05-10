import {
  Editor,
  Operation,
  Node,
  NodeEntry,
  Ancestor,
  Path,
  Transforms,
} from 'slate'
import { isBlockNode, slateToModel } from './serialize'
import { Page, Block } from '../models'
import debounce from 'lodash/debounce'
import { DataStore, MutableModel } from '@aws-amplify/datastore'
import { isBlock } from '../utils/block'

const TO_BE_SAVED = new WeakMap<Page, { [blockId: string]: Block }>()

export const withSerialize = (page: Page) => (editor: Editor) => {
  const toBeSaved =
    TO_BE_SAVED.get(page) || TO_BE_SAVED.set(page, {}).get(page)!
  const debouncedSaved = debounce(async () => {
    for (const id of Object.keys(toBeSaved)) {
      const block = toBeSaved[id]
      try {
        const saved = await DataStore.save(block)
        delete toBeSaved[block.id]
      } catch (e) {
        // TODO: implement retry
      }
    }
  }, 2000)
  function save(block: Block, updater?: Parameters<typeof Block.copyOf>[1]) {
    if (toBeSaved[block.id] != null) block = toBeSaved[block.id]
    toBeSaved[block.id] = updater == null ? block : Block.copyOf(block, updater)
    debouncedSaved()
  }
  function blockNodeAncestor(path: Path): NodeEntry | null {
    for (const [n, p] of Node.ancestors(editor, path, { reverse: true })) {
      if (isBlockNode(n)) {
        return [n, p]
      }
    }
    return null
  }

  const debounced = debounce(async () => {
    const toSave = slateToModel(editor, {
      // match: (node) => node.dirty || !node.block,
    })
    console.log('saving: ', toSave)
    const titleBlock = toSave.find((b) => b.type === 'title')
    if (titleBlock) {
      DataStore.save(
        Page.copyOf(page, (page) => {
          page.title = Node.string(titleBlock) || 'Untitled'
        })
      )
        .then((saved) => {
          page = saved
        })
        .catch(console.error)
    }
    toSave.map((b) => DataStore.save(b).catch(console.error))
  }, 2000)

  function updateUpward(node: Node, path: Path) {
    debounced()
    let shouldUpdateUpward = true
    if (isBlockNode(node)) {
      // save(slateToModel(editor, { at: path }))
      Transforms.setNodes(editor, { dirty: true }, { at: path })
      if (node.block) {
        shouldUpdateUpward = false
      }
    }
    if (!shouldUpdateUpward || path.length === 0) return
    const ancestor = blockNodeAncestor(path)
    if (!ancestor) throw new Error('Missing ancestor block node')
    const [n, p] = ancestor
    updateUpward(n, p)
  }

  const apply = editor.apply
  editor.apply = (op: Operation) => {
    apply(op)
    switch (op.type) {
      case 'insert_node': {
        const { node, path } = op
        updateUpward(node, path)
        break
      }
      case 'insert_text': {
        const { text, offset, path } = op
        // const ancestor = blockNodeAncestor(path)
        // if (!ancestor)
        //   throw new Error(
        //     'Cannot insert text into path: [' + path.join(',') + ']'
        //   )
        // const [n, p] = ancestor
        const node = Node.get(editor, path)
        updateUpward(node, path)
        break
      }
      case 'merge_node': {
        const { target, path, position, properties } = op
        // const ancestor = blockNodeAncestor(path)
        // if (!ancestor)
        //   throw new Error('Cannot merge node at path: [' + path.join(',') + ']')
        // const [n, p] = ancestor
        // updateNodeBlockAndAncestor(n, p)

        // the way merge_node is done is merge the "path" with "previous path"
        // so after the merge previous path is the correct one
        const prevPath = Path.previous(path)
        const node = Node.get(editor, prevPath)
        updateUpward(node, prevPath)
        break
      }
      case 'move_node': {
        const { path, newPath } = op
        // const ancestor = blockNodeAncestor(path)
        // if (!ancestor)
        //   throw new Error(
        //     'Cannot find old path of moving block: [' + path.join(',') + ']'
        //   )
        // const [n, p] = ancestor
        // updateNodeBlockAndAncestor(n, p)

        // const newAncestor = blockNodeAncestor(newPath)
        // if (!newAncestor)
        //   throw new Error(
        //     'Cannot find new path of moving block: [' + newPath.join(',') + ']'
        //   )
        // const [nn, np] = newAncestor
        // updateNodeBlockAndAncestor(nn, np)
        // TODO: Test this
        const node = Node.get(editor, newPath)
        updateUpward(node, Path.parent(path))
        updateUpward(node, newPath)
        break
      }

      case 'remove_node':
      case 'remove_text': {
        const { path } = op
        const parentPath = Path.parent(path)
        const parent = Node.get(editor, parentPath)
        updateUpward(parent, parentPath)
        break
      }
      case 'split_node': {
        const { path, position, properties } = op
        // const ancestor = blockNodeAncestor(path)
        // if (!ancestor)
        //   throw new Error(
        //     'Cannot find block of removing node/text at path: [' +
        //       path.join(',') +
        //       ']'
        //   )
        // const [n, p] = ancestor
        // updateNodeBlockAndAncestor(n, p)
        if (isBlock(properties.block)) {
          const nextPath = Path.next(path)
          Transforms.unsetNodes(editor, 'block', { at: nextPath })
        }
        const node = Node.get(editor, path)
        updateUpward(node, path)
        break
      }
      case 'set_node': {
        const { path, properties } = op
        // const node = Node.get(editor, path)
        // if (isBlockNode(node)) updateNodeBlockAndAncestor(node, path)
        // const ancestor = blockNodeAncestor(path)
        // if (!ancestor)
        //   throw new Error(
        //     'Cannot find block of node at path: [' + path.join(',') + ']'
        //   )
        // const [n, p] = ancestor
        // updateNodeBlockAndAncestor(n, p)
        if ('dirty' in properties) break
        const node = Node.get(editor, path)
        updateUpward(node, path)
        break
      }
      // case 'set_selection':
      //   break
      default:
    }
  }
  return editor
}
