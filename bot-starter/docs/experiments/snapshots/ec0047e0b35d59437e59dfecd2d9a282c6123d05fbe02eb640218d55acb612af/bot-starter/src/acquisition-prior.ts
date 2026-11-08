import prior from './acquisition-prior.json';

/** Experimental composition prior. It does not change the number of future tiles. */
export function acquisitionWeights(power = 0): Readonly<Record<string, number>> | undefined {
  if (power === 0) return undefined;
  if (!Number.isFinite(power) || power < 0 || power > 3) throw new Error('Invalid acquisition price power');
  return Object.fromEntries(Object.entries(prior.medianByLetter).map(([letter, price]) =>
    [letter, Math.pow(prior.reference / Math.max(1, price), power)]));
}
