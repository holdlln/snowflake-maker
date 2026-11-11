import {
  ancestorAt, crossesPaper, distance, foldPaper, makeLine, makePaper,
  movingPart, POINT_GAP, signedDistance,
} from "./paper.js";
import { cutPaper, initCurves, pathData, polygonPath, resolvePath, transformPaths } from "./cut.js";
import { mountSnowScene } from "./snow.js?v=flake-names";

const $ = (id) => document.getElementById(id);
const board = $("board");
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const SVG_NS = "http://www.w3.org/2000/svg";
const SNAP = 0.05;
const FULL_PAPER = [[0, 0], [1, 1]];

function initialState() {
  return {
    frames: [makePaper()], depth: 0, mode: "fold", foldPoints: [],
    draft: null, segmentType: "line", cutOperation: "remove", pieces: null, lastHit: 0,
  };
}

let state = initialState();
const undoStack = [];
let ready = false;
let fit = false;
let cursor = null;
let drag = null;
let view = { x: -.15, y: -.15, width: 1.3, height: 1.3 };
const currentFrame = () => state.frames[state.depth];

function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function commit(patch, message) {
  undoStack.push(state);
  state = { ...state, ...patch };
  if (message) status(message);
  render();
}

function undo() {
  if (!undoStack.length || drag) return;
  state = undoStack.pop();
  status("직전 조작을 되돌렸어요.");
  render();
}

function reset() {
  if (drag) return;
  state = initialState();
  undoStack.length = 0;
  cursor = null;
  fit = false;
  $("show-crease").checked = true;
  status("새 정사각형 종이를 놓았어요.");
  render();
}

function changeMode(mode) {
  if (!ready || drag || mode === state.mode) return;
  commit({ mode, foldPoints: [], draft: null }, {
    fold: "같은 종이 위에서 계속 접을 수 있어요.",
    cut: "포개진 모든 면에 오리기가 적용돼요.",
    unfold: state.depth ? "마지막 접기부터 역순으로 펼쳐요." : "원래 종이 좌표에서 결과를 보고 있어요.",
  }[mode]);
}

function selectFold(point) {
  const [first, second] = state.foldPoints;
  if (!first) {
    commit({ foldPoints: [point] }, "첫 점을 찍었어요.");
    return;
  }
  if (!second) {
    const line = makeLine(first, point);
    if (!crossesPaper(currentFrame(), line)) throw new Error("종이 안쪽을 가로지르는 두 번째 점을 찍으세요.");
    commit({ foldPoints: [first, point] }, "넘길 쪽을 선택하세요. 그쪽의 모든 겹을 접어요.");
    return;
  }
  const frame = foldPaper(currentFrame(), makeLine(first, second), point);
  commit({
    frames: [...state.frames, frame],
    depth: state.depth + 1,
    foldPoints: [],
  }, `${state.depth + 1}번째 접기 · 종이 면 ${frame.faces.length}개`);
}

function lastPoint(draft) {
  return draft.segments.at(-1)?.to ?? draft.start;
}

function newSegment(from, to) {
  if (state.segmentType === "line") return { type: "line", to };
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return {
    type: "cubic",
    to,
    ctrl0: [from[0] + dx / 3 + dy / 4, from[1] + dy / 3 - dx / 4],
    ctrl1: [from[0] + dx * 2 / 3 + dy / 4, from[1] + dy * 2 / 3 - dx / 4],
  };
}

function canClose(draft) {
  if (!draft || draft.closed || !draft.segments.length) return false;
  return draft.segments.length > 1
    || state.segmentType === "cubic"
    || draft.segments[0].type === "cubic";
}

function closePath() {
  const draft = state.draft;
  if (!canClose(draft)) throw new Error("닫힌 영역을 만들려면 구간을 더 추가하세요.");
  const from = lastPoint(draft);
  const segments = distance(from, draft.start) < POINT_GAP
    ? draft.segments
    : [...draft.segments, newSegment(from, draft.start)];
  commit({ draft: { ...draft, segments, closed: true } }, "미리보기를 확인하고 오리기를 확정하세요.");
}

function drawPoint(point, target) {
  const draft = state.draft;
  if (!draft) {
    commit({ draft: { start: point, segments: [], closed: false } }, "다음 점을 찍어 구간을 추가하세요.");
    return;
  }
  if (draft.closed) return;
  if (target.dataset.start !== undefined || distance(point, draft.start) < POINT_GAP) {
    closePath();
    return;
  }
  const from = lastPoint(draft);
  if (distance(point, from) < POINT_GAP) throw new Error("이전 점과 떨어진 곳에 끝점을 찍으세요.");
  const segment = newSegment(from, point);
  commit({ draft: { ...draft, segments: [...draft.segments, segment] } },
    segment.type === "cubic" ? "초록색 조절점을 드래그할 수 있어요." : "구간을 이어 그리거나 경로를 닫으세요.");
}

