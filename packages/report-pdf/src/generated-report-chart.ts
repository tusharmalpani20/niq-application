export type WeightPoint = { date: string | null; kg: number; label?: string };

export function weightChartPoints(weights: WeightPoint[], width = 600, height = 170) {
  if (weights.length < 2) return [];
  const values = weights.map(item => item.kg);
  const lower = Math.min(...values);
  const upper = Math.max(...values);
  const spread = Math.max(upper - lower, 2);
  const min = lower - spread * 0.18;
  const max = upper + spread * 0.18;
  const left = 45;
  const right = width - 35;
  const top = 18;
  const bottom = height - 38;
  return weights.map((item, index) => ({
    ...item,
    x: left + (right - left) * index / (weights.length - 1),
    y: bottom - (item.kg - min) / (max - min) * (bottom - top),
  }));
}
