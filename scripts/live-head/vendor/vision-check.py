# Adapted from mesh-avatar-studio 6f6d362.
# MIT License
#
# Copyright (c) 2026 Yuki Shindo
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
import argparse
import json
import math
import random
import statistics
import sys
from pathlib import Path
from agent_common import font, inside_repo, save_image, save_json
from PIL import Image, ImageDraw

def make(directory):
    directory = inside_repo(directory)
    if (directory / 'check.png').exists() or (directory / '.key.json').exists():
        raise ValueError('calibration already exists; choose a new directory')
    rng = random.SystemRandom()
    scale = 3
    image = Image.new('RGB', (1000 * scale, 1000 * scale), '#e9ebef')
    draw = ImageDraw.Draw(image)
    for _ in range(6000):
        x, y = (rng.randrange(3000), rng.randrange(3000))
        draw.point((x, y), fill=rng.choice(('#dde0e6', '#f5f5f7')))
    positions = []
    while len(positions) < 12:
        p = [rng.uniform(45, 920), rng.uniform(45, 945)]
        if all((math.dist(p, q) > 140 for q in positions)):
            positions.append(p)
    key = {}
    for i, (x, y) in enumerate(positions, 1):
        x, y = (round(x, 2), round(y, 2))
        key[str(i)] = [x, y]
        cx, cy = (x * scale, y * scale)
        r = 7 * scale
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill='#1d2534', outline='white', width=3)
        draw.line((cx - 11 * scale, cy, cx + 11 * scale, cy), fill='#cb2258', width=3)
        draw.line((cx, cy - 11 * scale, cx, cy + 11 * scale), fill='#cb2258', width=3)
        draw.text((cx + 15 * scale, cy - 13 * scale), str(i), font=font(24 * scale), fill='#131b27')
    save_image(image.resize((1000, 1000), Image.Resampling.LANCZOS), directory / 'check.png')
    save_json(key, directory / '.key.json')
    print(f'Read {(directory.relative_to(inside_repo('.')) if directory.is_relative_to(inside_repo('.')) else directory.name)}/check.png (1000 x 1000).')
    print('Write marker centres in source pixels, origin top-left, as JSON: {"1": [x, y], ..., "12": [x, y]}.')
    print('Do not inspect .key.json. Pass: median error <= 4 px and maximum <= 10 px.')

def score(directory, answer):
    key = json.loads((inside_repo(directory) / '.key.json').read_text())
    answers = json.loads(Path(answer).read_text())
    if not isinstance(answers, dict) or set(answers) != set(key):
        raise ValueError('answer must contain exactly the numbered marker keys')
    errors = []
    for name, point in key.items():
        value = answers[name]
        if not isinstance(value, list) or len(value) != 2 or any((type(n) not in (int, float) or not math.isfinite(n) for n in value)):
            raise ValueError(f'marker {name}: expected [finite x, finite y]')
        error = math.dist(point, value)
        errors.append(error)
        print(f'marker {name}: {error:.2f} px')
    median, maximum = (statistics.median(errors), max(errors))
    passed = median <= 4 and maximum <= 10
    print(f'median {median:.2f} px; max {maximum:.2f} px; {('PASS' if passed else 'FAIL')}')
    return 0 if passed else 1

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('make').add_argument('directory', type=Path)
    scorer = sub.add_parser('score')
    scorer.add_argument('directory', type=Path)
    scorer.add_argument('answer', type=Path)
    args = parser.parse_args()
    try:
        return score(args.directory, args.answer) if args.command == 'score' else make(args.directory) or 0
    except (OSError, ValueError, TypeError) as error:
        print(f'vision-check: {error}', file=sys.stderr)
        return 1
if __name__ == '__main__':
    sys.exit(main())
