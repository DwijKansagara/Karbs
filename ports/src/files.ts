export interface Attachment {name:string;mime:string;data:string}
const TEXT=new Set(['txt','md','json','csv','js','ts','py','rs','html','css','yaml','yml','toml','log']);
export function mimeFor(name:string):string|null{const e=name.split('.').pop()?.toLowerCase()??'';return TEXT.has(e)?'text/plain':({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',gif:'image/gif'} as Record<string,string>)[e]??null;}
export function encode(bytes:Uint8Array):string{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export async function prepare(name:string,bytes:Uint8Array):Promise<Attachment>{
 if(bytes.length>8*1024*1024)throw new Error('Each file must be 8 MB or smaller.');let mime=mimeFor(name);if(!mime)throw new Error('Choose text, PNG, JPEG, WebP, GIF or PDF files.');
 if(mime==='image/gif'){
  const blob=new Blob([bytes.slice().buffer],{type:mime});const bitmap=await createImageBitmap(blob);try{const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;if(c.width*c.height>20_000_000)throw new Error('GIF dimensions are too large.');c.getContext('2d')!.drawImage(bitmap,0,0);const png=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Cannot convert this GIF.')),'image/png'));bytes=new Uint8Array(await png.arrayBuffer());name=name.replace(/\.gif$/i,'-first-frame.png');mime='image/png';if(bytes.length>8*1024*1024)throw new Error('Converted GIF exceeds 8 MB.');}finally{bitmap.close();}
 }
 if(mime==='text/plain')new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 return{name,mime,data:encode(bytes)};
}
