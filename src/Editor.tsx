import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as ReactDOM from 'react-dom'
import { Slate, Editable, withReact, ReactEditor } from 'slate-react'
import { Transforms, createEditor, Node, Range, Editor } from 'slate'
import { withHistory } from 'slate-history'
import flowRight from 'lodash/flowRight'
import { createPopper } from '@popperjs/core'
import { pageServices } from './services/page'

const Portal = ({ children }) => {
  return ReactDOM.createPortal(children, document.body)
}

const withPageLinkify = (editor) => {
  const { isInline, isVoid } = editor

  editor.isInline = (element) => {
    return element.type === 'page-link' ? true : isInline(element)
  }

  editor.isVoid = (element) => {
    return element.type === 'page-link' ? true : isVoid(element)
  }

  return editor
}

const insertPageLink = (editor, character) => {
  const pageLink = { type: 'page-link', character, children: [{ text: '' }] }
  Transforms.insertNodes(editor, pageLink)
  Transforms.move(editor)
}

const withLayout = (editor) => {
  const { normalizeNode } = editor

  editor.normalizeNode = ([node, path]) => {
    if (path.length === 0) {
      if (editor.children.length < 1) {
        const title = { type: 'title', children: [{ text: 'Untitled' }] }
        Transforms.insertNodes(editor, title, { at: path.concat(0) })
      }

      if (editor.children.length < 2) {
        const paragraph = { type: 'paragraph', children: [{ text: '' }] }
        Transforms.insertNodes(editor, paragraph, { at: path.concat(1) })
      }

      for (const [child, childPath] of Node.children(editor, path)) {
        const type = childPath[0] === 0 ? 'title' : 'paragraph'

        if (child.type !== type) {
          Transforms.setNodes(editor, { type }, { at: childPath })
        }
      }
    }

    return normalizeNode([node, path])
  }

  return editor
}

function blockText(block) {
  return block.children.map((v) => v.text).join()
}

const PageEditor = () => {
  let { pageId } = useParams()
  const navigate = useNavigate()
  let servicesRef = useRef(pageServices(pageId))

  let services = servicesRef.current!
  services.pageResolve.catch((e) => {
    // something went wrong
    navigate('/')
  })

  const ref = useRef<HTMLDivElement>(null)

  const [value, setValue] = useState(initialValue)
  const [target, setTarget] = useState(undefined as Range | undefined | null)
  const [index, setIndex] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    servicesRef.current = pageServices(pageId)
    servicesRef.current.pageResolve.then((page) => {
      if (value === initialValue) {
        setValue(
          [
            {
              type: 'title',
              children: [{ text: page.title || '' }],
            },
          ].concat(
            page.blocks.map((block) => ({
              type: 'paragraph',
              children: [{ text: block.content || '' }],
            }))
          )
        )
      }
    })
  }, [pageId])

  const renderElement = useCallback((props) => <Element {...props} />, [])
  const editor = useMemo(
    () =>
      flowRight([
        withLayout,
        withPageLinkify,
        withHistory,
        withReact,
        createEditor,
      ])(),
    []
  )
  useEffect(() => {
    if (target && ref.current) {
      const targetDOM = ReactEditor.toDOMRange(editor, target)

      createPopper(targetDOM, ref.current, { placement: 'bottom' })
    }
  }, [target, ref])

  async function updateTitle(value, newValue) {
    const t1 = value[0]
    const t2 = newValue[0]
    if (t1 === t2) return

    await services.update((page) => {
      page.title = blockText(t2)
    })
  }

  async function updateBlocks(value, newValue) {
    // const b1 = value.filter((v) => v.type === 'paragraph')
    const b2 = newValue.filter((v) => v.type === 'paragraph')
    const blocks = await services.createBlockInstances(
      b2.map((n) => ({ id: n.id, fromNode: n, content: Node.string(n) }))
    )
    const promise: any = services.update((page) => {
      page.blocks = blocks
    })

    if (!promise.attached) {
      promise.attached = true
      promise.then(() => {
        // iterate all nodes to populate id from created block
        // TODO: using Editor.nodes to iterate all nested node
        for (const [node, path] of Node.children(editor, [])) {
          if (node.type === 'title') return
          if (node.id != null) return
          const block = services.resolveNewBlock(node)
          if (block) Transforms.setNodes(editor, { id: block.id }, { at: path })
        }
      })
    }
  }
  return (
    <Slate
      editor={editor}
      value={value}
      onChange={async (newValue, ...args) => {
        const isChanged = value !== newValue
        if (isChanged) {
          updateTitle(value, newValue)
          updateBlocks(value, newValue)
        }
        setValue(newValue)
        const { selection } = editor

        if (selection && Range.isCollapsed(selection)) {
          const [start] = Range.edges(selection)
          const wordBefore = Editor.before(editor, start, { unit: 'word' })
          const before = wordBefore && Editor.before(editor, wordBefore)
          const beforeRange = before && Editor.range(editor, before, start)
          const beforeText = beforeRange && Editor.string(editor, beforeRange)
          const beforeMatch = beforeText && beforeText.match(/^\[\[(\w+)$/)
          const after = Editor.after(editor, start)
          const afterRange = Editor.range(editor, start, after)
          const afterText = Editor.string(editor, afterRange)
          const afterMatch = afterText.match(/^(\s|$)/)

          if (beforeMatch && afterMatch) {
            setTarget(beforeRange)
            setSearch(beforeMatch[1])
            setIndex(0)
            return
          }
        }

        setTarget(null)
      }}
    >
      <Editable
        renderElement={renderElement}
        placeholder="Enter a title…"
        spellCheck
        autoFocus
      />
      {target && (
        <Portal>
          <div ref={ref}>HELLO</div>
        </Portal>
      )}
    </Slate>
  )
}

const Element = ({ attributes, children, element }) => {
  switch (element.type) {
    case 'title':
      return <h2 {...attributes}>{children}</h2>
    case 'page-link':
      return (
        <a href="#">
          <span>[[</span>
          {children}
          <span>]]</span>
        </a>
      )
    case 'paragraph':
      return <p {...attributes}>{children}</p>
    default:
      return null
  }
}

const initialValue: Node[] = [
  {
    type: 'title',
    children: [{ text: '' }],
  },
]

export { PageEditor }
