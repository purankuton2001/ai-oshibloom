import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const result=await build({entryPoints:['client/director.js'],bundle:true,format:'esm',write:false,metafile:true,legalComments:'inline'});
const packages=[...new Set(Object.keys(result.metafile.inputs).map(p=>p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].sort();
const notices=['AI OshiBloom — third-party code in director-client.js\nGenerated from the installed packages during npm run build.\n'];
for(const name of packages){
  const root=path.join('node_modules',name);
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const licenseFile=fs.readdirSync(root).find(f=>/^licen[sc]e(?:\.(?:txt|md))?$/i.test(f));
  const fallback=name==='robot3'?'docs/licenses/robot3.LICENSE.txt':null;
  if(!licenseFile&&!fallback)throw new Error(`Missing distribution license for ${name}; add it before building.`);
  const license=fs.readFileSync(licenseFile?path.join(root,licenseFile):fallback,'utf8');
  notices.push(`${name} ${metadata.version} (${metadata.license})\n${license}`);
}
const text=notices.join('\n----------------------------------------\n\n');
fs.writeFileSync('public/THIRD_PARTY_NOTICES.txt',text);
fs.writeFileSync('public/director-client.js',`/*!\n${text.replaceAll('*/','* /')}\n*/\n${result.outputFiles[0].text}`);
console.log(`Built Director client with notices for ${packages.length} third-party packages.`);
