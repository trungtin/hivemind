import { EuiComboBoxOptionOption, EuiText, EuiTitle } from '@elastic/eui'
import { createPopper } from '@popperjs/core'
import flowRight from 'lodash/flowRight'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ReactDOM from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { createEditor, Editor, Node, Range, Transforms, Point } from 'slate'
import { withHistory } from 'slate-history'
import { Editable, ReactEditor, Slate, withReact } from 'slate-react'
import Suggestion from './components/Suggestion'
import { pageServices, getPage } from './services/page'
import EditorControlBar from './components/EditorControlBar'
import { CheckListItem } from './components/editor-elements/CheckListItem'
import { EditListPlugin } from './editor-exts/list'

import Fuse from 'fuse.js'
import { withSerialize } from './services/withSerialize'
import { Page } from './models'
import { DataStore } from '@aws-amplify/datastore'
import { usePromiseAsync } from './hooks/useAsync'
import { modelToSlate } from './services/serialize'

const [
  withEditList, // applies normalization to editor
  listPluginOnKeyDown, // keyDown handler for keyboard shortcuts
  { Editor: ListEditor, Element: ListElement, Transforms: ListTransform }, // Slate classes with added utility functions and transforms this package provides
] = EditListPlugin({
  types: ['ul_list', 'ol_list', 'list'],
  typeItem: 'list_item',
  typeDefault: 'paragraph',
  canMerge(n1, n2) {
    return true
  },
})

const COMMAND_LIST = [
  {
    label: 'TODO',
    exec: (editor: ReactEditor) => {
      const { selection } = editor
      if (!selection) return

      Transforms.setNodes(
        editor,
        { type: 'check-list-item' },
        {
          at: selection,
          match: n => Editor.isBlock(editor, n) && n.type !== 'title',
          split: false,
        }
      )
    },
  },
  { label: 'Slider', exec: (editor: ReactEditor) => {} },
  { label: 'Table', exec: (editor: ReactEditor) => {} },
  { label: 'Date Picker', exec: (editor: ReactEditor) => {} },
  { label: 'Current Time', exec: (editor: ReactEditor) => {} },
  { label: 'Today', exec: (editor: ReactEditor) => {} },
]

const commandSearch = new Fuse(COMMAND_LIST, { keys: ['label'] })

const COMMAND_MAX_LENGTH = 16
const matchCommandRegex = new RegExp(
  `\\/((\\w|$)[\\w\\s]{0,${COMMAND_MAX_LENGTH}})$`
)

function removeCommand(editor: ReactEditor) {
  const { selection } = editor
}

const Portal = ({ children }) => {
  return ReactDOM.createPortal(children, document.body)
}

const withPageLinkify = editor => {
  const { isInline, isVoid } = editor

  editor.isInline = element => {
    switch (element.type) {
      case 'page-link':
        return true
      case 'check-list-item':
        return false
      default:
        return isInline(element)
    }
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

const withChecklists = editor => {
  const { deleteBackward } = editor

  editor.deleteBackward = (...args) => {
    const { selection } = editor

    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'check-list-item',
      })

      if (match) {
        const [, path] = match
        const start = Editor.start(editor, path)

        if (Point.equals(selection.anchor, start)) {
          Transforms.setNodes(
            editor,
            { type: 'paragraph' },
            { match: n => n.type === 'check-list-item' }
          )
          return
        }
      }
    }

    deleteBackward(...args)
  }

  return editor
}

const withLayout = editor => {
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

      const first = Node.child(editor, 0)

      if (first.type !== 'title') {
        Transforms.setNodes(editor, { type: 'title' }, { at: [0] })
      }

      for (const [child, childPath] of Node.children(editor, path)) {
        if (child.type === 'title' && childPath[0] !== 0) {
          Transforms.setNodes(editor, { type: 'paragraph' }, { at: childPath })
        }
      }
    }

    return normalizeNode([node, path])
  }

  return editor
}

function blockText(block) {
  return block.children.map(v => v.text).join()
}

