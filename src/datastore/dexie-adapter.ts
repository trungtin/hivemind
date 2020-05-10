import { ConsoleLogger as Logger } from '@aws-amplify/core'
import Dexie from 'dexie'
import { Adapter } from '@aws-amplify/datastore/lib-esm/storage/adapter'
import { ModelInstanceCreator } from '@aws-amplify/datastore/lib-esm/datastore/datastore'
import { ModelPredicateCreator } from '@aws-amplify/datastore/lib-esm/predicates'
import {
  InternalSchema,
  isPredicateObj,
  ModelPredicate,
  NamespaceResolver,
  OpType,
  PersistentModel,
  PersistentModelConstructor,
  PredicateObject,
  QueryOne,
  RelationType,
  PaginationInput,
} from '@aws-amplify/datastore/lib-esm/types'
import {
  exhaustiveCheck,
  getIndex,
  isModelConstructor,
  traverseModel,
  validatePredicate,
  isPrivateMode,
} from '@aws-amplify/datastore/lib-esm/util'

const logger = new Logger('DataStore')

const DB_NAME = 'amplify-datastore'

class DexieAdapter implements Adapter {
  private schema!: InternalSchema
  private namespaceResolver!: NamespaceResolver
  private modelInstanceCreator!: ModelInstanceCreator
  private getModelConstructorByModelName!: (
    namsespaceName: string,
    modelName: string
  ) => PersistentModelConstructor<any>
  private db!: Dexie
  private resolve!: (value?: any) => void
  private reject!: (value?: any) => void

  private async checkPrivate() {
    const isPrivate = await isPrivateMode()
    if (isPrivate) {
      logger.error("IndexedDB not supported in this browser's private mode")
      return Promise.reject(
        "IndexedDB not supported in this browser's private mode"
      )
    } else {
      return Promise.resolve()
    }
  }

  private getStorenameForModel(
    modelConstructor: PersistentModelConstructor<any>
  ) {
    const namespace = this.namespaceResolver(modelConstructor)
    const { name: modelName } = modelConstructor

    return this.getStorename(namespace, modelName)
  }

  private getStorename(namespace: string, modelName: string) {
    const storeName = `${namespace}_${modelName}`

    return storeName
  }

  async setUp(
    theSchema: InternalSchema,
    namespaceResolver: NamespaceResolver,
    modelInstanceCreator: ModelInstanceCreator,
    getModelConstructorByModelName: (
      namsespaceName: string,
      modelName: string
    ) => PersistentModelConstructor<any>
  ) {
    await this.checkPrivate()

    this.schema = theSchema
    this.namespaceResolver = namespaceResolver
    this.modelInstanceCreator = modelInstanceCreator
    this.getModelConstructorByModelName = getModelConstructorByModelName

    // {
    //   upgrade: (db, _oldVersion, _newVersion, _txn) => {
    //     const keyPath: string = <string>(<keyof PersistentModel>'id')
    //     Object.keys(theSchema.namespaces).forEach((namespaceName) => {
    //       const namespace = theSchema.namespaces[namespaceName]

    //       Object.keys(namespace.models).forEach((modelName) => {
    //         const indexes = this.schema.namespaces[namespaceName]
    //           .relationships[modelName].indexes
    //         const storeName = this.getStorename(namespaceName, modelName)
    //         const store = db.createObjectStore(storeName, { keyPath })
    //         indexes.forEach((index) => store.createIndex(index, index))
    //       })
    //     })
    //   },
    // }

    if (!this.db) {
      this.db = new Dexie(DB_NAME)
    }
  }

