import { writeFile } from 'node:fs/promises';
import api from '../apps/dental-api/dist/bootstrap.js';
const app = await api.createApplication();
await writeFile('contracts/foundation.openapi.json', JSON.stringify(api.describeApi(app),null,2)+'\n');
await app.close();
console.log('Generated Foundation OpenAPI from NestJS routes. Future draft inventory is unchanged.');
