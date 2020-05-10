import { Editor, Element, Node, NodeEntry, Path } from 'slate'
import { Options } from '..'
import { getCurrentItem } from '.'

/**
 * Return the previous item, from current selection or from a node.
 */
export const getPreviousItem = (options: Options) => (
  editor: Editor,
  path?: Path
): NodeEntry<Node> | null => {
  const entry = getCurrentItem(options)(editor, path)
  if (!entry) {
    return null
  }
  const [currentItem, currentItemPath] = entry

  let previousSiblingPath: Path

  try {
    previousSiblingPath = Path.previous(currentItemPath)
  } catch (e) {
    // Slate throws when trying to find
    // previous of a first element
    // we interpret it as there not being a previous item
    return null
  }

  const previousSibling = Node.get(editor, previousSiblingPath)

  if (!previousSibling) {
    return null
  } else if (previousSibling.type === options.typeItem) {
    return [previousSibling, previousSiblingPath]
  }
  return null
}