  async save<T extends PersistentModel>(
    model: T,
    condition?: ModelPredicate<T>
  ): Promise<[T, OpType.INSERT | OpType.UPDATE][]> {
    await this.checkPrivate()
    const modelConstructor = Object.getPrototypeOf(model)
      .constructor as PersistentModelConstructor<T>
    const storeName = this.getStorenameForModel(modelConstructor)
    const connectedModels = traverseModel(
      modelConstructor.name,
      model,
      this.schema.namespaces[this.namespaceResolver(modelConstructor)],
      this.modelInstanceCreator,
      this.getModelConstructorByModelName
    )
    const namespaceName = this.namespaceResolver(modelConstructor)

    const set = new Set<string>()
    const connectionStoreNames = Object.values(connectedModels).map(
      ({ modelName, item, instance }) => {
        const storeName = this.getStorename(namespaceName, modelName)
        set.add(storeName)
        return { storeName, item, instance }
      }
    )
    return await this.db.transaction(
      'rw',
      [storeName, ...Array.from(set.values())].map(n => this.db[n]),
      async tx => {
        const store = tx.table(storeName)

        const fromDB = await store.get(model.id)

        if (condition) {
          const predicates = ModelPredicateCreator.getPredicates(condition)
          const { predicates: predicateObjs, type } = predicates

          const isValid = validatePredicate(fromDB, type, predicateObjs)

          if (!isValid) {
            const msg = 'Conditional update failed'
            logger.error(msg, { model: fromDB, condition: predicateObjs })

            throw new Error(msg)
          }
        }

        const result: [T, OpType.INSERT | OpType.UPDATE][] = []

        for await (const resItem of connectionStoreNames) {
          const { storeName, item, instance } = resItem
          const store = tx.table(storeName)

          const { id } = item

          const opType: OpType =
            (await store.get(id)) === undefined ? OpType.INSERT : OpType.UPDATE

          // It is me
          if (id === model.id) {
            await store.put(item)

            result.push([instance, opType])
          } else {
            if (opType === OpType.INSERT) {
              await store.put(item)

              result.push([instance, opType])
            }
          }
        }
        return result
      }
    )
  }

  private async load<T>(
    namespaceName: string,
    srcModelName: string,
    records: T[]
  ): Promise<T[]> {
    const namespace = this.schema.namespaces[namespaceName]
    const relations = namespace.relationships![srcModelName].relationTypes
    const connectionStoreNames = relations.map(({ modelName }) => {
      return this.getStorename(namespaceName, modelName)
    })
    const modelConstructor = this.getModelConstructorByModelName(
      namespaceName,
      srcModelName
    )

    if (connectionStoreNames.length === 0) {
      return records.map(record =>
        this.modelInstanceCreator(modelConstructor, record)
      )
    }

    await this.db.transaction('r', [...connectionStoreNames], async tx => {
      for await (const relation of relations) {
        const { fieldName, modelName, targetName } = relation
        const storeName = this.getStorename(namespaceName, modelName)
        const store = tx.table(storeName)
        const modelConstructor = this.getModelConstructorByModelName(
          namespaceName,
          modelName
        )

        switch (relation.relationType) {
          case 'HAS_ONE':
            for await (const recordItem of records) {
              if (recordItem[fieldName]) {
                const connectionRecord = await store.get(recordItem[fieldName])

                recordItem[fieldName] =
                  connectionRecord &&
                  this.modelInstanceCreator(modelConstructor, connectionRecord)
              }
            }

            break
          case 'BELONGS_TO':
            if (!targetName) {
              const msg = 'Invalid BELONGS_TO relation'
              logger.error(msg)
              throw new Error(msg)
            }
            for await (const recordItem of records) {
              if (recordItem[targetName]) {
                const connectionRecord = await store.get(recordItem[targetName])

                recordItem[fieldName] =
                  connectionRecord &&
                  this.modelInstanceCreator(modelConstructor, connectionRecord)
                delete recordItem[targetName]
              }
            }

            break
          case 'HAS_MANY':
            // TODO: Lazy loading
            break
          default:
            exhaustiveCheck(relation.relationType)
            break
        }
      }
    })

    return records.map(record =>
      this.modelInstanceCreator(modelConstructor, record)
    )
  }

