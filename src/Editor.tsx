import { EuiComboBoxOptionOption, EuiText, EuiTitle } from '@elastic/eui'
import { createPopper } from '@popperjs/core'
import flowRight from 'lodash/flowRight'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ReactDOM from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { createEditor, Editor, Node, Range, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { Editable, ReactEditor, Slate, withReact } from 'slate-react'
import PageSuggestion from './components/PageSuggestion'
import { pageServices } from './services/page'

const Portal = ({ children }) => {
  return ReactDOM.createPortal(children, document.body)
}

const withPageLinkify = (editor) => {
  const { isInline, isVoid } = editor

  editor.isInline = (element) => {
    return element.type === 'page-link' ? true : isInline(element)
  }

  return editor
}

type PageLink = {
  id: string
  text: string
}

const insertPageLink = (editor, link: PageLink) => {
  const pageLink = {
    type: 'page-link',
    children: [{ pageId: link.id, text: link.text }],
  }
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
  const [search, setSearch] = useState(null as null | string)

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
  const editor: ReactEditor = useMemo(
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

      // TODO: layout maybe break when the use-typing text span multiple line. Need a way to recalculate layout
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

  const suggestRef = useRef<any>()

  const onKeyDown = useCallback(
    async function onKeyDown(event) {
      if (target && suggestRef.current) {
        suggestRef.current.handleKeyDown(event)
      }
      if (event.key === '[') {
        event.preventDefault()
        editor.insertText('[]')
        Transforms.move(editor, { reverse: true })
      } else if (event.key === 'Backspace') {
        const { selection } = editor
        if (selection && Range.isCollapsed(selection)) {
          const [start] = Range.edges(selection)
          const before = Editor.before(editor, start)
          const after = Editor.after(editor, start)
          const range = before && Editor.range(editor, before, after)
          const text = range && Editor.string(editor, range)
          if (text === '[]') {
            event.preventDefault()
            editor.deleteForward('character')
            editor.deleteBackward('character')
          }
        }
      }
    },
    [index, search, target]
  )

  const [searchOptions, setSearchOptions] = useState(
    [] as EuiComboBoxOptionOption[]
  )

  useEffect(() => {
    if (search == null) {
      setSearchOptions([])
      return
    }
    services.searchPage(search).then((pages) => {
      setSearchOptions(
        pages.map((p) => ({
          value: p.id,
          label: p.title || '',
        }))
      )
    })
  }, [search])
  return (
    <EuiText grow={false}>
      <Slate
        editor={editor}
        value={value}
        onChange={async (newValue) => {
          const isChanged = value !== newValue
          if (isChanged) {
            updateTitle(value, newValue)
            updateBlocks(value, newValue)
          }
          setValue(newValue)
          const { selection } = editor

          if (selection && Range.isCollapsed(selection)) {
            const [start] = Range.edges(selection)
            const startLine = Editor.before(editor, start, {
              unit: 'line',
            })
            const range =
              startLine && start && Editor.range(editor, startLine, start)
            const text = range && Editor.string(editor, range)
            const match = text && text.match(/\[\[(((?!\]).)*)$/)

            if (match) {
              const matchText = match[1] || ''
              const startMatch = Editor.before(editor, start, {
                unit: 'character',
                distance: match[0].length,
              })
              const matchRange =
                startMatch && Editor.range(editor, startMatch, start)

              setTarget(matchRange)
              setSearch(matchText)
              setIndex(0)
              return
            }
          }

          setTarget(null)
          setSearch(null)
        }}
      >
        <Editable
          renderElement={renderElement}
          placeholder="Enter a title…"
          spellCheck
          autoFocus
          onKeyDown={onKeyDown}
        />
        {target && search != null && (
          <Portal>
            <div ref={ref}>
              <PageSuggestion
                ref={suggestRef}
                options={searchOptions}
                onOptionSelected={(option) => {
                  insertPageLink(editor, {
                    id: option.value as string,
                    text: option.label,
                  })
                }}
                searchText={search}
                escape={() => setTarget(null)}
              ></PageSuggestion>
            </div>
          </Portal>
        )}
      </Slate>
    </EuiText>
  )
}

const Element = ({ attributes, children, element }) => {
  switch (element.type) {
    case 'title':
      return (
        <EuiTitle>
          <h2 {...attributes}>{children}</h2>
        </EuiTitle>
      )
    case 'page-link':
      return (
        <a href="#" {...attributes}>
          {children}
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