function applyCut() {
  const { draft, cutOperation } = state;
  const keep = cutOperation === "keep";
  if (!resolvePath(draft).length) throw new Error("면적이 있는 닫힌 영역을 그리세요.");
  const pieces = cutPaper(currentFrame(), state.pieces, draft, cutOperation);
  if (keep && !pieces.some(({ remaining }) => remaining.length)) {
    status("남길 종이가 없어요. 종이에 닿도록 영역을 다시 그려 보세요.", true);
    return;
  }
  const lastHit = pieces.filter(({ removed }) => removed.length).length;
  if (!lastHit) {
    status(keep ? "남은 종이가 모두 그린 영역 안에 있어요." : "남아 있는 종이에 닿지 않았어요. 종이는 그대로예요.", !keep);
    return;
  }
  commit({ pieces, draft: null, lastHit },
    keep ? "그린 영역에 닿는 종이만 남겼어요. 이제 펼쳐 보세요."
      : `종이 면 ${lastHit}개를 오렸어요. 더 오리거나 펼칠 수 있어요.`);
}

function unfold() {
  const depth = state.depth - 1;
  commit({ depth }, depth
    ? `한 단계 펼쳤어요. 남은 접기 ${depth}회`
    : "완전히 펼쳤어요. 원래 종이 좌표에 남은 무늬를 확인하세요.");
}

function guarded(action) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && /[가-힣]/.test(error.message)) status(error.message, true);
    else {
      console.error(error);
      status("기하 계산을 마치지 못했어요. 선이나 경로를 조금 옮겨 보세요.", true);
    }
  }
}

function svg(parent, name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.append(element);
  return element;
}