  async query<T extends PersistentModel>(
    modelConstructor: PersistentModelConstructor<T>,
    predicate?: ModelPredicate<T>,
    pagination?: PaginationInput
  ): Promise<T[]> {
    await this.checkPrivate()
    const storeName = this.getStorenameForModel(modelConstructor)
    const namespaceName = this.namespaceResolver(modelConstructor)

    if (predicate) {
      const predicates = ModelPredicateCreator.getPredicates(predicate)
      if (predicates) {
        const { predicates: predicateObjs, type } = predicates
        const idPredicate =
          predicateObjs.length === 1 &&
          (predicateObjs.find(
            p => isPredicateObj(p) && p.field === 'id' && p.operator === 'eq'
          ) as PredicateObject<T>)

        if (idPredicate) {
          const { operand: id } = idPredicate

          const record = (await this.db[storeName].get(id)) as any

          if (record) {
            const [x] = await this.load(namespaceName, modelConstructor.name, [
              record,
            ])

            return [x]
          }
          return []
        }

        // TODO: Use indices if possible
        const all = (await this.db[storeName].toArray()) as T[]

        const filtered = predicateObjs
          ? all.filter(m => validatePredicate(m, type, predicateObjs))
          : all

        return await this.load(
          namespaceName,
          modelConstructor.name,
          this.inMemoryPagination(filtered, pagination)
        )
      }
    }

    return await this.load(
      namespaceName,
      modelConstructor.name,
      await this.enginePagination(storeName, pagination)
    )
  }

  private inMemoryPagination<T>(
    records: T[],
    pagination?: PaginationInput
  ): T[] {
    if (pagination) {
      const { page = 0, limit = 0 } = pagination
      const start = Math.max(0, page * limit) || 0

      const end = limit > 0 ? start + limit : records.length

      return records.slice(start, end)
    }

    return records
  }

  private async enginePagination<T>(
    storeName,
    pagination?: PaginationInput
  ): Promise<T[]> {
    let result: T[]

    if (pagination) {
      const { page = 0, limit = 0 } = pagination
      const initialRecord = Math.max(0, page * limit) || 0

      result = (await this.db[storeName].offset(initialRecord).limit(limit)
        .toArray) as T[]
    } else {
      result = (await this.db[storeName].toArray()) as T[]
    }

    return result
  }

  async queryOne<T extends PersistentModel>(
    modelConstructor: PersistentModelConstructor<T>,
    firstOrLast: QueryOne = QueryOne.FIRST
  ): Promise<T | undefined> {
    await this.checkPrivate()
    const storeName = this.getStorenameForModel(modelConstructor)

    const result = await this.db[storeName][
      firstOrLast === QueryOne.FIRST ? 'first' : 'last'
    ]()

    return result && this.modelInstanceCreator(modelConstructor, result)
  }

  async delete<T extends PersistentModel>(
    modelOrModelConstructor: T | PersistentModelConstructor<T>,
    condition?: ModelPredicate<T>
  ): Promise<[T[], T[]]> {
    await this.checkPrivate()
    const deleteQueue: { storeName: string; items: T[] }[] = []

    if (isModelConstructor(modelOrModelConstructor)) {
      const modelConstructor = modelOrModelConstructor
      const nameSpace = this.namespaceResolver(modelConstructor)

      const storeName = this.getStorenameForModel(modelConstructor)

      const models = await this.query(modelConstructor, condition as any)
      const relations = this.schema.namespaces[nameSpace].relationships![
        modelConstructor.name
      ].relationTypes

      if (condition !== undefined) {
        await this.deleteTraverse(
          relations,
          models,
          modelConstructor.name,
          nameSpace,
          deleteQueue
        )

        await this.deleteItem(deleteQueue)

        const deletedModels = deleteQueue.reduce(
          (acc, { items }) => acc.concat(items),
          <T[]>[]
        )

        return [models as any, deletedModels]
      } else {
        await this.deleteTraverse(
          relations,
          models,
          modelConstructor.name,
          nameSpace,
          deleteQueue
        )

        // Delete all
        await this.db.transaction('rw', [storeName], async tx => {
          return tx.table(storeName).clear()
        })

        const deletedModels = deleteQueue.reduce(
          (acc, { items }) => acc.concat(items),
          <T[]>[]
        )

        return [models as any, deletedModels]
      }
    } else {
      const model = modelOrModelConstructor as T

      const modelConstructor = Object.getPrototypeOf(model)
        .constructor as PersistentModelConstructor<T>
      const nameSpace = this.namespaceResolver(modelConstructor)

      const storeName = this.getStorenameForModel(modelConstructor)

      if (condition) {
        await this.db.transaction('rw', [storeName], async tx => {
          const store = tx.table(storeName)

          const fromDB = await store.get(model.id)

          if (fromDB === undefined) {
            const msg = 'Model instance not found in storage'
            logger.warn(msg, { model })

            return [[model], []]
          }

          const predicates = ModelPredicateCreator.getPredicates(condition)
          const { predicates: predicateObjs, type } = predicates

          const isValid = validatePredicate(fromDB, type, predicateObjs)

          if (!isValid) {
            const msg = 'Conditional update failed'
            logger.error(msg, { model: fromDB, condition: predicateObjs })

            throw new Error(msg)
          }
        })
        const relations = this.schema.namespaces[nameSpace].relationships![
          modelConstructor.name
        ].relationTypes
        await this.deleteTraverse(
          relations,
          [model],
          modelConstructor.name,
          nameSpace,
          deleteQueue
        )
      } else {
        const relations = this.schema.namespaces[nameSpace].relationships![
          modelConstructor.name
        ].relationTypes

        await this.deleteTraverse(
          relations,
          [model],
          modelConstructor.name,
          nameSpace,
          deleteQueue
        )
      }

      await this.deleteItem(deleteQueue)

      const deletedModels = deleteQueue.reduce(
        (acc, { items }) => acc.concat(items),
        <T[]>[]
      )

      return [[model], deletedModels]
    }
  }

