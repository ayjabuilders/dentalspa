import { writeFile } from 'node:fs/promises';
import { createApplication, describeApi } from '../apps/dental-api/dist/bootstrap.js';
const app = await createApplication();
await writeFile('contracts/foundation.openapi.json', JSON.stringify(describeApi(app),null,2)+'\n');
await app.close();
console.log('Generated Foundation OpenAPI from NestJS routes. Future draft inventory is unchanged.');
