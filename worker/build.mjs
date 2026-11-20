import {mkdir,readFile,writeFile} from 'node:fs/promises';
const types={'index.html':'text/html; charset=utf-8','app.js':'text/javascript','usage.js':'text/javascript; charset=utf-8','i18n.js':'text/javascript; charset=utf-8','classroom.jpg':'image/jpeg','room.js':'text/javascript','multiplayer.js':'text/javascript','style.css':'text/css','ambient-rain.mp3':'audio/mpeg'};
const assets={};for(const [name,type] of Object.entries(types))assets['/'+name]=[type,(await readFile(new URL('../public/'+name,import.meta.url))).toString('base64')];assets['/']=assets['/index.html'];
await mkdir(new URL('../dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/server/index.js',import.meta.url),'const assets='+JSON.stringify(assets)+';\n'+(await readFile(new URL('media.mjs',import.meta.url),'utf8')).replaceAll('export ','')+'\n'+(await readFile(new URL('index.mjs',import.meta.url),'utf8')).replace(/import \{resolveMedia,validEmbed\} from '.\/media.mjs';\n/,''));
console.log('Built Worker with embedded classroom assets.');
