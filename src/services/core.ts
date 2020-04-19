import { DataStore, Predicates } from '@aws-amplify/datastore'
import { Page } from '../models'

export const coreServices = {
  allPages: async (page?: number, limit?: number) => {
    const pages = await DataStore.query(Page, Predicates.ALL, {
      page,
      limit: limit! > -1 ? limit : 10,
    })
    return pages
  },
}
