import net from 'node:net';

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|::1|\[::1\]|::ffff:127\.\d+\.\d+\.\d+)$/i;

export const parseAllow = (raw) => new Set(String(raw ?? '').split(',').map((part) => Number(part.trim())).filter((port) => Number.isInteger(port) && port > 0));

export function connectTarget(args) {
  const [first, second] = args;
  if (Array.isArray(first)) return connectTarget(first);
  if (first && typeof first === 'object') {
    if (typeof first.path === 'string') return null;
    return { host: first.host ?? 'localhost', port: Number(first.port) };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return null;
  return { host: typeof second === 'string' ? second : 'localhost', port: Number(first) };
}

export const blocked = (target, allow) => Boolean(target) && LOOPBACK.test(String(target.host)) && !allow.has(target.port);

export function arm(allow, log = (line) => process.stderr.write(`${line}\n`), proto = net.Socket.prototype) {
  const original = proto.connect;
  proto.connect = function guardedConnect(...args) {
    const target = connectTarget(args);
    if (blocked(target, allow)) {
      log(`[lane-firewall] blocked ${target.host}:${target.port}`);
      const error = Object.assign(new Error(`connect ECONNREFUSED ${target.host}:${target.port} (lane firewall)`), { code: 'ECONNREFUSED', errno: -4078, syscall: 'connect', address: target.host, port: target.port });
      process.nextTick(() => this.destroy(error));
      return this;
    }
    return original.apply(this, args);
  };
  log(`[lane-firewall] armed: loopback allowed only to ${[...allow].join(', ')}`);
  return () => { proto.connect = original; };
}

if (process.env.SO_LANE_FIREWALL_ALLOW) arm(parseAllow(process.env.SO_LANE_FIREWALL_ALLOW));
