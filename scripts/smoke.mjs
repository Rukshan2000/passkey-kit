// Imports every built package from dist via its package name, as a consumer would.
const names = ['core', 'memory', 'postgres', 'mysql', 'mongodb', 'express', 'fastify', 'browser'];
for (const n of names) {
  const m = await import(`@passkey-kit/${n}`);
  if (!Object.keys(m).length) throw new Error(`@passkey-kit/${n} has no exports`);
  console.log(`ok @passkey-kit/${n}: ${Object.keys(m).join(', ')}`);
}
