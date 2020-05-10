import { Range, NodeEntry, Editor, Element, Node } from 'slate'
import { Options } from '..'
import { isItem } from '.'

/**
 * Return the array of items at the given range.
 *
 * Returns an empty array if no list of items can cover the range
 */
export const getItemsAtRange = (options: Options) => (
  editor: Editor,
  range?: Range
): Array<NodeEntry<Node>> => {
  range = range || editor.selection!

  if (!range) {
    return []
  }

  const allItems = Editor.nodes(editor, {
    at: range,
    match: node => isItem(options)(node),
  })

  return Array.from(allItems)
}
