/** Rectangle packing in physical units. A gap is reserved between frames, not at sheet edges. */
export type PackingItem<T> = { data: T; width: number; height: number };
type Rectangle = { x: number; y: number; width: number; height: number };
export type PackedItem<T> = Rectangle & { data: T; rotated: boolean };
export type PackingPage<T> = { placements: PackedItem<T>[] };
const EPS = 1e-7;

function orientations<T>(item: PackingItem<T>) {
  const normal = { width: item.width, height: item.height, rotated: false };
  return Math.abs(item.width - item.height) < EPS
    ? [normal]
    : [normal, { width: item.height, height: item.width, rotated: true }];
}

function contains(outer: Rectangle, inner: Rectangle) {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.width <= outer.x + outer.width + EPS &&
    inner.y + inner.height <= outer.y + outer.height + EPS
  );
}

/** Split every intersecting free rectangle; free spaces can overlap, placed frames cannot. */
function splitFreeRectangles(free: Rectangle[], used: Rectangle): Rectangle[] {
  const next: Rectangle[] = [];
  const right = used.x + used.width,
    bottom = used.y + used.height;
  for (const r of free) {
    const rRight = r.x + r.width,
      rBottom = r.y + r.height;
    if (
      used.x >= rRight - EPS ||
      right <= r.x + EPS ||
      used.y >= rBottom - EPS ||
      bottom <= r.y + EPS
    ) {
      next.push(r);
      continue;
    }
    if (used.x > r.x + EPS) next.push({ ...r, width: used.x - r.x });
    if (right < rRight - EPS) next.push({ ...r, x: right, width: rRight - right });
    if (used.y > r.y + EPS) next.push({ ...r, height: used.y - r.y });
    if (bottom < rBottom - EPS) next.push({ ...r, y: bottom, height: rBottom - bottom });
  }
  return next.filter(
    (r, i) =>
      !next.some((other, j) => j !== i && contains(other, r) && (!contains(r, other) || j < i)),
  );
}

function maxRects<T>(
  items: PackingItem<T>[],
  width: number,
  height: number,
  gap: number,
  heuristic: 'side' | 'area',
): PackingPage<T>[] {
  const pages: (PackingPage<T> & { free: Rectangle[] })[] = [];
  for (const item of items) {
    let chosen:
      | {
          page: (typeof pages)[number];
          frame: ReturnType<typeof orientations<T>>[number];
          space: Rectangle;
        }
      | undefined;
    // Revisit previous sheets to fill holes left by larger frames.
    for (let pageIndex = 0; pageIndex <= pages.length; pageIndex++) {
      const page = pages[pageIndex] ?? {
        placements: [],
        free: [{ x: 0, y: 0, width: width + gap, height: height + gap }],
      };
      let score: number[] | undefined;
      for (const space of page.free)
        for (const frame of orientations(item)) {
          const w = frame.width + gap,
            h = frame.height + gap;
          if (w > space.width + EPS || h > space.height + EPS) continue;
          const short = Math.min(space.width - w, space.height - h),
            long = Math.max(space.width - w, space.height - h);
          const candidate =
            heuristic === 'side'
              ? [short, long, space.y, space.x, Number(frame.rotated)]
              : [
                  space.width * space.height - w * h,
                  short,
                  space.y,
                  space.x,
                  Number(frame.rotated),
                ];
          if (!score || compareScores(candidate, score) < 0) {
            score = candidate;
            chosen = { page, frame, space };
          }
        }
      if (chosen) {
        if (pageIndex === pages.length) pages.push(page);
        break;
      }
    }
    if (!chosen) throw new Error('Could not place a print on this sheet.');
    const { page, frame, space } = chosen;
    page.placements.push({ data: item.data, ...frame, x: space.x, y: space.y });
    page.free = splitFreeRectangles(page.free, {
      x: space.x,
      y: space.y,
      width: frame.width + gap,
      height: frame.height + gap,
    });
  }
  return pages.map(({ placements }) => ({ placements }));
}

function compareScores(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return a[i] - b[i];
  return 0;
}

/** Keep the original row strategy as another candidate, so existing orders cannot regress. */
function rows<T>(
  items: PackingItem<T>[],
  width: number,
  height: number,
  gap: number,
): PackingPage<T>[] {
  const pages: PackingPage<T>[] = [];
  let page: PackingPage<T> = { placements: [] },
    x = 0,
    y = 0,
    rowHeight = 0;
  for (const item of items) {
    const fits = () =>
      orientations(item)
        .filter((r) => x + r.width <= width + EPS && y + r.height <= height + EPS)
        .sort(
          (a, b) =>
            Math.max(rowHeight, a.height) - Math.max(rowHeight, b.height) || a.height - b.height,
        )[0];
    let frame = fits();
    if (!frame) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
      frame = fits();
    }
    if (!frame) {
      if (page.placements.length) pages.push(page);
      page = { placements: [] };
      x = 0;
      y = 0;
      rowHeight = 0;
      frame = fits();
    }
    if (!frame) throw new Error('Could not place a print on this sheet.');
    page.placements.push({ data: item.data, ...frame, x, y });
    x += frame.width + gap;
    rowHeight = Math.max(rowHeight, frame.height);
  }
  if (page.placements.length) pages.push(page);
  return pages;
}

function planScore<T>(pages: PackingPage<T>[]) {
  const area = (page: PackingPage<T>) =>
    page.placements.reduce((n, p) => n + p.width * p.height, 0);
  return [
    pages.length,
    pages.length ? area(pages[pages.length - 1]) : 0,
    pages.reduce((n, p) => n + Math.max(0, ...p.placements.map((r) => r.y + r.height)), 0),
  ];
}

/** Try several deterministic arrangements and retain the one using the fewest sheets. */
export function packPrints<T>(
  items: PackingItem<T>[],
  width: number,
  height: number,
  gap: number,
): PackingPage<T>[] {
  const area = (r: PackingItem<T>) => r.width * r.height;
  const areaOrder = [...items].sort((a, b) => area(b) - area(a));
  let best = rows(areaOrder, width, height, gap),
    bestScore = planScore(best);
  const orders = [
    areaOrder,
    [...items].sort(
      (a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || area(b) - area(a),
    ),
  ];
  if (items.length <= 250)
    orders.push(
      [...items].sort(
        (a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height) || area(b) - area(a),
      ),
    );
  for (const sorted of orders)
    for (const heuristic of (items.length <= 250 ? ['side', 'area'] : ['side']) as (
      'side' | 'area'
    )[]) {
      const candidate = maxRects(sorted, width, height, gap, heuristic),
        score = planScore(candidate);
      if (compareScores(score, bestScore) < 0) {
        best = candidate;
        bestScore = score;
      }
    }
  return best;
}
