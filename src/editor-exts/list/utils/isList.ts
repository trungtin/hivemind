import { Element, Node } from 'slate'
import { Options } from '..'

/**
 * True if the node is a list container
 */
export const isList = ({ types }: Options) => (node: Node): boolean =>
  Element.isElement(node) && types.includes(node.type)
