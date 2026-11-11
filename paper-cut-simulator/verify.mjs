import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import { initSync } from "../icurve/iShape-js/pkg/ishape_wasm.js";
import { ancestorAt, foldPaper, makeLine, makePaper } from "./paper.js";
import { cutPaper, pathData, polygonPath, resolvePath, transformPaths } from "./cut.js";

const wasm = new URL("../icurve/iShape-js/pkg/ishape_wasm_bg.wasm", import.meta.url);
initSync({ module: await readFile(wasm) });

const fold = (frame, a, b, side) => foldPaper(frame, makeLine(a, b), side);
const rounded = (p) => p.map((v) => Number(v.toFixed(5)) + 0);
const footprint = (frame, axis) => {
  const values = frame.faces.flatMap(({ polygon }) => polygon.map((p) => p[axis]));
  return rounded([Math.min(...values), Math.max(...values)]);
};

function mixedPath(x, y) {
  return {
    start: [x - .08, y],
    segments: [
      { type: "cubic", ctrl0: [x - .06, y - .1], ctrl1: [x + .06, y - .1], to: [x + .08, y] },
      { type: "line", to: [x, y + .08] },
    ],
  };
}

test("같은 수직선에서 선택한 쪽에 따라 반사 방향이 바뀐다", () => {
  const root = makePaper();
  assert.deepEqual(footprint(fold(root, [.5, 0], [.5, 1], [.25, .5]), 0), [.5, 1]);
  assert.deepEqual(footprint(fold(root, [.5, 0], [.5, 1], [.75, .5]), 0), [0, .5]);
  assert.equal(root.faces.length, 1);
});

test("직교 접기 두 번 뒤 네 면에 대칭 구멍이 생기고 중간 면으로 복원된다", () => {
  const root = makePaper();
  const first = fold(root, [0, .5], [1, .5], [.25, .75]);
  const second = fold(first, [.5, 0], [.5, 1], [.25, .25]);
  const frames = [root, first, second];
  const path = mixedPath(.72, .19);
  const pieces = cutPaper(second, null, path);
  assert.equal(pieces.length, 4);
  const firstParents = [];
  const anchors = [];
  pieces.forEach(({ removed, remaining }, leaf) => {
    assert.equal(removed.length, 1);
    assert.equal(remaining.length, 2); // one exterior contour and one hole
    assert.equal(ancestorAt(frames, leaf, 0), 0);
    const parent = ancestorAt(frames, leaf, 1);
    firstParents.push(parent);
    const restored = transformPaths(removed, first.faces[parent].matrix)[0];
    const cubic = restored.segments.find(({ type }) => type === "cubic");
    assert.ok(cubic);
    assert.ok(cubic.to[1] > .18 && cubic.to[1] < .20);
    assert.ok(cubic.ctrl0[1] > .08 && cubic.ctrl0[1] < .10);
    anchors.push(rounded(removed[0].start).join(","));
  });
  assert.deepEqual(firstParents.sort(), [0, 0, 1, 1]);
  assert.deepEqual(anchors.sort(), ["0.28,0.27", "0.28,0.73", "0.72,0.27", "0.72,0.73"]);
});

test("비중앙 접기와 사선 접기 뒤 두 면만 서로 다른 모양으로 잘린다", () => {
  const first = fold(makePaper(), [.37, 0], [.37, 1], [.2, .4]);
  const second = fold(first, [.37, .25], [.97, .49], [.5, .1]);
  const pieces = cutPaper(second, null, mixedPath(.90, .70));
  assert.equal(pieces.length, 4);
  const hits = pieces.filter(({ removed }) => removed.length);
  assert.equal(hits.length, 2);
  assert.notEqual(hits[0].removed[0].segments.length, hits[1].removed[0].segments.length);
  assert.deepEqual(hits.map(({ remaining }) => remaining.length).sort(), [1, 2]);
  const notch = hits.find(({ remaining }) => remaining.length === 1);
  const onRightEdge = (p) => Math.abs(p[0] - 1) < 1e-6;
  assert.ok(notch.removed[0].segments.some((segment) => onRightEdge(segment.to)));
  assert.ok(notch.remaining[0].segments.some(({ type }) => type === "cubic"));
});

test("잘못된 접기와 종이 밖의 오리기는 원본을 유지한다", () => {
  const root = makePaper();
  const original = pathData([polygonPath(root.faces[0].original)]);
  assert.throws(() => makeLine([0, 0], [0, 0]));
  assert.throws(() => fold(root, [0, -1], [1, -1], [0, 0]));
  assert.throws(() => fold(root, [0, 0], [1, 0], [.25, .5]));
  assert.throws(() => fold(root, [0, .5], [1, .5], [.25, .5]));
  assert.equal(root.faces.length, 1);
  assert.deepEqual(resolvePath(polygonPath([[0, 0], [1, 0], [2, 0]])), []);
  const [piece] = cutPaper(root, null, mixedPath(1.5, 1.5));
  assert.equal(piece.removed.length, 0);
  assert.equal(pathData(piece.remaining), original);
});

test("같은 자리를 다시 오려도 이미 사라진 종이는 다시 집계하지 않는다", () => {
  const root = makePaper();
  const cutter = polygonPath([[-1, -1], [2, -1], [2, 2], [-1, 2]]);
  const pieces = cutPaper(root, null, cutter);
  assert.equal(pieces[0].removed.length, 1);
  assert.equal(pieces[0].remaining.length, 0);
  const again = cutPaper(root, pieces, cutter);
  assert.deepEqual(again, [{ remaining: [], removed: [] }]);
});

test("영역 남기기는 사선으로 접은 네 면에서 닿는 두 조각만 원래 좌표에 남긴다", () => {
  const first = fold(makePaper(), [.37, 0], [.37, 1], [.2, .4]);
  const second = fold(first, [.37, .25], [.97, .49], [.5, .1]);
  const pieces = cutPaper(second, null, mixedPath(.90, .70), "keep");
  const retained = pieces.flatMap(({ remaining }) => remaining);
  assert.equal(retained.length, 2);
  assert.equal(pieces.filter(({ remaining }) => !remaining.length).length, 2);
  assert.ok(retained.every(({ segments }) => segments.some(({ type }) => type === "cubic")));
  const points = retained.flatMap(({ start, segments }) => [start, ...segments.map(({ to }) => to)]);
  assert.ok(points.some(([x, y]) => Math.abs(x - 1) < 1e-6 && y < .35));
  assert.ok(points.some(([x, y]) => x < .95 && y > .65));
});

test("영역을 남길 때 먼저 오린 구멍은 다시 채워지지 않는다", () => {
  const root = makePaper();
  const square = (a, b) => polygonPath([[a, a], [b, a], [b, b], [a, b]]);
  const first = cutPaper(root, null, square(.4, .6));
  const [kept] = cutPaper(root, first, square(.3, .7), "keep");
  const corners = kept.remaining.flatMap(({ start, segments }) => [start, ...segments.map(({ to }) => to)]);
  assert.equal(kept.remaining.length, 2);
  assert.deepEqual([...new Set(corners.map((p) => rounded(p)[0]))].sort(), [.3, .4, .6, .7]);
  const [insideHole] = cutPaper(root, [kept], square(.45, .55), "keep");
  assert.deepEqual(insideHole.remaining, []);
});
