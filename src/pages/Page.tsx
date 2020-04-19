import * as React from 'react'
import { PageEditor } from '../Editor'

type Props = { children?: any }

function Page(props: Props) {
  return (
    <div>
      <PageEditor></PageEditor>
      {props.children}
    </div>
  )
}

export default Page
