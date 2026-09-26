#!/bin/sh
# usage: set-macro-engine.sh true|false
V=$1
node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-eval.mts "const want=$V; const orig=window.fetch; let res; const done=new Promise(r=>res=r); window.fetch=async (...a)=>{const p=orig(...a); if(String(a[0]).includes('/api/settings/save')) p.then(x=>res(x.status)); return p;}; const el=document.getElementById('experimental_macro_engine'); el.checked=want; jQuery(el).trigger('input'); const status=await Promise.race([done,new Promise(r=>setTimeout(()=>r('timeout'),8000))]); window.fetch=orig; return {status, now: ctx.powerUserSettings.experimental_macro_engine};"
