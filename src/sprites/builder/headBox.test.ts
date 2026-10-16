import { headBox, faceAnchor, fractionHeadBox } from "./headBox";
import { mouthRegion } from "./frameRegion";
import { validateBox, type PixelImage } from "./pixels";

const W = 400, H = 600, CHIN = 202, MOUTH = 171, FACE_TOP = 78;
function hatted(): PixelImage {
  const data = new Uint8ClampedArray(W * H * 4);
  const fill = (inside: (x: number, y: number) => boolean) => {
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (inside(x, y)) data[(y * W + x) * 4 + 3] = 255;
  };
  fill((x, y) => x >= 160 && x <= 240 && y >= 10 && y < 70);
  fill((x, y) => x >= 110 && x <= 290 && y >= 70 && y < 86);
  fill((x, y) => ((x - 200) / 50) ** 2 + ((y - 140) / 62) ** 2 <= 1);
  fill((x, y) => x >= 180 && x <= 220 && y >= 195 && y < 230);
  fill((x, y) => x >= 100 && x <= 300 && y >= 225 && y < 560);
  return { width: W, height: H, data };
}

const mouthBand = (box: { y: number; width: number; height: number }) => {
  const region = mouthRegion(box);
  return [box.y + region.y, box.y + region.y + region.height];
};

test("the old fraction box cuts the chin of hatted art", () => {
  expect(fractionHeadBox(hatted()).y + fractionHeadBox(hatted()).height).toBeLessThan(CHIN);
});

test("on hatted art the detector's face and chin anchor the head box: chin and some neck inside, mouth in the mouth region", () => {
  const points = Array.from({ length: 28 }, (): [number, number, number] => [200, 150, 0.9]);
  points[2] = [200, CHIN, 0.9];
  const anchor = faceAnchor({ width: W, height: H, faces: [{ box: [150, FACE_TOP, 250, CHIN, 0.95], points }] }, image());
  expect(anchor).toEqual({ cx: 200, top: FACE_TOP, chin: CHIN });
  const box = headBox(hatted(), anchor);
  validateBox(hatted(), box);
  expect(box.y).toBeLessThanOrEqual(FACE_TOP);
  expect(box.y + box.height).toBeGreaterThanOrEqual(CHIN + box.height * 0.1);
  const [top, bottom] = mouthBand(box);
  expect(MOUTH).toBeGreaterThanOrEqual(top);
  expect(MOUTH).toBeLessThanOrEqual(bottom);
  expect(faceAnchor({ width: W, height: H, faces: [{ box: [150, FACE_TOP, 250, CHIN, 0.2], points }] }, image())).toBeNull();
  expect(faceAnchor(null, image())).toBeNull();
});

test("without a detector answer the head box stays the old fraction box", () => {
  expect(headBox(hatted(), null)).toEqual(fractionHeadBox(hatted()));
});

function image(): Pick<PixelImage, "width" | "height"> { return { width: W, height: H }; }