function svgLine(parent, a, b, className) {
  svg(parent, "line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: className });
}

function dot(parent, point, radius, className, extra = {}) {
  svg(parent, "circle", { cx: point[0], cy: point[1], r: radius, class: className, ...extra });
}

function setView() {
  const points = currentFrame().faces.flatMap(({ polygon }) => polygon);
  if (!fit) points.push(...FULL_PAPER);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, .08);
  const ratio = board.clientWidth / (board.clientHeight || 1) || 1;
  const width = span * 1.32 * Math.max(1, ratio);
  const height = span * 1.32 * Math.max(1, 1 / ratio);
  view = { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
  board.setAttribute("viewBox", Object.values(view).join(" "));
}

function renderMaterial(group, frame) {
  const paths = frame.faces.map(({ polygon }) => [polygonPath(polygon)]);
  if (state.pieces) {
    // Final fragments are grouped by their ancestor at the displayed step.
    // One even-odd fill per ancestor hides the seams introduced by later folds.
    paths.forEach((_, i) => { paths[i] = []; });
    state.pieces.forEach(({ remaining }, leaf) => {
      const ancestor = ancestorAt(state.frames, leaf, state.depth);
      paths[ancestor].push(...transformPaths(remaining, frame.faces[ancestor].matrix));
    });
  }
  const order = frame.faces.map((_, index) => index)
    .sort((a, b) => frame.faces[a].layer - frame.faces[b].layer);
  for (const i of order) {
    const { matrix: [a, b, c, d] } = frame.faces[i];
    const back = a * d - b * c < 0 ? " back" : "";
    const cut = state.pieces ? " cut-sheet" : "";
    if (paths[i].length) svg(group, "path", { d: pathData(paths[i]), class: `sheet${back}${cut}`, "data-face": i });
  }
}

function drawInfiniteLine(group, { origin, vector }, className) {
  const reach = 2 * Math.hypot(view.width, view.height);
  const point = (scale) => origin.map((v, i) => v + scale * vector[i]);
  svgLine(group, point(-reach), point(reach), className);
}

function renderMarks() {
  const marks = $("marks");
  marks.replaceChildren();
  const unit = 1 / (board.getScreenCTM()?.a || 1);
  const frame = currentFrame();
  if (frame.crease && $("show-crease").checked && !state.foldPoints.length) {
    drawInfiniteLine(marks, frame.crease, "fold-line past");
  }
  const [first, second] = state.foldPoints;
  if (first) {
    const end = second ?? cursor;
    if (end && distance(first, end) >= POINT_GAP) {
      const line = makeLine(first, end);
      if (second && cursor) {
        const side = Math.sign(signedDistance(line, cursor));
        if (side) {
          for (const { polygon } of frame.faces) {
            const moving = movingPart(polygon, line, side);
            if (moving.length > 2) svg(marks, "polygon", { points: moving.join(" "), class: "fold-side" });
          }
        }
      }
      drawInfiniteLine(marks, line, "fold-line");
    }
    dot(marks, first, 5 * unit, "fold-point");
    if (second) dot(marks, second, 5 * unit, "fold-point");
  }
  const { draft, cutOperation } = state;
  const keepPreview = Boolean(draft?.closed && cutOperation === "keep");
  board.dataset.cutOperation = cutOperation;
  $("material-context").classList.toggle("keep-preview", keepPreview);
  if (!draft) return;
  const outline = pathData([draft], draft.closed);
  if (keepPreview) {
    $("keep-outline").setAttribute("d", outline);
    const selection = svg(marks, "g", { "clip-path": "url(#keep-clip)", "pointer-events": "none" });
    selection.append(...Array.from($("material").children, (face) => face.cloneNode()));
  }
  svg(marks, "path", {
    d: outline,
    class: draft.closed ? "cut-draft closed" : "cut-draft",
  });
  if (!draft.closed && cursor && !drag) {
    const start = lastPoint(draft);
    svg(marks, "path", { d: pathData([{ start, segments: [newSegment(start, cursor)] }], false), class: "cut-next" });
  }
  let from = draft.start;
  draft.segments.forEach((segment, i) => {
    if (segment.type === "cubic") {
      svgLine(marks, from, segment.ctrl0, "handle-line");
      svgLine(marks, segment.to, segment.ctrl1, "handle-line");
      for (const key of ["ctrl0", "ctrl1"]) {
        dot(marks, segment[key], 6 * unit, "handle-point", { "data-segment": i, "data-handle": key });
      }
    }
    if (segment.to !== draft.start) dot(marks, segment.to, 3.5 * unit, "anchor");
    from = segment.to;
  });
  dot(marks, draft.start, 5 * unit, "anchor start", { "data-start": "" });
}

function renderBoard() {
  const frame = currentFrame();
  const reference = $("reference");
  const material = $("material");
  setView();
  board.dataset.mode = state.mode;
  reference.replaceChildren();
  material.replaceChildren();
  if (state.depth && !fit) svg(reference, "rect", { width: 1, height: 1, class: "sheet-guide" });
  renderMaterial(material, frame);
  renderMarks();
}

function renderHistory() {
  const map = $("crease-map");
  map.replaceChildren();
  svg(map, "rect", { width: 1, height: 1, fill: "var(--paper)", stroke: "var(--paper-edge)", "stroke-width": ".015" });
  const { graph } = state.frames.at(-1);
  graph.edges_vertices.forEach(([a, b], i) => {
    if (["M", "V"].includes(graph.edges_assignment[i])) {
      const line = svg(map, "line", {
        x1: graph.vertices_coords[a][0], y1: graph.vertices_coords[a][1],
        x2: graph.vertices_coords[b][0], y2: graph.vertices_coords[b][1],
        stroke: "#a75526", "stroke-width": ".02", "stroke-dasharray": ".04 .025",
      });
      line.setAttribute("stroke-linecap", "round");
    }
  });
  const list = $("history-list");
  list.replaceChildren(...state.frames.slice(1).map(({ crease, faces }, i) => {
    const item = document.createElement("li");
    const angle = (Math.atan2(crease.vector[1], crease.vector[0]) * 180 / Math.PI + 360) % 180;
    item.textContent = `${i + 1}회 · ${Math.round(angle) % 180}° · 면 ${faces.length}개`;
    item.classList.toggle("active", state.depth === i + 1);
    return item;
  }));
  $("history-count").textContent = `${state.frames.length - 1}회`;
  $("history-empty").hidden = state.frames.length > 1;
}

function renderTools() {
  const { mode, foldPoints, draft, depth, pieces, segmentType, cutOperation } = state;
  const keep = cutOperation === "keep";
  const instructions = {
    fold: [
      ["접는 선을 그려요", "두 점을 찍어 종이를 가로지르는 직선을 정하세요."],
      ["두 번째 점을 찍어요", "황금색 점선이 접는 선이에요. 종이 안쪽을 지나게 그으세요."],
      ["넘길 쪽을 선택해요", "선의 어느 쪽을 넘길지 클릭하세요. 색이 칠해진 쪽이 접혀요."],
    ][foldPoints.length],
    cut: draft?.closed
      ? (keep
        ? ["남길 영역을 확인해요", "밝게 보이는 종이만 남아요. 초록색 조절점으로 곡선을 다듬을 수 있어요."]
        : ["잘라낼 영역을 확인해요", "분홍색 영역에 닿는 종이가 잘려요. 초록색 조절점으로 곡선을 다듬을 수 있어요."])
      : ["오릴 경로를 그려요", "직선이나 베지어로 점을 이으세요. 첫 점을 다시 누르면 경로가 닫혀요."],
    unfold: depth
      ? ["한 번씩 펼쳐요", "마지막 접기부터 펼치면 잘린 자리도 각 면을 따라 움직여요."]
      : ["완전히 펼쳤어요", "정사각형 종이 좌표에서 구멍과 가장자리 무늬를 볼 수 있어요."],
  }[mode];
  $("step-label").textContent = { fold: "01 / 접기", cut: "02 / 오리기", unfold: "03 / 펼치기" }[mode];
  $("step-title").textContent = instructions[0];
  $("next-action").textContent = instructions[1];
  for (const button of modeButtons) {
    const target = button.dataset.mode;
    button.setAttribute("aria-current", target === mode ? "step" : "false");
    button.disabled = !ready || (target === "fold" && (pieces !== null || mode === "unfold"))
      || (target === "cut" && (mode === "unfold" || foldPoints.length > 0))
      || (target === "unfold" && (!depth && !pieces || !!draft || foldPoints.length > 0));
  }
  $("undo").disabled = !undoStack.length;
  $("reset").disabled = !undoStack.length;
  $("fit").setAttribute("aria-pressed", String(fit));
  $("fit").textContent = fit ? "전체 보기" : "종이에 맞춤";
  $("fold-tools").hidden = mode !== "fold";
  $("cut-tools").hidden = mode !== "cut";
  $("unfold-tools").hidden = mode !== "unfold";
  $("clear-line").hidden = !foldPoints.length;
  $("start-cut").disabled = !ready || !!foldPoints.length;
  $("remove-area").setAttribute("aria-pressed", String(!keep));
  $("keep-area").setAttribute("aria-pressed", String(keep));
  $("area-swatch").classList.toggle("keep", keep);
  $("area-legend").textContent = keep ? "남길 영역" : "잘라낼 영역";
  $("line-tool").setAttribute("aria-pressed", String(segmentType === "line"));
  $("curve-tool").setAttribute("aria-pressed", String(segmentType === "cubic"));
  $("line-tool").disabled = $("curve-tool").disabled = Boolean(draft?.closed);
  $("clear-path").disabled = !draft;
  $("close-path").disabled = !canClose(draft);
  $("apply-cut").disabled = !draft?.closed;
  $("apply-cut").textContent = keep ? "영역 남기기 확정" : "잘라내기 확정";
  $("start-unfold").disabled = !!draft || (!depth && !pieces);
  $("unfold").disabled = !depth;
  $("unfold").textContent = depth ? "한 단계 펼치기" : "펼치기 완료";
  const result = finishedShape();
  const saved = result && snow.has(result.getAttribute("d"));
  $("unfold").hidden = Boolean(result);
  $("save-flake").hidden = !result;
  $("save-flake").disabled = Boolean(saved);
  $("save-flake").textContent = saved ? "보관한 결정이에요" : "결정 보관하기";
  $("view-saved-snow").hidden = !result || snow.count === 0;
  $("fold-count").textContent = depth;
  $("face-count").textContent = currentFrame().faces.length;
  $("hit-count").textContent = pieces ? `${state.lastHit}면` : "—";
}

function render() {
  renderBoard();
  renderTools();
  renderHistory();
}

function finishedShape() {
  if (state.mode === "unfold" && state.depth === 0 && state.pieces) {
    return $("material").querySelector(".cut-sheet");
  }
  return null;
}

function eventPoint(event) {
  const point = new DOMPoint(event.clientX, event.clientY)
    .matrixTransform(board.getScreenCTM().inverse());
  return [point.x, point.y].map((v) => event.shiftKey ? Math.round(v / SNAP) * SNAP : v);
}

board.addEventListener("pointerdown", (event) => {
  if (!ready || event.button !== 0 || drag || state.mode === "unfold") return;
  const { segment, handle } = event.target.dataset;
  if (handle) {
    drag = { pointer: event.pointerId, segment: Number(segment), handle, previous: state };
    board.setPointerCapture(event.pointerId);
    return;
  }
  const point = eventPoint(event);
  guarded(() => state.mode === "fold" ? selectFold(point) : drawPoint(point, event.target));
});

board.addEventListener("pointermove", (event) => {
  if (drag && event.pointerId !== drag.pointer) return;
  cursor = eventPoint(event);
  $("coordinates").textContent = `x ${cursor[0].toFixed(3)}  y ${cursor[1].toFixed(3)}`;
  if (drag) {
    const segments = state.draft.segments.slice();
    segments[drag.segment] = { ...segments[drag.segment], [drag.handle]: cursor };
    state = { ...state, draft: { ...state.draft, segments } };
  }
  if (state.foldPoints.length || (state.draft && (!state.draft.closed || drag))) renderMarks();
});

board.addEventListener("pointerleave", () => {
  cursor = null;
  $("coordinates").textContent = "x —  y —";
  renderMarks();
});

function finishDrag(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  if (event.type === "pointercancel") state = drag.previous;
  else if (state !== drag.previous) {
    undoStack.push(drag.previous);
    status("베지어 곡선을 갱신했어요.");
  }
  drag = null;
  render();
}

board.addEventListener("pointerup", finishDrag);
board.addEventListener("pointercancel", finishDrag);
board.addEventListener("lostpointercapture", finishDrag);

for (const button of modeButtons) button.addEventListener("click", () => changeMode(button.dataset.mode));
$("start-cut").addEventListener("click", () => changeMode("cut"));
$("start-unfold").addEventListener("click", () => changeMode("unfold"));
$("clear-line").addEventListener("click", () => commit({ foldPoints: [] }, "접는 선을 다시 그릴 수 있어요."));
$("clear-path").addEventListener("click", () => commit({ draft: null }, "오리기 경로를 지웠어요."));
$("close-path").addEventListener("click", () => guarded(closePath));
$("apply-cut").addEventListener("click", () => guarded(applyCut));
$("unfold").addEventListener("click", unfold);
const snow = mountSnowScene(renderTools);
const nameDialog = $("flake-name-dialog");
const nameForm = $("flake-name-form");
$("save-flake").addEventListener("click", () => {
  nameForm.reset();
  nameDialog.showModal();
});
$("cancel-flake-name").addEventListener("click", () => nameDialog.close());
nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const shape = finishedShape();
  if (!shape) return;
  const name = $("flake-name").value.trim();
  const result = snow.save(shape.getAttribute("d"), shape.getBBox(), name);
  nameDialog.close();
  if (result === "full") {
    status("보관함이 가득 찼어요. 눈 내리는 밤에서 결정 하나를 빼고 다시 담아 보세요.", true);
  } else if (result === "memory") {
    status("이번 탭에 담았어요. 브라우저 저장소를 사용할 수 없어 새로고침하면 사라져요.", true);
  } else if (result === "saved") {
    status(name ? `‘${name}’ 결정이 보관함에 담겼어요.` : "결정을 보관했어요. 눈 내리는 밤에서 만나요.");
  }
  if (result === "saved" || result === "memory") {
    $("view-saved-snow").focus({ preventScroll: true });
  }
});
$("undo").addEventListener("click", undo);
$("reset").addEventListener("click", reset);
$("show-crease").addEventListener("change", renderMarks);
$("fit").addEventListener("click", () => { fit = !fit; render(); });
for (const [id, cutOperation] of [["remove-area", "remove"], ["keep-area", "keep"]]) {
  $(id).addEventListener("click", () => {
    if (drag || state.cutOperation === cutOperation) return;
    state = { ...state, cutOperation };
    status(cutOperation === "keep" ? "그린 영역 안쪽의 종이만 남겨요." : "그린 영역에 닿는 종이를 잘라내요.");
    renderTools();
    renderMarks();
  });
}
for (const [id, segmentType] of [["line-tool", "line"], ["curve-tool", "cubic"]]) {
  $(id).addEventListener("click", () => {
    state = { ...state, segmentType };
    renderTools();
    renderMarks();
  });
}
document.addEventListener("keydown", (event) => {
  if (nameDialog.open || $("snow-scene").open) return;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  }
  if (event.key === "Escape" && !drag) {
    if (state.foldPoints.length) $("clear-line").click();
    if (state.draft) $("clear-path").click();
  }
});
new ResizeObserver(renderBoard).observe(board);

try {
  await initCurves();
  ready = true;
  status("준비됐어요. 첫 접는 선을 그려 보세요.");
} catch (error) {
  console.error(error);
  status("iShape WASM을 불러오지 못했어요. README의 서버 위치와 파일 경로를 확인하세요.", true);
}
render();
