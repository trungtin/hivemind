import { Block } from '../models'

export function isBlock(block): block is Block {
  return block && typeof block.id === 'string'
}
