import { syntheticBust } from "./syntheticBust";
import { synthesizeRig, LOWER_LID_OUTSET } from "./rigGeometry";
import { eyeCentre, parseLandmarks } from "./landmarks";
import { visionRigRequest } from "../visionRequest";

describe("rig fit to real-art landmarks", () => {
  test("the open mouth and jaw end above the chin for short and long mouth-to-chin gaps", () => {
    for (const gap of [12, 22, 30]) {
      const marks = JSON.parse(JSON.stringify(syntheticBust(2).landmarks)) as ReturnType<typeof syntheticBust>["landmarks"];
      const mouthY = (marks.mouth.left[1] + marks.mouth.right[1]) / 2;
      marks.chin = [marks.chin[0], mouthY + gap];
      marks.neck = [marks.neck[0], Math.max(marks.neck[1], mouthY + gap + 4)];
      const rig = synthesizeRig(parseLandmarks(marks, marks.image));
      expect(rig.face.jaw.cy + rig.face.jaw.ry).toBeLessThan(marks.chin[1]);
      expect(rig.face.jaw.cy + rig.face.jaw.ry - rig.mouth.cy).toBeGreaterThan(gap * 0.5);
    }
  });

  test("the lower lid is traced outward so iris pixels stay inside the opening", () => {
    const marks = syntheticBust(1).landmarks, rig = synthesizeRig(marks);
    marks.eyes.forEach((contour, index) => {
      const centreY = eyeCentre(contour)[1];
      contour.forEach(([x, y], k) => {
        expect(rig.eyes[index].opening[k][0]).toBeCloseTo(x, 2);
        expect(rig.eyes[index].opening[k][1]).toBeCloseTo(y > centreY ? y + LOWER_LID_OUTSET : y, 2);
      });
    });
  });

  test("the vision request asks for both ears or none, matching the landmark validator", () => {
    const request = visionRigRequest({ sha256: "a".repeat(64) }, "iVBOR", { id: "openai/gpt-6.1-sol", context: 1, image: true }, new AbortController().signal);
    expect(request.prompt).toContain("leave the ears key out entirely when either ear is hidden");
    expect(request.prompt).not.toContain("ears may be omitted");
  });
});
