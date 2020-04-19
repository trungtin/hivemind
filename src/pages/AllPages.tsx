import * as React from 'react'
import { coreServices } from '../services/core'
import { EuiBasicTable } from '@elastic/eui'
type Props = {}

const useAllPages = () => {
  const [allPages, setAllPages] = React.useState(null as null | any[])
  const [error, setError] = React.useState(null)
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const allPages = await coreServices.allPages()
        setAllPages(allPages)
      } catch (error) {
        setError(error)
      }
    }
    fetchData()
  }, [])
  return { allPages, error }
}

function AllPages(props: Props) {
  const { allPages } = useAllPages()
  if (!allPages) return null
  const columns = [
    {
      field: 'title',
      name: 'Title',
    },
  ]
  return (
    <div>
      <EuiBasicTable
        items={allPages}
        itemId="id"
        columns={columns}
        // pagination={pagination}
        // sorting={sorting}
        isSelectable={true}
        // selection={selection}
        // onChange={this.onTableChange}
      />
    </div>
  )
}

export default AllPages
