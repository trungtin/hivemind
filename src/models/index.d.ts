import { ModelInit, MutableModel, PersistentModelConstructor } from "@aws-amplify/datastore";





export declare class Page {
  readonly id: string;
  readonly title?: string;
  readonly rootBlock: Block;
  constructor(init: ModelInit<Page>);
  static copyOf(source: Page, mutator: (draft: MutableModel<Page>) => MutableModel<Page> | void): Page;
}

export declare class Block {
  readonly id: string;
  readonly type: string;
  readonly json: string;
  readonly page?: Page;
  readonly parent?: Block;
  readonly children: Block[];
  constructor(init: ModelInit<Block>);
  static copyOf(source: Block, mutator: (draft: MutableModel<Block>) => MutableModel<Block> | void): Block;
}