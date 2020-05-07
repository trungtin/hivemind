import { ConsoleLogger as Logger } from '@aws-amplify/core'
import * as idb from 'idb'
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
import { immerable } from 'immer'
import clone from 'lodash/clone'

const logger = new Logger('DataStore')

const DB_NAME = 'amplify-datastore'

const INITIALIZER = Symbol('initializer')

function* deepIterate(obj, seen = new WeakSet<any>()) {
  if (seen.has(obj)) return
  seen.add(obj)

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        yield* deepIterate(obj[key], seen)
      }
      yield [key, obj[key], obj]
    }
  }
}

class IndexedDBAdapter implements Adapter {
  private schema!: InternalSchema
  private namespaceResolver!: NamespaceResolver
  private modelInstanceCreator!: ModelInstanceCreator
  private getModelConstructorByModelName!: (
    namsespaceName: string,
    modelName: string
  ) => PersistentModelConstructor<any>
  private db!: idb.IDBPDatabase
  private initPromise!: Promise<void>
  private resolve!: (value?: any) => void
  private reject!: (value?: any) => void
  private initializerMap = new WeakMap<object, any>()
  // private populatedCache = new Map<string, any>()

  private async checkPrivate() {
    const isPrivate = await isPrivateMode().then((isPrivate) => {
      return isPrivate
    })
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
    if (!this.initPromise) {
      this.initPromise = new Promise((res, rej) => {
        this.resolve = res
        this.reject = rej
      })
    } else {
      await this.initPromise
    }

    this.schema = theSchema
    this.namespaceResolver = namespaceResolver
    this.modelInstanceCreator = modelInstanceCreator
    this.getModelConstructorByModelName = getModelConstructorByModelName

    try {
      if (!this.db) {
        this.db = await idb.openDB(DB_NAME, 1, {
          upgrade: (db, _oldVersion, _newVersion, _txn) => {
            const keyPath: string = <string>(<keyof PersistentModel>'id')
            Object.keys(theSchema.namespaces).forEach((namespaceName) => {
              const namespace = theSchema.namespaces[namespaceName]

              Object.keys(namespace.models).forEach((modelName) => {
                const indexes = this.schema.namespaces[namespaceName]
                  .relationships![modelName].indexes
                const storeName = this.getStorename(namespaceName, modelName)
                const store = db.createObjectStore(storeName, { keyPath })
                indexes.forEach((index) => store.createIndex(index, index))
              })
            })
          },
        })

        this.resolve()
      }
    } catch (error) {
      this.reject(error)
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
    const tx = this.db.transaction(
      [storeName, ...Array.from(set.values())],
      'readwrite'
    )
    const store = tx.objectStore(storeName)

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
      const store = tx.objectStore(storeName)

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

    await tx.done

    return result
  }

  private async load<T extends { id: string }>(
    namespaceName: string,
    srcModelName: string,
    records: T[]
  ) {
    const namespace = this.schema.namespaces[namespaceName]
    const relations = namespace.relationships![srcModelName].relationTypes
    const connectionStoreNames = relations.map(({ modelName }) => {
      return this.getStorename(namespaceName, modelName)
    })
    const modelConstructor = this.getModelConstructorByModelName(
      namespaceName,
      srcModelName
    )

    // const unpopulated: T[] = []

    // for (let i = 0; i < records.length; i++) {
    //   const item = records[i]
    //   const key = `${srcModelName}/${item.id}`
    //   const exist = this.populatedCache.get(key)

    //   if (!exist) {
    //     this.populatedCache.set(key, item)
    //     unpopulated.push(item)
    //   } else {
    //     records[i] = exist
    //   }
    // }
    const promises: Promise<any>[] = []
    if (connectionStoreNames.length > 0 && records.length > 0) {
      const tx = this.db.transaction([...connectionStoreNames], 'readonly')

      for await (const relation of relations) {
        const { fieldName, modelName, targetName, associatedWith } = relation
        const inverseRelationship = namespace.relationships![
          modelName
        ].relationTypes.find((rel) =>
          relation.relationType === 'HAS_ONE' ||
          relation.relationType === 'HAS_MANY'
            ? rel.relationType === 'BELONGS_TO' &&
              rel.fieldName === associatedWith
            : rel.associatedWith === fieldName
        )
        const storeName = this.getStorename(namespaceName, modelName)
        const store = tx.objectStore(storeName)
        const relationModelConstructor = this.getModelConstructorByModelName(
          namespaceName,
          modelName
        )

        /**
         * Eager load priority:
         * 1. always eager load HAS_MANY relation
         * 2. eager load BELONGS_TO relation only if inverse relation type is HAS_ONE, not HAS_MANY
         * 3. never eager load HAS_ONE
         *
         */
        for (const recordItem of records) {
          switch (relation.relationType) {
            case 'HAS_ONE': {
              if (recordItem[fieldName]) {
                // const key = `${modelName}/${recordItem[fieldName]}`
                let connectionRecord
                // if (this.populatedCache.has(key)) {
                //   connectionRecord = this.populatedCache.get(key)
                // } else {
                connectionRecord = await store.get(recordItem[fieldName])
                // promises.push(
                //   this.load(namespaceName, modelName, [connectionRecord])
                // )
                // }
                this.initializerMap.set(
                  connectionRecord,
                  relationModelConstructor
                )
                // connectionRecord[INITIALIZER] = relationModelConstructor
                recordItem[fieldName] = connectionRecord
              }
              break
            }

            case 'BELONGS_TO': {
              if (recordItem[targetName!]) {
                // const key = `${modelName}/${recordItem[targetName!]}`
                // if (this.populatedCache.has(key)) {
                //   connectionRecord = this.populatedCache.get(key)
                // } else {
                // debugger
                if (inverseRelationship?.relationType === 'HAS_ONE') {
                  let connectionRecord
                  connectionRecord = await store.get(recordItem[targetName!])
                  promises.push(
                    this.load(namespaceName, modelName, [connectionRecord])
                  )
                  this.initializerMap.set(
                    connectionRecord,
                    relationModelConstructor
                  )

                  // connectionRecord[INITIALIZER] = relationModelConstructor
                  recordItem[fieldName] = connectionRecord
                  delete recordItem[targetName!]
                }
                // }
              }
              break
            }

            case 'HAS_MANY': {
              if (inverseRelationship) {
                // const key = `${modelName}/${inverseRelationship.targetName}/${recordItem.id}`
                let records
                // if (this.populatedCache.has(key)) {
                //   records = this.populatedCache.get(key)
                // } else {
                const storeIndex = store.index(inverseRelationship.targetName!)
                records = await storeIndex.getAll(recordItem.id)
                // debugger

                for (const r of records) {
                  this.initializerMap.set(r, relationModelConstructor)
                  // r[INITIALIZER] = relationModelConstructor
                }

                for (const r of records) {
                  const cloned = clone(recordItem)
                  this.initializerMap.set(cloned, modelConstructor)
                  r[inverseRelationship.fieldName] = cloned
                }

                promises.push(this.load(namespaceName, modelName, records))
                // }

                recordItem[fieldName] = records
              }
              break
            }
            default:
              exhaustiveCheck(relation.relationType)
              break
          }
        }
      }
      await tx.done
    }

    await Promise.all(promises).catch(console.error)
    for (const [key, value, obj] of deepIterate(records)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        // value[INITIALIZER] != null
        this.initializerMap.has(value)
      ) {
        const clazz = this.initializerMap.get(value)
        // delete value[INITIALIZER]
        try {
          obj[key] = this.modelInstanceCreator(clazz, value)
          // obj[key][immerable] = true
        } catch (e) {
          debugger
          console.error(e)
        }
      }
    }

    return records.map((record) => {
      try {
        // debugger
        // delete record[INITIALIZER]
        return this.modelInstanceCreator(modelConstructor, record)
      } catch (e) {
        debugger
        console.error(e)
      }
    })
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
            (p) => isPredicateObj(p) && p.field === 'id' && p.operator === 'eq'
          ) as PredicateObject<T>)

        if (idPredicate) {
          const { operand: id } = idPredicate

          const record = <any>await this.db.get(storeName, id)

          if (record) {
            const [x] = await this.load(namespaceName, modelConstructor.name, [
              record,
            ])

            return [x]
          }
          return []
        }

        // TODO: Use indices if possible
        const all = <T[]>await this.db.getAll(storeName)

        const filtered = predicateObjs
          ? all.filter((m) => validatePredicate(m, type, predicateObjs))
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

  private async enginePagination<T extends { id: string }>(
    storeName: string,
    pagination?: PaginationInput
  ): Promise<T[]> {
    let result: T[]

    if (pagination) {
      const { page = 0, limit = 0 } = pagination
      const initialRecord = Math.max(0, page * limit) || 0

      let cursor = await this.db
        .transaction(storeName)
        .objectStore(storeName)
        .openCursor()

      if (initialRecord > 0) {
        await cursor!.advance(initialRecord)
      }

      const pageResults: T[] = []

      const hasLimit = typeof limit === 'number' && limit > 0
      let moreRecords = true
      let itemsLeft = limit
      while (moreRecords && cursor && cursor.value) {
        pageResults.push(cursor.value)

        cursor = await cursor.continue()

        if (hasLimit) {
          itemsLeft--
          moreRecords = itemsLeft > 0 && cursor !== null
        } else {
          moreRecords = cursor !== null
        }
      }

      result = pageResults
    } else {
      result = <T[]>await this.db.getAll(storeName)
    }

    return result
  }

  async queryOne<T extends PersistentModel>(
    modelConstructor: PersistentModelConstructor<T>,
    firstOrLast: QueryOne = QueryOne.FIRST
  ): Promise<T | undefined> {
    await this.checkPrivate()
    const storeName = this.getStorenameForModel(modelConstructor)

    const cursor = await this.db
      .transaction([storeName], 'readonly')
      .objectStore(storeName)
      .openCursor(undefined, firstOrLast === QueryOne.FIRST ? 'next' : 'prev')

    const result = cursor ? <T>cursor.value : undefined

    return result && this.modelInstanceCreator(modelConstructor, result)
  }

  async delete<T extends PersistentModel>(
    modelOrModelConstructor: T | PersistentModelConstructor<T>,
    condition?: ModelPredicate<T>
  ): Promise<[T[], T[]]> {
    await this.checkPrivate()
    const deleteQueue: { storeName: string; items: T[] }[] = []

    if (isModelConstructor(modelOrModelConstructor)) {
      const modelConstructor = modelOrModelConstructor as PersistentModelConstructor<
        T
      >
      const nameSpace = this.namespaceResolver(modelConstructor)

      const storeName = this.getStorenameForModel(modelConstructor)

      const models = await this.query(modelConstructor, condition)
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

        return [models, deletedModels]
      } else {
        await this.deleteTraverse(
          relations,
          models,
          modelConstructor.name,
          nameSpace,
          deleteQueue
        )

        // Delete all
        await this.db
          .transaction([storeName], 'readwrite')
          .objectStore(storeName)
          .clear()

        const deletedModels = deleteQueue.reduce(
          (acc, { items }) => acc.concat(items),
          <T[]>[]
        )

        return [models, deletedModels]
      }
    } else {
      const model = modelOrModelConstructor as T

      const modelConstructor = Object.getPrototypeOf(model)
        .constructor as PersistentModelConstructor<T>
      const nameSpace = this.namespaceResolver(modelConstructor)

      const storeName = this.getStorenameForModel(modelConstructor)

      if (condition) {
        const tx = this.db.transaction([storeName], 'readwrite')
        const store = tx.objectStore(storeName)

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
        await tx.done

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
    deleteQueue?: { storeName: string; items: T[] | IDBValidKey[] }[]
  ) {
    const connectionStoreNames = deleteQueue!.map(({ storeName }) => {
      return storeName
    })

    const tx = this.db.transaction([...connectionStoreNames], 'readwrite')
    for await (const deleteItem of deleteQueue!) {
      const { storeName, items } = deleteItem
      const store = tx.objectStore(storeName)

      for await (const item of items) {
        if (item) {
          if (typeof item === 'object') {
            await store.delete(item['id'])
          }
          await store.delete(item.toString())
        }
      }
    }
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
            const index = getIndex(
              this.schema.namespaces[nameSpace].relationships![modelName]
                .relationTypes,
              srcModel
            )
            const recordToDelete = <T>(
              await this.db
                .transaction(storeName, 'readwrite')
                .objectStore(storeName)
                .index(index)
                .get(model.id)
            )

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
            const childrenArray = await this.db
              .transaction(storeName, 'readwrite')
              .objectStore(storeName)
              .index(index)
              .getAll(model['id'])

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
      items: models.map((record) =>
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

    await idb.deleteDB(DB_NAME)

    this.db = undefined as any
    this.initPromise = undefined as any
  }
}

export default new IndexedDBAdapter()
