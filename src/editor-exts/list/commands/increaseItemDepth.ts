import { NodeEntry, Editor, Transforms, Element, Node } from 'slate'
import { Options } from '..'
import {
  getDeepestItemDepth,
  getPreviousItem,
  getCurrentItem,
  getListForItem,
  isList,
} from '../utils'

/**
 * Move the given item to the sublist at the end of destination item,
 * creating a sublist if needed.
 */
const moveAsSubItem = (options: Options) => (
  editor: Editor,
  movedItemEntry: NodeEntry<Node>,
  destinationEntry: NodeEntry<Node>
): void => {
  const [movedItemElement, movedItemElementPath] = movedItemEntry
  const [destinationElement, destinationElementPath] = destinationEntry
  const lastIndex = destinationElement.children.length
  const lastChildIndex = destinationElement.children.length - 1
  const lastChild = destinationElement.children[lastIndex - 1]

  // The potential existing last child list
  const existingList = isList(options)(lastChild) ? lastChild : null
  if (existingList) {
    Transforms.moveNodes(editor, {
      at: movedItemElementPath,
      // At the destination, the last Element is a List
      // we want to add the current Item
      // as the new last Item of that List
      to: [
        ...destinationElementPath,
        lastChildIndex,
        lastChild.children.length,
      ],
    })

    return
  }

  const listEntry = getListForItem(options)(editor, destinationElementPath)
  if (!listEntry) {
    throw new Error('Destination is not in a list')
  }
  const [currentList] = listEntry

  const newSublist = {
    type: currentList.type,
    children: [movedItemElement],
  }

  Editor.withoutNormalizing(editor, () => {
    // Insert new sublist after the position
    // of the last child of the destination node
    Transforms.insertNodes(editor, newSublist, {
      at: [...destinationElementPath, lastChildIndex + 1],
    })

    Transforms.removeNodes(editor, {
      at: movedItemElementPath,
    })
  })
}

/**
 * Increase the depth of the current item by putting it in a sub-list
 * of previous item.
 * For first items in a list, does nothing.
 */
export const increaseItemDepth = (options: Options) => (
  editor: Editor
): void => {
  const previousItem = getPreviousItem(options)(editor)
  const currentItem = getCurrentItem(options)(editor)
  const maxDepth = options.maxDepth * 2

  if (!previousItem || !currentItem) {
    return
  }

  const [, currentItemPath] = currentItem

  // Get the depth of the focused list item.
  const currentItemDepth = currentItemPath.length - 1

  // Make sure the level of the focused item is below the defined maximum.
  if (currentItemDepth >= maxDepth) {
    return
  }

  // Get the depth of the deepest `li` descendant of the focused item.
  const deepestItemDepth = getDeepestItemDepth(options)(editor, [])

  // This prevents from indenting parents of too deeply nested list items.
  if (deepestItemDepth >= maxDepth) {
    return
  }

  // Move the item in the sublist of previous item
  moveAsSubItem(options)(editor, currentItem, previousItem)
}