  private async deleteItem<T extends PersistentModel>(
    deleteQueue: { storeName: string; items: T[] | IDBValidKey[] }[]
  ) {
    const connectionStoreNames = deleteQueue.map(({ storeName }) => {
      return storeName
    })

    await this.db.transaction('rw', [...connectionStoreNames], async tx => {
      for await (const deleteItem of deleteQueue) {
        const { storeName, items } = deleteItem
        const store = tx[storeName]

        for await (const item of items) {
          if (item) {
            if (typeof item === 'object') {
              await store.delete(item['id'])
            }
            await store.delete(item.toString())
          }
        }
      }
    })
  }

  private async deleteTraverse<T extends PersistentModel>(
    relations: RelationType[],
    models: T[],
    srcModel: string,
    nameSpace: string,
    deleteQueue: { storeName: string; items: T[] }[]
  ): Promise<void> {
    for await (const rel of relations) {
      const { relationType, fieldName, modelName } = rel
      const storeName = this.getStorename(nameSpace, modelName)
      switch (relationType) {
        case 'HAS_ONE':
          for await (const model of models) {
            // const index = getIndex(
            //   this.schema.namespaces[nameSpace].relationships![modelName]
            //     .relationTypes,
            //   srcModel
            // )
            const recordToDelete = (await this.db.transaction(
              'rw',
              storeName,
              async tx => {
                const store = tx.table(storeName)
                return (
                  store
                    // .index(index)
                    .get(model.id)
                )
              }
            )) as T

            await this.deleteTraverse(
              this.schema.namespaces[nameSpace].relationships![modelName]
                .relationTypes,
              recordToDelete ? [recordToDelete] : [],
              modelName,
              nameSpace,
              deleteQueue
            )
          }
          break
        case 'HAS_MANY':
          const index = getIndex(
            this.schema.namespaces[nameSpace].relationships![modelName]
              .relationTypes,
            srcModel
          )
          for await (const model of models) {
            const childrenArray = await this.db.transaction(
              'rw',
              storeName,
              async tx => {
                return tx
                  .table(storeName)
                  .where(index)
                  .equals(model['id'])
                  .toArray()
              }
            )

            await this.deleteTraverse(
              this.schema.namespaces[nameSpace].relationships![modelName]
                .relationTypes,
              childrenArray,
              modelName,
              nameSpace,
              deleteQueue
            )
          }
          break
        case 'BELONGS_TO':
          // Intentionally blank
          break
        default:
          exhaustiveCheck(relationType)
          break
      }
    }

    deleteQueue.push({
      storeName: this.getStorename(nameSpace, srcModel),
      items: models.map(record =>
        this.modelInstanceCreator(
          this.getModelConstructorByModelName(nameSpace, srcModel),
          record
        )
      ),
    })
  }

  async clear(): Promise<void> {
    await this.checkPrivate()

    this.db.close()

    await Dexie.delete(DB_NAME)

    this.db = undefined as any
  }
}

export default new DexieAdapter()
