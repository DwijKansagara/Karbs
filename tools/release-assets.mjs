import{readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';
const cfg=JSON.parse(readFileSync(new URL('../windows/src-tauri/tauri.conf.json',import.meta.url)));
const dir=process.argv[2];if(!dir)throw new Error('Pass the NSIS bundle directory.');
const file=`Karbs_${cfg.version}_x64-setup.exe`;const bytes=readFileSync(join(dir,file));const signature=readFileSync(join(dir,file+'.sig'),'utf8').trim();
const version=cfg.version;
const json={version,notes:'Karbs desktop assistant for Windows. See the release notes for changes.',pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{signature,url:`https://github.com/DwijKansagara/Karbs/releases/download/v${version}/${file}`}}};
writeFileSync(join(dir,'latest.json'),JSON.stringify(json,null,2)+'\n');
writeFileSync(join(dir,'SHA256SUMS.txt'),`${createHash('sha256').update(bytes).digest('hex')}  ${file}\n`);
console.log('Updater manifest and installer checksum created.');
