import * as React from 'react'
import { EditorModeProvider } from '../contexts/EditorMode'
import { PageEditor } from '../Editor'

type Props = { children?: any }

function Page(props: Props) {
  return (
    <div>
      <EditorModeProvider>
        <PageEditor></PageEditor>
      </EditorModeProvider>
      {props.children}
    </div>
  )
}

export default Page
