import { decodeImage, encodeImage, resizeEdit } from '../../../src/sprites/builder/images';
import { pasteEdit, checkPixels, checkMouthCoverage, validateBox } from '../../../src/sprites/builder/pixels';
import { validateRegion } from '../../../src/sprites/builder/frameRegion';
import { editKey } from '../../../src/sprites/builder/recipes';

(globalThis as any).recomposeSagaMouth = async ({ base, raw, row, region }) => {
  const original = await decodeImage(base);
  const render = await decodeImage(raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`);
  const box = row.inputs.box;
  validateBox(original, box); validateRegion(box, region);
  if (original.sha256 !== row.inputs.base) throw new Error('The base changed before recomposition.');
  const image = pasteEdit(original, resizeEdit(render, box), box, 'talk', region);
  const qa = checkPixels(original, image, box, true);
  qa.reasons.push(...checkMouthCoverage(original, image, box, region, true));
  qa.ok = qa.ok && !qa.reasons.length;
  if (!qa.ok) throw new Error(qa.reasons.join(' '));
  const inputs = { ...row.inputs, frameRegion: region };
  return { data: encodeImage(image), qa, inputs, key: await editKey(inputs) };
};
