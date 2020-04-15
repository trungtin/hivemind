// @ts-check
import { initSchema } from '@aws-amplify/datastore';
import { schema } from './schema';



const { Page, Block } = initSchema(schema);

export {
  Page,
  Block
};