#!/usr/bin/env bash
cd /c/dev/SillyTavern-MainBranch/public/scripts/extensions/third-party/story-orchestrator
L="node scripts/debug/st-lanes.mts run 3 --"
out=$1
{
$L scripts/debug/st-session.mts reload 2>&1 | tail -8
timeout 120 $L scripts/debug/st-navigation.mts open-group 1759606632088 > /tmp/c3-og.log 2>&1; og=$?; tail -8 /tmp/c3-og.log; echo "open-group exit=$og"
MSYS_NO_PATHCONV=1 $L scripts/debug/st-actions.mts slash "/profile Artemis RunPod RP" 2>&1 | grep -E '"ok"|pipe'
$L scripts/debug/st-eval.mts "return {send: document.querySelector('#send_but')?.className, online: ctx.onlineStatus, group: ctx.groupId, chat: ctx.chatId}" 2>&1 | grep -v Wrote
} > "$out" 2>&1
grep -q displayNone "$out" && { echo "SEND_BUT HIDDEN"; exit 3; }
grep -q "open-group exit=0" "$out" || { echo "OPEN-GROUP FAILED"; exit 90; }
exit 0
