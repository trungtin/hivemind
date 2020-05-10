import { Editor, NodeEntry, Path, Element } from 'slate'
import { Options } from '..'
import { getCurrentItem, getListForItem } from '.'

/**
 * Return the parent list block, from current selection or from a node (paragraph in a list item).
 */
export const getCurrentList = (options: Options) => (
  editor: Editor,
  path?: Path
): NodeEntry<Element> | null => {
  const itemEntry = getCurrentItem(options)(editor, path)

  if (!itemEntry) {
    return null
  }

  const [, itemPath] = itemEntry

  return getListForItem(options)(editor, itemPath) || null
}
