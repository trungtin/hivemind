import { Editor, Element, NodeEntry, Path } from 'slate'
import { Options } from '..'
import { isList } from '.'

/**
 * Return the parent list block for an item block.
 */
export const getListForItem = (options: Options) => (
  editor: Editor,
  path: Path
): NodeEntry<Element> | undefined =>
  Editor.above(editor, {
    at: path,
    match: node => isList(options)(node),
  })
