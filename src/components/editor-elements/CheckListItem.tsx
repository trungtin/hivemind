import * as React from 'react'
import { useEditor, useReadOnly, ReactEditor } from 'slate-react'
import { htmlIdGenerator } from '@elastic/eui'
import { Transforms } from 'slate'
import cx from 'classnames'

export function CheckListItem({ attributes, children, element }) {
  const idRef = React.useRef(htmlIdGenerator())
  const editor = useEditor()
  const readOnly = useReadOnly()
  const { checked, disabled } = element
  const id = idRef.current()

  function setChecked(checked: boolean) {
    const path = ReactEditor.findPath(editor, element)
    Transforms.setNodes(editor, { checked: checked }, { at: path })
  }
  return (
    <div {...attributes} className="euiCheckbox">
      <input
        className="euiCheckbox__input"
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.tagName === 'LABEL') {
            event.preventDefault()
            return
          }
          setChecked(checked)
        }}
      />
      {/* https://github.com/ianstormtaylor/slate/issues/3421 */}
      <div
        contentEditable={false}
        className="euiCheckbox__square z-50 cursor-pointer select-none"
        onClick={() => setChecked(!checked)}
      />
      <label
        htmlFor={id}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        className={cx(
          'euiCheckbox__label focus:outline-none cursor-text',
          checked && 'line-through'
        )}
      >
        {children}
      </label>
    </div>
  )
}
