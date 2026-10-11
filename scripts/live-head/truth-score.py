import argparse
import json
import sys
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def mask(shape, polygon, scale):
    result = np.zeros((shape[0] * scale, shape[1] * scale), np.uint8)
    points = np.rint(np.asarray(polygon, np.float64) * scale).astype(np.int32)
    cv2.fillPoly(result, [points], 255)
    return result


def stroke(shape, line, width, scale):
    result = np.zeros((shape[0] * scale, shape[1] * scale), np.uint8)
    points = np.rint(np.asarray(line, np.float64) * scale).astype(np.int32)
    cv2.polylines(result, [points], False, 255, max(1, round(width * scale)))
    return result


def visible(shape, eye, scale):
    almond = mask(shape, eye["white"], scale)
    covered = cv2.bitwise_or(stroke(shape, eye["top"], eye["lash_width"], scale), stroke(shape, eye["bottom"], eye["lid_width"], scale))
    return cv2.bitwise_and(almond, cv2.bitwise_not(covered))


def boundary(m):
    return cv2.morphologyEx(m, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0


def distance_to(source_boundary, target):
    field = cv2.distanceTransform((~boundary(target)).astype(np.uint8), cv2.DIST_L2, 5)
    return field[source_boundary]


def worst_point(source_boundary, target, scale):
    field = cv2.distanceTransform((~boundary(target)).astype(np.uint8), cv2.DIST_L2, 5)
    ys, xs = np.nonzero(source_boundary)
    k = int(np.argmax(field[ys, xs]))
    return xs[k] / scale, ys[k] / scale, field[ys[k], xs[k]] / scale


def main():
    parser = argparse.ArgumentParser(description="Score drawn eye openings against the generator's own outline.")
    parser.add_argument("rig", type=Path)
    parser.add_argument("truth", type=Path)
    parser.add_argument("--size", nargs=2, type=int, required=True)
    args = parser.parse_args()
    for path in (args.rig, args.truth):
        if not path.resolve().is_relative_to(ROOT):
            print("inputs must stay inside the worktree", file=sys.stderr)
            return 1
    rig = json.loads(args.rig.read_text(encoding="utf-8"))
    truth = json.loads(args.truth.read_text(encoding="utf-8"))
    scale = 8
    shape = (args.size[1], args.size[0])
    worst = 0.0
    for index, eye in enumerate(rig["eyes"]):
        drawn, real = mask(shape, eye["opening"], scale), visible(shape, truth["eyes"][index], scale)
        forward = distance_to(boundary(drawn), real) / scale
        backward = distance_to(boundary(real), drawn) / scale
        hausdorff = float(max(forward.max(), backward.max()))
        mean = float(np.concatenate([forward, backward]).mean())
        overlap = float(np.count_nonzero((drawn > 0) & (real > 0)) / np.count_nonzero((drawn > 0) | (real > 0)))
        fx, fy, fd = worst_point(boundary(drawn), real, scale)
        bx, by, bd = worst_point(boundary(real), drawn, scale)
        print(f"  worst drawn point ({fx:.1f}, {fy:.1f}) is {fd:.2f} px from the true edge; worst true point ({bx:.1f}, {by:.1f}) is {bd:.2f} px from the drawn edge")
        worst = max(worst, hausdorff)
        print(f"eye {index}: max contour error {hausdorff:.2f} px; mean {mean:.2f} px; IoU {overlap:.3f}")
    print(f"worst eye contour error {worst:.2f} px; floor 2.00 px; {'PASS' if worst <= 2 else 'FAIL'}")
    return 0 if worst <= 2 else 1


if __name__ == "__main__":
    sys.exit(main())
