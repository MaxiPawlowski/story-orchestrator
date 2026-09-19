import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const bytes=await readFile(process.argv[2]);const env=JSON.parse(bytes.toString(bytes[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const require=createRequire(resolve(env.extension,'package.json'));const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto('http://127.0.0.1:16006/iframe.html?id=studio-studiomodal--seeded&viewMode=story',{waitUntil:'networkidle'});
await page.getByRole('tab',{name:'Graph',exact:true}).focus();
const focus=()=>page.evaluate(()=>({active:document.activeElement?.textContent,selected:[...document.querySelectorAll('[role=tab][aria-selected=true]')].map(e=>e.textContent)}));
const before=await focus();await page.keyboard.press('ArrowRight');const afterArrow=await focus();await page.keyboard.press('Tab');const afterTab=await focus();
const trace=[];for(let i=0;i<45;i++){await page.keyboard.press('Tab');trace.push(await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,70),inDialog:!!document.activeElement?.closest('dialog')})));}
await page.evaluate(()=>document.documentElement.style.fontSize='200%');
const textScale=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,dialog:document.querySelector('dialog')?.getBoundingClientRect().toJSON()}));
await page.screenshot({path:resolve(process.argv[3],'studio-text-scale-200-mobile.png'),fullPage:true});
await page.keyboard.press('Escape');const escapeClosed=await page.locator('dialog[open]').count()===0;
await page.goto('about:blank');
// Deliberately harmless marker: demonstrates the browser behavior of the HTML string returned by R7.
await page.setContent('<div id="popup"></div>');
await page.evaluate(()=>{document.querySelector('#popup').innerHTML='<h3>“<img src=x onerror="globalThis.reviewMarker=1">” changed under this chat</h3>';});
await page.waitForFunction(()=>globalThis.reviewMarker===1);
const htmlMarker=await page.evaluate(()=>globalThis.reviewMarker);
await writeFile(resolve(process.argv[3],'interaction.json'),JSON.stringify({before,afterArrow,afterTab,trace,textScale,escapeClosed,htmlMarker,note:'Marker used an independent blank browser page, not the host. HTML source string matches R7. Text scaling is not browser zoom.'},null,2));
await browser.close();console.log(JSON.stringify({before,afterArrow,afterTab,textScale,escapeClosed,htmlMarker}));
