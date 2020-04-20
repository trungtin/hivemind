import * as React from 'react'

type WritingMode = 'text' | 'todo'

export const EditorModeContext = React.createContext({
  writingMode: 'text' as WritingMode,
  setWritingMode(m: WritingMode) {
    this.writingMode = m
  },
})

export function EditorModeProvider(props: { children: React.ReactNode }) {
  const [editorMode, setEditorMode] = React.useState({
    writingMode: 'text' as WritingMode,
    setWritingMode(writingMode: WritingMode) {
      setEditorMode({
        ...editorMode,
        writingMode,
      })
    },
  })

  return (
    <EditorModeContext.Provider value={editorMode}>
      {props.children}
    </EditorModeContext.Provider>
  )
}
