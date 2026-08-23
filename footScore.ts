export type TeamMetrics = {
  attack: number;
  defense: number;
  creation: number;
  form: number;
  efficiency: number;
  homeAway: number;
};

export function footScore(m: TeamMetrics): number {
  const score =
    m.attack * 0.25 +
    m.defense * 0.25 +
    m.creation * 0.15 +
    m.form * 0.15 +
    m.efficiency * 0.10 +
    m.homeAway * 0.10;

  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}
