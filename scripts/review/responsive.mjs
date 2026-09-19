import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const bytes=await readFile(process.argv[2]);
const env=JSON.parse(bytes.toString(bytes[0]===0xff&&bytes[1]===0xfe?'utf16le':'utf8').replace(/^\uFEFF/,''));
const require=createRequire(resolve(env.extension,'package.json'));
const {chromium}=require('playwright');
const output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const cases=['drawer-drawertabs--player-view','drawer-drawertabs--player-memory','drawer-drawertabs--not-configured','drawer-stagecraftpanel--awaiting-review','studio-studiomodal--seeded','studio-studiomodal--empty','studio-studiocopilot--interviews-before-proposing','studio-proposalreview--failed'];
const results=[];
for(const [width,height] of [[1440,900],[768,1024],[390,844]]) {
 const page=await browser.newPage({viewport:{width,height}});
 for(const id of cases){
  const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
  await page.goto(`http://127.0.0.1:16006/iframe.html?id=${id}&viewMode=story`,{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  const metric=await page.evaluate(()=>{
   const visible=[...document.querySelectorAll('button,input,select,textarea,[role=tab]')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
   return {documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,controls:visible.length,offscreenControls:visible.filter(e=>{const b=e.getBoundingClientRect();return b.left<0||b.right>innerWidth}).map(e=>e.getAttribute('aria-label')||e.textContent?.slice(0,70)),text:document.body.innerText.slice(0,9000),tabs:[...document.querySelectorAll('[role=tab]')].map(e=>({label:e.textContent,tabIndex:e.tabIndex,selected:e.getAttribute('aria-selected')}))};
  });
  const image=`${id}-${width}.png`;await page.screenshot({path:resolve(output,image),fullPage:true});
  results.push({id,width,height,...metric,errors,image});page.off('pageerror',onError);
 }
 await page.close();
}
await browser.close();await writeFile(resolve(output,'responsive.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({id,width,documentWidth,offscreenControls,errors})=>({id,width,documentWidth,offscreenControls,errors})),null,2));

