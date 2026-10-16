export async function startWithRetry(n: number, headed: boolean, lanes: (...args: string[]) => Promise<unknown>, attempts = 2, log: (line: string) => void = console.log) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await lanes('start', String(n), ...(headed ? ['--headed'] : []));
    } catch (error) {
      if (attempt >= attempts) throw error;
      log(`      lane start attempt ${attempt} failed (${String((error as Error)?.message ?? error).split('\n')[0].slice(0, 200)}); stopping lane ${n} and starting again`);
      await lanes('stop', String(n)).catch(() => undefined);
    }
  }
}
