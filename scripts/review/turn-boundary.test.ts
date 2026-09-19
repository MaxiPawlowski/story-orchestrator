import { TurnBridge } from '@runtime/turnBridge';
import type { RuntimeManager } from '@runtime/runtimeManager';
const handlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock('@services/STAPI', () => ({
 isHostGenerating: () => false,
 subscribeToHostEvents: (entries: Array<{eventName:string;handler:(...args:unknown[])=>unknown}>) => {
  entries.forEach(e=>handlers.set(e.eventName,e.handler));return ()=>handlers.clear();
 },
}));
const emit=async(name:string,id:number)=>{await handlers.get(name)?.(id);await Promise.resolve();await Promise.resolve();};
const setup=()=>{const manager={commitBoundary:jest.fn(async()=>{}),fireAfterSpeak:jest.fn(async()=>{}),rollbackFromMessage:jest.fn(async()=>{}),loadSelectedFromChat:jest.fn(async()=>{}),notify:jest.fn()};const bridge=new TurnBridge(manager as unknown as RuntimeManager);bridge.start();return {manager,bridge};};
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-09-19T00:00:00Z'));handlers.clear();});
afterEach(()=>jest.useRealTimers());
test('control: duplicate host events for one reply produce one boundary',async()=>{const {manager}=setup();await emit('MESSAGE_RECEIVED',1);await emit('CHARACTER_MESSAGE_RENDERED',1);expect(manager.commitBoundary).toHaveBeenCalledTimes(1);});
test('control: distinct replies separated by 300ms both commit',async()=>{const {manager}=setup();await emit('CHARACTER_MESSAGE_RENDERED',1);jest.advanceTimersByTime(300);await emit('CHARACTER_MESSAGE_RENDERED',2);expect(manager.commitBoundary).toHaveBeenCalledTimes(2);});
test('R10: distinct replies within 250ms must not be treated as duplicate events',async()=>{const {manager}=setup();await emit('CHARACTER_MESSAGE_RENDERED',1);jest.advanceTimersByTime(100);await emit('CHARACTER_MESSAGE_RENDERED',2);expect(manager.commitBoundary).toHaveBeenCalledTimes(2);});
test('R11: a delayed second event for the same reply must not add a boundary',async()=>{const {manager}=setup();await emit('MESSAGE_RECEIVED',1);jest.advanceTimersByTime(300);await emit('CHARACTER_MESSAGE_RENDERED',1);expect(manager.commitBoundary).toHaveBeenCalledTimes(1);});
