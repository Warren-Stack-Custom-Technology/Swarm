export const SWARM_SHAPES = [
  "circle",
  "diamond",
  "triangle",
  "square",
  "star",
  "cross",
] as const;
export type TorrentShape = (typeof SWARM_SHAPES)[number];

export const SHAPE_PATHS: Record<TorrentShape, string> = {
  circle: "M -5 0 A 5 5 0 1 0 5 0 A 5 5 0 1 0 -5 0 Z",
  diamond: "M 0 -7 L 6 0 L 0 7 L -6 0 Z",
  triangle: "M 0 -7 L 6 5 L -6 5 Z",
  square: "M -5 -5 H 5 V 5 H -5 Z",
  star: "M 0 -7 L 2 -2 L 7 -2 L 3 1 L 4 6 L 0 3 L -4 6 L -3 1 L -7 -2 L -2 -2 Z",
  cross: "M -2 -6 H 2 V -2 H 6 V 2 H 2 V 6 H -2 V 2 H -6 V -2 H -2 Z",
};
const SHAPE_VERTICES: Record<Exclude<TorrentShape, "circle">, number[][]> = {
  diamond: [
    [0, -1],
    [0.86, 0],
    [0, 1],
    [-0.86, 0],
  ],
  triangle: [
    [0, -1],
    [0.86, 0.72],
    [-0.86, 0.72],
  ],
  square: [
    [-0.72, -0.72],
    [0.72, -0.72],
    [0.72, 0.72],
    [-0.72, 0.72],
  ],
  star: [
    [0, -1],
    [0.29, -0.29],
    [1, -0.29],
    [0.43, 0.14],
    [0.57, 0.86],
    [0, 0.43],
    [-0.57, 0.86],
    [-0.43, 0.14],
    [-1, -0.29],
    [-0.29, -0.29],
  ],
  cross: [
    [-0.29, -0.86],
    [0.29, -0.86],
    [0.29, -0.29],
    [0.86, -0.29],
    [0.86, 0.29],
    [0.29, 0.29],
    [0.29, 0.86],
    [-0.29, 0.86],
    [-0.29, 0.29],
    [-0.86, 0.29],
    [-0.86, -0.29],
    [-0.29, -0.29],
  ],
};

export function torrentIdentityHash(hash: string) {
  let value = 0;
  for (const character of hash)
    value = (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0;
  return value;
}

export function automaticTorrentShape(hash: string): TorrentShape {
  return SWARM_SHAPES[
    Math.floor(torrentIdentityHash(hash) / 8) % SWARM_SHAPES.length
  ];
}

// Keep symbols upright: rotation would make squares look like diamonds.
export function drawTorrentShape(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: TorrentShape,
  x: number,
  y: number,
  radius: number,
) {
  context.beginPath();
  if (shape === "circle") context.arc(x, y, radius * 0.76, 0, Math.PI * 2);
  else {
    SHAPE_VERTICES[shape].forEach(([vx, vy], index) => {
      if (index === 0) context.moveTo(x + vx * radius, y + vy * radius);
      else context.lineTo(x + vx * radius, y + vy * radius);
    });
    context.closePath();
  }
  context.fill();
  context.stroke();
}
