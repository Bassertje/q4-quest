/** CO₂ absorbed by one tree per year (kg), for the "trees" comparison. */
export const TREE_KG_PER_YEAR = 20;

export interface GreenFactors {
  co2PetrolKgPerKm: number;
  co2GridKgPerKwh: number;
  petrolLPer100km: number;
}

export interface GreenTotals {
  /** CO₂ saved compared with a petrol car (kg); never negative; null without charging data. */
  co2Kg: number | null;
  /** Petrol not burned (litres). */
  liters: number;
  /** CO₂ ÷ 20 kg per tree per year; null without CO₂. */
  trees: number | null;
}

/** CO₂ saved: km × petrol CO₂ − charged kWh × grid CO₂ (can be negative internally). */
export function co2Saved(km: number, kwh: number, f: GreenFactors): number {
  return km * f.co2PetrolKgPerKm - kwh * f.co2GridKgPerKwh;
}

export function litersSaved(km: number, f: GreenFactors): number {
  return (km * f.petrolLPer100km) / 100;
}

/** Totals for display: rounded, and CO₂ never shown as negative. */
export function greenTotals(km: number, kwh: number | null, f: GreenFactors): GreenTotals {
  const co2 = kwh === null ? null : Math.max(0, Math.round(co2Saved(km, kwh, f)));
  return {
    co2Kg: co2,
    liters: Math.round(litersSaved(km, f)),
    trees: co2 === null ? null : Math.round((co2 / TREE_KG_PER_YEAR) * 10) / 10,
  };
}
