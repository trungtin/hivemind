import * as React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { coreServices } from '../services/core'
import { EuiBasicTable, EuiBasicTableColumn } from '@elastic/eui'
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
  const navigate = useNavigate()
  if (!allPages) return null
  const columns: EuiBasicTableColumn<any>[] = [
    {
      field: 'title',
      name: 'Title',
      render: (content, row) => {
        return (
          <Link className="euiLink" to={`/page/${row.id}`}>
            {content}
          </Link>
        )
      },
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
