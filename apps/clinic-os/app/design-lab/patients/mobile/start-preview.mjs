import {mkdirSync,writeFileSync,copyFileSync,openSync,existsSync,symlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('.',import.meta.url)),clinic=resolve(root,'../../../..'),runtime=resolve(clinic,'../../.local/pearl-mobile-runtime');
const port=Number(process.argv[2]||4216);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose a valid unprivileged port.');
await new Promise((ok,fail)=>{const server=createServer();server.once('error',()=>fail(Error(`Port ${port} occupied; keep that service running and choose a free port.`)));server.listen(port,'127.0.0.1',()=>server.close(ok));});
const files={
 'package.json':JSON.stringify({name:'pearl-mobile-local-preview',private:true}),
 'next.config.mjs':"export default {distDir:'.next-mobile-runtime',poweredByHeader:false,devIndicators:false};",
 'app/design-lab/patients/mobile/page.tsx':"export { default } from '../../../../../../apps/clinic-os/app/design-lab/patients/mobile/page';",
 'app/layout.tsx':"import './runtime.css'; export const viewport={width:'device-width',initialScale:1,viewportFit:'cover'};export const metadata={title:'Pearl Mobile · Pilote Cabinet'};export default function Layout({children}:{children:React.ReactNode}){return <html lang=\"fr\"><body>{children}</body></html>;}",
 'app/runtime.css':"@font-face{font-family:Manrope;src:url('/assets/Manrope-Variable.ttf') format('truetype');font-weight:200 800;font-display:swap}@font-face{font-family:'DM Sans';src:url('/assets/DMSans-Variable.ttf') format('truetype');font-weight:100 1000;font-display:swap}body{margin:0}button,input,select{font:inherit}button{cursor:pointer}svg{flex-shrink:0}"
};
for(const [name,content] of Object.entries(files)){const target=join(runtime,name);mkdirSync(resolve(target,'..'),{recursive:true});writeFileSync(target,content);}
mkdirSync(join(runtime,'public/assets'),{recursive:true});
for(const name of ['Manrope-Variable.ttf','DMSans-Variable.ttf','Manrope-OFL.txt','DMSans-OFL.txt'])copyFileSync(join(clinic,'public/assets',name),join(runtime,'public/assets',name));
if(!existsSync(join(runtime,'node_modules')))symlinkSync(join(clinic,'node_modules'),join(runtime,'node_modules'),'junction');
const child=spawn(process.execPath,[join(clinic,'node_modules/next/dist/bin/next'),'dev','--webpack','--port',String(port),'--hostname','127.0.0.1'],{cwd:runtime,windowsHide:true,detached:true,stdio:['ignore',openSync(join(runtime,'server.log'),'a'),openSync(join(runtime,'server-error.log'),'a')]});child.unref();console.log(`Pilot started: http://127.0.0.1:${port}/design-lab/patients/mobile (PID ${child.pid}). No existing service stopped.`);
