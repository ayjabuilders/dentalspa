import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const css=readFileSync(new URL('../packages/design-tokens/pearl.css',import.meta.url),'utf8');
const parse=source=>Object.fromEntries([...source.matchAll(/--ds-([\w-]+):\s*(#[a-f\d]{6}|#[a-f\d]{3})/gi)].map(m=>[m[1],m[2]]));
const light=parse(css.match(/\[data-ds="pearl"\]\s*\{([^}]+)\}/)[1]);
const dark={...light,...parse(css.match(/\[data-ds="pearl"\]\[data-theme="dark"\]\s*\{([^}]+)\}/)[1])};
function luminance(hex){if(hex.length===4)hex='#'+[...hex.slice(1)].map(c=>c+c).join('');const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;}
for(const [theme,tokens] of Object.entries({light,dark}))for(const [front,back,min] of [['ink','surface',4.5],['muted','canvas',4.5],['primary','surface',4.5],['primary','soft',4.5],['on-primary','primary',4.5],['on-danger','danger',4.5],['success','mint',4.5],['warning','warning-bg',4.5],['danger','danger-bg',4.5],['border','surface',3],['focus','surface',3]]){
 const a=luminance(tokens[front]),b=luminance(tokens[back]);const ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);assert.ok(ratio>=min,`${theme} ${front}/${back}: ${ratio} below ${min}`);console.log(`${theme} ${front}/${back}: ${ratio.toFixed(2)} >= ${min}`);
}
