#!/bin/bash
cd /c/dev/story-orchestrator
OUT=test/sessions/T5/T5-2-2/$1
while true; do
node scripts/debug/st-lanes.mts run 4 -- scripts/debug/st-eval.mts "(()=>{const st=document.getElementById('so-agent-status');const c=document.querySelector('#so-agent [data-so=\"agent-card\"]');return {t:new Date().toISOString(),status:st?.getAttribute('data-status')??null,txt:st?.textContent?.trim()??null,steps:document.querySelectorAll('#so-agent [data-so=\"agent-step\"]').length,card:c?.getAttribute('data-kind')??null,cardText:c?(c.innerText||'').slice(0,160):null,chars:ctx.characters.length,groups:ctx.groups.length}})()" 2>/dev/null | grep -v "Wrote JSON" | sed 's/^[0-9TZ:.-]* //' | tr -d '\n' >> $OUT; echo >> $OUT
sleep 15
done
