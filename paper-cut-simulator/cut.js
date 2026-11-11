import init, {
  CurveBuilder, CurveOverlay, FillRule, OverlayRule,
} from "../icurve/iShape-js/pkg/ishape_wasm.js";
import { transformPoint } from "./paper.js";

export const initCurves = () => init();

export function polygonPath([start, ...points]) {
  return { start, segments: points.map((to) => ({ type: "line", to })) };
}

export function transformPaths(paths, matrix) {
  const point = (p) => transformPoint(matrix, p);
  return paths.map(({ start, segments }) => ({
    start: point(start),
    segments: segments.map((segment) => {
      const { type, to } = segment;
      if (type === "line") return { type, to: point(to) };
      if (type === "quad") return { type, to: point(to), ctrl: point(segment.ctrl) };
      return { type, to: point(to), ctrl0: point(segment.ctrl0), ctrl1: point(segment.ctrl1) };
    }),
  }));
}

function buildGeometry(paths) {
  const builder = new CurveBuilder();
  try {
    for (const { start, segments } of paths) {
      builder.moveTo(...start);
      for (const segment of segments) {
        if (segment.type === "line") builder.lineTo(...segment.to);
        else if (segment.type === "quad") builder.quadraticCurveTo(...segment.ctrl, ...segment.to);
        else builder.bezierCurveTo(...segment.ctrl0, ...segment.ctrl1, ...segment.to);
      }
      builder.closeContour();
    }
    return builder.build();
  } finally {
    builder.free();
  }
}

function runOverlay(overlay, rule) {
  // This wasm binding consumes the overlay when the Boolean operation runs.
  const result = overlay.overlay(rule, FillRule.EvenOdd);
  try {
    return result.toData().flat();
  } finally {
    result.free();
  }
}

export function resolvePath(path) {
  const geometry = buildGeometry([path]);
  try {
    return runOverlay(CurveOverlay.fromSubject(geometry), OverlayRule.Subject);
  } finally {
    geometry.free();
  }
}

export function cutPaper(frame, previousPieces, path, operation = "remove") {
  const cutter = buildGeometry([path]);
  try {
    return frame.faces.map((face, index) => {
      const previous = previousPieces?.[index];
      const original = previous?.remaining ?? [polygonPath(face.original)];
      if (!original.length) return { remaining: [], removed: [] };
      const folded = previous
        ? transformPaths(original, face.matrix)
        : [polygonPath(face.polygon)];
      const material = buildGeometry(folded);
      try {
        const hit = runOverlay(new CurveOverlay(material, cutter), OverlayRule.Intersect);
        if (!hit.length) {
          return operation === "keep"
            ? { remaining: [], removed: original }
            : { remaining: original, removed: [] };
        }
        const rest = runOverlay(new CurveOverlay(material, cutter), OverlayRule.Difference);
        const [remaining, removed] = operation === "keep" ? [hit, rest] : [rest, hit];
        return {
          remaining: transformPaths(remaining, face.inverse),
          removed: transformPaths(removed, face.inverse),
        };
      } finally {
        material.free();
      }
    });
  } finally {
    cutter.free();
  }
}

export function pathData(paths, close = true) {
  const point = (p) => p.map((v) => Number(v.toFixed(9))).join(" ");
  return paths.map(({ start, segments }) => {
    const commands = segments.map((seg) => {
      if (seg.type === "line") return `L${point(seg.to)}`;
      if (seg.type === "quad") return `Q${point(seg.ctrl)} ${point(seg.to)}`;
      return `C${point(seg.ctrl0)} ${point(seg.ctrl1)} ${point(seg.to)}`;
    });
    return [`M${point(start)}`, ...commands, close ? "Z" : ""].join(" ");
  }).join(" ");
}
