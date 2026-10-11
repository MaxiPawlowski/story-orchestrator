/*! Adapted from mesh-avatar-studio 6f6d362.
MIT License

Copyright (c) 2026 Yuki Shindo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
export type Point = [
    number,
    number
];
export type Band = [
    number,
    number
];
export interface Ellipse {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
}
export interface Eye {
    opening: Point[];
    roi: Point[];
    x0: number;
    x1: number;
    top: number[];
    bot: number[];
}
export interface Strand {
    name: string;
    nodes: Point[];
    sigma: number;
    k: number;
    max: number;
}
export interface Accessory {
    name: string;
    pivot: Point;
    tip: Point;
    split: number;
    box: [
        number,
        number,
        number,
        number
    ];
    color: {
        redness: number;
        minRed: number;
    };
}
export interface Hand {
    outline: Point[];
    jaw: Point[];
    jawRange: Band;
    background: Point[];
    elbow: Point;
    wrist: Point;
    knuckle: Point;
    contact: Point;
    forearmShare: number;
    armBand: Band;
    wristBand: Band;
    handBand: Band;
    fingerXBand: Band;
    fingerYBand: Band;
    pinBand: Band;
}
export interface Rig {
    version: 1;
    image: {
        width: number;
        height: number;
    };
    head: Ellipse & {
        shiftX: number;
        shiftY: number;
        pivotX: number;
        pivotY: number;
        maxRoll: number;
        weightBand: Band;
        turnBand: Band;
    };
    body: {
        pivotX: number;
        pivotY: number;
        maxRoll: number;
        breathBand: Band;
        rollBand: Band;
        chest: Ellipse;
        shoulders: Ellipse[];
    };
    face: Record<'nose' | 'mouth' | 'eyeA' | 'eyeB' | 'earL' | 'earR', Ellipse> & {
        brow: Ellipse & {
            band: Band;
        };
        jaw: Ellipse & {
            band: Band;
        };
    };
    buns?: Partial<Record<'bunL' | 'bunR', Ellipse>>;
    eyes: Eye[];
    mouth: {
        cx: number;
        cy: number;
        angle: number;
        halfLen: number;
        bow: number;
        area: Ellipse & {
            angle: number;
        };
    };
    cheeks: Point[];
    strands?: Strand[];
    accessories?: Accessory[];
    hand?: Hand;
    mesh: {
        baseCell: number;
        fine: {
            x0: number;
            x1: number;
            y0: number;
            y1: number;
            cell: number;
        };
        handCell: number;
        tasselCell: number;
        eyeBallCell: number;
        eyeCell: number;
        spriteCell: number;
    };
    view: {
        padTop: number;
        padSide: number;
        gazeCenter?: Point;
    };
}
