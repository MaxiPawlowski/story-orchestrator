import { evidenceSources } from '../../../../../../src/extraction/evidence.ts';
const msg = { messageId: 12, text: '"We\'ll take it," I tell Ponticius, and I accept the Sun Ruins mission on the spot.', isUser: true };
const withLabel = "[12] Max: 'We'll take it,' I tell Ponticius, and I accept the Sun Ruins mission on the spot.";
const withoutLabel = "'We'll take it,' I tell Ponticius, and I accept the Sun Ruins mission on the spot.";
console.log(JSON.stringify({ withLabel: evidenceSources(withLabel, [msg]), withoutLabel: evidenceSources(withoutLabel, [msg]) }));