const PageEditorInner = ({ page }: { page: Page }) => {
  const ref = useRef<HTMLDivElement>(null)

  const [value, setValue] = useState(initialValue)
  const [target, setTarget] = useState(undefined as Range | undefined | null)
  const [index, setIndex] = useState(0)
  const [search, setSearch] = useState(
    null as null | { type: 'page' | 'command'; text: string }
  )

  const services = useMemo(() => pageServices(page), [page])
  useEffect(() => {
    editor.block = page.rootBlock
    const value = modelToSlate(page).children
    editor.children = value
    Editor.normalize(editor, { force: true })
    setValue(editor.children)
  }, [page])

  const renderElement = useCallback(props => <Element {...props} />, [])
  const editor: ReactEditor = useMemo(
    () =>
      flowRight([
        withSerialize(page),
        withEditList,
        withLayout,
        withChecklists,
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

    await services.update(page => {
      page.title = blockText(t2)
    })
  }

  async function updateBlocks(value, newValue) {
    // const b1 = value.filter((v) => v.type === 'paragraph')
    // const b2 = newValue.filter((v) => v.type === 'paragraph')
    // const blocks = await services.createBlockInstances(
    //   b2.map((n) => ({ id: n.id, fromNode: n, content: Node.string(n) }))
    // )
    const promise: any = services.update(page => {
      // page.blocks = blocks
    })

    if (!promise.attached) {
      promise.attached = true
      promise.then(async () => {
        // const blocks = editor.children.map((node) => slateToModel(node, page))
        const saved = await DataStore.save(
          Page.copyOf(page, page => {
            // page.blocks = blocks
          })
        )
        // // iterate all nodes to populate id from created block
        // // TODO: using Editor.nodes to iterate all nested node
        // for (const [node, path] of Node.children(editor, [])) {
        //   if (node.type === 'title') return
        //   if (node.id != null) return
        //   const block = services.resolveNewBlock(node)
        //   if (block)
        //     Transforms.setNodes(editor, { id: block.id }, { at: path })
        // }
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
      listPluginOnKeyDown(editor)(event)
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
    if (search.type === 'page') {
      services.searchPage(search.text).then(pages => {
        setSearchOptions(
          pages.map(p => ({
            value: p.id,
            label: p.title || '',
          }))
        )
      })
    } else if (search.type === 'command') {
      if (search.text === '') {
        setSearchOptions(
          COMMAND_LIST.map(c => ({
            value: c.label,
            label: c.label,
          }))
        )
      } else {
        const commands = commandSearch.search(search.text)
        setSearchOptions(
          commands.map(c => ({
            value: c.item.label,
            label: c.item.label,
          }))
        )
      }
    }
  }, [search])
  console.log('editor: ', editor)
  return (
    <>
      <EuiText grow={false}>
        <Slate
          editor={editor}
          value={value}
          onChange={async newValue => {
            const isChanged = value !== newValue
            if (isChanged) {
              updateTitle(value, newValue)
              // updateBlocks(value, newValue)
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

              // Match with page suggestion
              // TODO: modify this to be non-greedy version
              // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Quantifiers
              let match = text && text.match(/\[\[(((?!\]).)*)$/)

              if (match) {
                const matchText = match[1] || ''
                const startMatch = Editor.before(editor, start, {
                  unit: 'character',
                  distance: match[0].length,
                })
                const matchRange =
                  startMatch && Editor.range(editor, startMatch, start)

                setTarget(matchRange)
                setSearch({ type: 'page', text: matchText })
                setIndex(0)
                return
              }

              // Match with command list
              match = text && text.match(matchCommandRegex)

              if (match) {
                const matchText = match[1] || ''
                const startMatch = Editor.before(editor, start, {
                  unit: 'character',
                  distance: match[0].length,
                })
                const matchRange =
                  startMatch && Editor.range(editor, startMatch, start)

                setTarget(matchRange)
                setSearch({ type: 'command', text: matchText })
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
                {!(search.type === 'command' && searchOptions.length === 0) && (
                  <Suggestion
                    ref={suggestRef}
                    options={searchOptions}
                    onOptionSelected={option => {
                      if (search.type === 'page') {
                        insertPageLink(editor, {
                          id: option.value as string,
                          text: option.label,
                        })
                      } else if (search.type === 'command') {
                        const command = COMMAND_LIST.find(
                          c => c.label === option.label
                        )!
                        command.exec(editor)
                        if (target) {
                          Transforms.delete(editor, { at: target })
                        }
                      }
                    }}
                    searchText={search.text}
                    escape={() => setTarget(null)}
                  ></Suggestion>
                )}
              </div>
            </Portal>
          )}
        </Slate>
      </EuiText>
      <EditorControlBar />
    </>
  )
}

const Element = props => {
  const { attributes, children, element } = props
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
    case 'check-list-item':
      return <CheckListItem {...props} />
    case 'ul_list':
      return <ul {...attributes}>{children}</ul>
    case 'ol_list':
      return <ol {...attributes}>{children}</ol>

    case 'list_item':
      return <li {...attributes}>{children}</li>
    default:
      return null
  }
}

const initialValue: Node[] = []

function PageEditor() {
  let { pageId } = useParams()
  const navigate = useNavigate()
  const { result: page, loading } = usePromiseAsync(getPage, [pageId], e => {
    console.error(e)
    navigate('/')
  })
  if (!page) return null
  return <PageEditorInner page={page} />
}

export { PageEditor }
