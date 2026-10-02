#!/bin/bash
# usage: x-drive.sh <log> ; applies provisioning cards one at a time, Continue on budget once per call budget arg
cd /c/dev/story-orchestrator
D=test/sessions/T5/T5-2-2; LOG=$D/$1; MAXCONT=${2:-1}; cont=0
st() { node scripts/debug/st-lanes.mts run 4 -- scripts/debug/so-ui.mts agent-state 2>/dev/null | sed 's/^[0-9TZ:.-]* //' | grep -v "Wrote JSON"; }
cnt() { node scripts/debug/st-lanes.mts run 4 -- scripts/debug/st-eval.mts "({chars:ctx.characters.length,groups:ctx.groups.length,books:(await import('/scripts/world-info.js')).world_names.length})" 2>/dev/null | sed 's/^[0-9TZ:.-]* //' | grep -v "Wrote JSON" | tr -d '\n '; }
for i in $(seq 1 120); do
  S=$(st); STATUS=$(echo "$S" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log((j.status||'')+'|'+(j.pending?j.pending.kind:'')+'|'+(j.busy?'busy':''))}catch(e){console.log('parse-error')}})")
  echo "$(date -u +%FT%TZ) $STATUS $(cnt)" >> $LOG
  case "$STATUS" in
    *"|provision|"*) echo "$S" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('CARD: '+j.pending.text.replace(/\s+/g,' ').slice(-400))})" >> $LOG
       node scripts/debug/st-lanes.mts run 4 -- scripts/debug/so-ui.mts wizard-apply 0 2>/dev/null | grep -E '"applied"|"error"|vanished' | tr -d '\n' >> $LOG; echo >> $LOG; echo "after: $(cnt)" >> $LOG ;;
    budget*|*"Out of budget"*) if [ $cont -lt $MAXCONT ]; then cont=$((cont+1)); echo "CONTINUE $cont" >> $LOG; node scripts/debug/st-lanes.mts run 4 -- scripts/debug/so-ui.mts agent-continue --timeout 600000 >/dev/null 2>&1; else echo "STOP budget" >> $LOG; exit 0; fi ;;
    done*|stopped*|error*|failed*) echo "END $STATUS" >> $LOG; exit 0 ;;
    *"|edit|"*) echo "EDIT-CARD (unexpected in auto-draft)" >> $LOG; exit 0 ;;
    awaiting-plan*) echo "AWAIT-PLAN" >> $LOG; exit 0;;
    *) sleep 10 ;;
  esac
done
