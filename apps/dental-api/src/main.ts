import { createApplication } from './bootstrap';
import { resolveListenHost } from './runtime-host';
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4300);

void createApplication().then(app => {
  const host = resolveListenHost(process.env);
  return host ? app.listen(port, host) : app.listen(port);
});
