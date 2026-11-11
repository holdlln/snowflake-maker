import ear from "../rabbit-ear/src/index.js";

const {
  invertMatrix2,
  makeMatrix2Reflect,
  multiplyMatrices2,
  multiplyMatrix2Vector2,
} = ear.math;

export const FOLD_EPSILON = 1e-6;
export const POINT_GAP = 0.0005;
const MATRIX_TOLERANCE = 2e-5;
const IDENTITY = [1, 0, 0, 1, 0, 0];

export const transformPoint = (matrix, point) => multiplyMatrix2Vector2(matrix, point);
export const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function makeLine(a, b) {
  const length = distance(a, b);
  if (length < POINT_GAP) throw new Error("첫 점과 떨어진 곳에 두 번째 점을 찍으세요.");
  return { origin: a, vector: [(b[0] - a[0]) / length, (b[1] - a[1]) / length] };
}

export function signedDistance({ origin, vector }, [x, y]) {
  return vector[0] * (y - origin[1]) - vector[1] * (x - origin[0]);
}

function makeFrame(graph, parents, crease = null) {
  const faces = graph.faces_vertices.map((indices, index) => {
    const matrix = graph.faces_matrix2[index];
    const original = indices.map((vertex) => graph.vertices_coords[vertex].slice(0, 2));
    return {
      parent: parents[index],
      matrix,
      inverse: invertMatrix2(matrix),
      original,
      polygon: original.map((point) => transformPoint(matrix, point)),
      layer: graph.faces_layer[index],
    };
  });
  return { graph, faces, crease };
}

export function makePaper() {
  const graph = ear.graph.square();
  graph.faces_matrix2 = [IDENTITY];
  graph.faces_layer = [0];
  return makeFrame(graph, [null]);
}

export function crossesPaper(frame, line) {
  const distances = frame.faces.flatMap(({ polygon }) => polygon.map((p) => signedDistance(line, p)));
  return distances.some((d) => d < -FOLD_EPSILON) && distances.some((d) => d > FOLD_EPSILON);
}

// Clip a convex polygon to the side being previewed. This is only for the UI.
export function movingPart(polygon, line, sign) {
  return polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const da = signedDistance(line, a) * sign;
    const db = signedDistance(line, b) * sign;
    const points = da >= 0 ? [a] : [];
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return points;
  });
}

export function foldPaper(previous, line, sidePoint) {
  if (!crossesPaper(previous, line)) throw new Error("종이 안쪽을 가로지르는 선을 그으세요.");
  const side = signedDistance(line, sidePoint);
  if (Math.abs(side) < FOLD_EPSILON) throw new Error("접는 선에서 조금 떨어진 쪽을 선택하세요.");

  // Rabbit Ear flips the positive cross-product side, regardless of face winding.
  const vector = side > 0 ? line.vector : line.vector.map((value) => -value);
  const orientedLine = { origin: line.origin, vector };
  const graph = structuredClone(previous.graph);
  const change = ear.graph.flatFold(graph, orientedLine, "V", FOLD_EPSILON);
  const nextmap = change.faces.map;
  const parents = [];
  previous.faces.forEach((_, parent) => {
    const children = nextmap.length ? nextmap[parent] : [parent];
    for (const child of children) parents[child] = parent;
  });

  // Check that each Rabbit Ear matrix preserves the fixed side and reflects the moving side.
  const frame = makeFrame(graph, parents, orientedLine);
  const reflection = makeMatrix2Reflect(vector, line.origin);
  for (const face of frame.faces) {
    const matrix = previous.faces[face.parent].matrix;
    const positions = face.original.map((p) => transformPoint(matrix, p));
    const offsets = positions.map((p) => signedDistance(orientedLine, p));
    const moving = offsets.reduce((sum, offset) => sum + offset, 0) > 0;
    const expected = moving ? multiplyMatrices2(reflection, matrix) : matrix;
    const straddles = offsets.some((d) => d < -FOLD_EPSILON)
      && offsets.some((d) => d > FOLD_EPSILON);
    if (straddles || !face.inverse || !face.matrix.every((v, i) => Math.abs(v - expected[i]) < MATRIX_TOLERANCE)) {
      throw new Error("이 선에서는 면이 안정적으로 나뉘지 않았어요. 선을 조금 옮겨 다시 시도하세요.");
    }
  }
  return frame;
}

export function ancestorAt(frames, leaf, depth) {
  for (let i = frames.length - 1; i > depth; i--) {
    leaf = frames[i].faces[leaf].parent;
  }
  return leaf;
}
