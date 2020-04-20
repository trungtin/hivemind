import * as React from 'react'
import {
  EuiControlBar,
  EuiLink,
  EuiPopover,
  EuiContextMenu,
  EuiIcon,
} from '@elastic/eui'
type Props = {}

function flattenPanelTree(tree, array = [] as any[]) {
  array.push(tree)

  if (tree.items) {
    tree.items.forEach((item) => {
      if (item.panel) {
        flattenPanelTree(item.panel, array)
        item.panel = item.panel.id
      }
    })
  }

  return array
}

function EditorControlBar(props: Props) {
  const [isPopoverOpen, setPopover] = React.useState(false)
  const closePopover = () => {
    setPopover(false)
  }
  const button = (
    <EuiLink onClick={() => setPopover(!isPopoverOpen)}>
      Normal Mode <EuiIcon type="arrowUp" size="m" aria-hidden="true" />
    </EuiLink>
  )

  const panels = [
    {
      id: 0,
      items: [
        {
          name: 'Normal Mode',
          // icon: <EuiIcon type="search" size="m" />,
          onClick: () => {
            closePopover()
          },
        },
        {
          name: 'TODO Mode',
          onClick: () => {
            closePopover()
          },
        },
      ],
    },
  ]

  const controls = [
    {
      controlType: 'spacer' as const,
    },
    // {
    //   controlType: 'icon',
    //   id: 'controls_icon',
    //   iconType: 'flag',
    // },
    {
      controlType: 'divider' as const,
    },
    {
      id: 'editor-mode-control',
      controlType: 'text' as const,
      text: (
        <EuiPopover
          id="contextMenuDynamic"
          button={button}
          isOpen={isPopoverOpen}
          closePopover={closePopover}
          panelPaddingSize="none"
          withTitle
          anchorPosition="upRight"
        >
          <EuiContextMenu initialPanelId={0} panels={panels} />
        </EuiPopover>
      ),
    },
    // {
    //   controlType: 'icon',
    //   id: 'controls_icon_button',
    //   iconType: 'bell',
    //   onClick: soundTheAlarms,
    //   color: 'primary',
    //   'aria-label': 'Bell',
    // },
    // {
    //   controlType: 'divider',
    // },
    // {
    //   controlType: 'text',
    //   id: 'controls_text',
    //   text: 'Some text',
    // },
    // {
    //   controlType: 'divider',
    // },
    // {
    //   controlType: 'tab',
    //   id: 'controls_tab',
    //   label: 'Tab',
    //   onClick: () => {},
    // },
    // {
    //   controlType: 'divider',
    // },
    // {
    //   controlType: 'text',
    //   id: 'some_text',
    //   text: <EuiLink>A sample link</EuiLink>,
    // },
    // {
    //   controlType: 'spacer',
    // },
    // {
    //   controlType: 'breadcrumbs',
    //   id: 'controls_breadcrumbs',
    //   breadcrumbs: [
    //     {
    //       text: 'Breadcrumbs',
    //     },
    //     {
    //       text: 'Item',
    //     },
    //   ],
    // },
  ]
  return (
    <div>
      <EuiControlBar controls={controls} showOnMobile />
    </div>
  )
}

export default EditorControlBar
