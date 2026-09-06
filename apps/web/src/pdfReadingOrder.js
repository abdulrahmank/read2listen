const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 1;
};

/** Convert PDF coordinates to displayed page coordinates, including page rotation. */
export function pdfTextBoxes(items, viewport) {
  const point = (x, y) => {
    const [a, b, c, d, e, f] = viewport.transform;
    return [a * x + c * y + e, b * x + d * y + f];
  };
  return items.filter(item => item.str?.trim()).map(item => {
    const [a, b, c, d, x, y] = item.transform;
    const baseline = Math.hypot(a, b) || 1;
    const vertical = Math.hypot(c, d) || 1;
    const dx = a / baseline * item.width;
    const dy = b / baseline * item.width;
    const hx = c / vertical * item.height;
    const hy = d / vertical * item.height;
    const corners = [point(x, y), point(x + dx, y + dy), point(x + hx, y + hy), point(x + dx + hx, y + dy + hy)];
    const xs = corners.map(p => p[0]);
    const ys = corners.map(p => p[1]);
    return { text: item.str, x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), dir: item.dir };
  });
}

/**
 * Geometric reading order for ordinary one- and two-column articles.
 * A repeated gutter separates columns; lines crossing it divide the page into
 * sections, so a full-width heading stays before the columns beneath it.
 * Every text box is retained. Tables and irregular magazine layouts may still
 * need editorial reading order that geometry alone cannot supply.
 */
export function orderPdfText(boxes) {
  if (!boxes.length) return '';
  const fontHeight = median(boxes.map(box => box.height));
  const rowTolerance = Math.max(2, fontHeight * 0.45);
  const rows = [];
  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && Math.abs(row.y - box.y) <= rowTolerance) row.boxes.push(box);
    else rows.push({ y: box.y, boxes: [box] });
  }
  const lines = [];
  const gaps = [];
  const minGap = Math.max(12, fontHeight * 1.5);
  for (const row of rows) {
    const sorted = row.boxes.sort((a, b) => a.x - b.x);
    let line;
    for (const box of sorted) {
      if (line && box.x - line.right <= minGap) {
        line.parts.push(box);
        line.right = Math.max(line.right, box.x + box.width);
      } else {
        if (line) gaps.push({ left: line.right, right: box.x, y: row.y });
        line = { x: box.x, right: box.x + box.width, y: row.y, parts: [box] };
        lines.push(line);
      }
    }
  }
  const leftEdge = Math.min(...lines.map(line => line.x));
  const rightEdge = Math.max(...lines.map(line => line.right));
  const width = rightEdge - leftEdge;
  // Quantize candidates to keep the search bounded even for large pages.
  const candidates = new Set(gaps.map(gap => Math.round((gap.left + gap.right) / 2 / minGap) * minGap));
  let gutter;
  let bestScore = 0;
  for (const x of candidates) {
    if (x < leftEdge + width * 0.2 || x > rightEdge - width * 0.2) continue;
    const supporting = gaps.filter(gap => gap.left + minGap / 2 <= x && gap.right - minGap / 2 >= x);
    if (new Set(supporting.map(gap => gap.y)).size < 2) continue;
    const left = lines.filter(line => line.right <= x);
    const right = lines.filter(line => line.x >= x);
    const crossing = lines.length - left.length - right.length;
    if (left.length < 2 || right.length < 2 || crossing > lines.length * 0.3) continue;
    // Avoid treating list markers or indented labels as an article column.
    if (median(left.map(line => line.right - line.x)) < width * 0.15 ||
        median(right.map(line => line.right - line.x)) < width * 0.15) continue;
    const overlap = Math.min(left.at(-1).y, right.at(-1).y) - Math.max(left[0].y, right[0].y);
    if (overlap < fontHeight) continue;
    const score = supporting.length - crossing;
    if (score > bestScore) { bestScore = score; gutter = x; }
  }
  const render = list => list.map(line => {
    const rtl = line.parts.filter(part => part.dir === 'rtl').length > line.parts.length / 2;
    const parts = rtl ? [...line.parts].reverse() : line.parts;
    return parts.map(part => part.text.trim()).join(' ');
  }).join('\n');
  if (gutter === undefined) return render(lines);

  const sections = [];
  let band = [];
  const rtl = boxes.filter(box => box.dir === 'rtl').length > boxes.length / 2;
  const flush = () => {
    const left = band.filter(line => line.right <= gutter);
    const right = band.filter(line => line.x >= gutter);
    for (const column of rtl ? [right, left] : [left, right]) {
      if (column.length) sections.push(render(column));
    }
    band = [];
  };
  for (const line of lines) {
    if (line.x < gutter && line.right > gutter) {
      flush();
      sections.push(render([line]));
    } else band.push(line);
  }
  flush();
  return sections.join('\n\n');
}
