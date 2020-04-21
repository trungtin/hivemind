import {
  EuiComboBoxOptionOption,
  EuiComboBoxOptionsList,
  EuiI18n,
  EuiLoadingChart,
  htmlIdGenerator,
} from '@elastic/eui'
import noop from 'lodash/noop'
import React, {
  forwardRef,
  Fragment,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

type Props = {
  options: EuiComboBoxOptionOption[]
  onOptionSelected: (option: EuiComboBoxOptionOption) => void
  searchText: string
  isLoading?: boolean
  escape: () => void
}

function Suggestion(props: Props, ref) {
  const idRef = useRef(htmlIdGenerator())
  const { isLoading, options, searchText, onOptionSelected } = props

  const [activeOptionIndex, setActiveOptionIndex] = useState(-1)

  const onOptionClick = useCallback(
    (option) => {
      onOptionSelected(option)
    },
    [onOptionSelected]
  )

  // const selectableRef = useRef(null as null | EuiSelectable)
  useImperativeHandle(ref, () => ({
    handleKeyDown: (event) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setActiveOptionIndex(
            activeOptionIndex < options.length - 1 ? activeOptionIndex + 1 : 0
          )
          break
        case 'ArrowUp':
          event.preventDefault()
          setActiveOptionIndex(
            activeOptionIndex > 0 ? activeOptionIndex - 1 : options.length
          )
          break
        case 'Tab':
        case 'Enter':
          event.preventDefault()
          const option = options[activeOptionIndex]
          if (option) {
            onOptionSelected(option)
          }
          break
        case 'Escape':
          event.preventDefault()
          props.escape()
          break
      }
    },
  }))

  let messageContent

  if (isLoading) {
    messageContent = (
      <Fragment>
        <EuiLoadingChart size="m" mono />
        <br />
        <p>
          <EuiI18n
            token="euiSelectable.loadingOptions"
            default="Loading options"
          />
        </p>
      </Fragment>
    )
  } else if (!options.length) {
    messageContent = (
      <p>
        <EuiI18n
          token="euiSelectable.noAvailableOptions"
          default="No options available"
        />
      </p>
    )
  }

  return (
    <div>
      <div
        className="euiSelectable"
        style={{ width: 200 }}
        // onKeyDown={this.onKeyDown}
        // onBlur={this.onContainerBlur}
        // {...rest}
      >
        <EuiComboBoxOptionsList
          activeOptionIndex={activeOptionIndex}
          // areAllOptionsSelected={this.areAllOptionsSelected()}
          // data-test-subj={optionsListDataTestSubj}
          fullWidth
          isLoading={isLoading}
          listRef={noop}
          matchingOptions={options}
          onCloseList={noop}
          // onCreateOption={onCreateOption}
          onOptionClick={onOptionClick}
          onOptionEnterKey={onOptionClick}
          // onScroll={this.onOptionListScroll}
          optionRef={noop}
          options={options}
          position={'bottom'}
          singleSelection
          // renderOption={renderOption}
          rootId={idRef.current}
          // rowHeight={rowHeight}
          scrollToIndex={activeOptionIndex}
          searchValue={searchText}
          selectedOptions={[]}
          updatePosition={noop}
          width={200}
          // delimiter={delimiter}
        />
      </div>
    </div>
  )
}

export default forwardRef(Suggestion)
