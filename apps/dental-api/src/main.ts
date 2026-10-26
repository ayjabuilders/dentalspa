import { createApplication } from './bootstrap';
void createApplication().then(app => app.listen(Number(process.env.API_PORT ?? 4300), '127.0.0.1'));
