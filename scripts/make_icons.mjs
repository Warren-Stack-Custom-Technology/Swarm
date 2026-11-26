// Optional asset regeneration. Requires @napi-rs/canvas as a development tool.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const canvasPath = process.env.SWARM_CANVAS_MODULE || '@napi-rs/canvas';
const {createCanvas,loadImage} = require(canvasPath);
const directory = new URL('../public/', import.meta.url);
const svg = await readFile(new URL('swarm-mark-v2.svg',directory));
const image=await loadImage(svg);
const icons=new Map();
for(const size of [32,48,180,192,512]){
 const canvas=createCanvas(size,size),context=canvas.getContext('2d');context.drawImage(image,0,0,size,size);
 icons.set(size,canvas.toBuffer('image/png'));
 if(size===180)await writeFile(new URL('apple-touch-icon.png',directory),icons.get(size));
 if(size===192||size===512)await writeFile(new URL(`swarm-${size}-v2.png`,directory),icons.get(size));
}
const entries=[32,48];const header=Buffer.alloc(6+entries.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(entries.length,4);
let offset=header.length;
for(let i=0;i<entries.length;i++){const size=entries[i],position=6+i*16,png=icons.get(size);header[position]=size;header[position+1]=size;header.writeUInt16LE(1,position+4);header.writeUInt16LE(32,position+6);header.writeUInt32LE(png.length,position+8);header.writeUInt32LE(offset,position+12);offset+=png.length}
await writeFile(new URL('favicon.ico',directory),Buffer.concat([header,...entries.map(size=>icons.get(size))]));
console.log('Generated Swarm icons in '+fileURLToPath(directory));
