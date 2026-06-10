export interface LeaseExtensionEstimate {
  yearsRemaining: number;
  groundRentPa: number;
  /** Capitalised value of the ground rent the freeholder gives up, at a 6% yield. */
  groundRentLoss: number;
  /** PV of the freeholder's reversionary interest (the property reverting to them at lease end). */
  reversionaryInterest: number;
  /** Only payable when the unexpired term is under 80 years — 50% of the value created by the
   *  extension, split between leaseholder and freeholder. */
  marriageValue: number | null;
  hasMarriageValue: boolean;
  premiumLow: number;
  premiumMid: number;
  premiumHigh: number;
}

/** Rough relativity curve (short-lease value as a % of long-lease/extended value) — a piecewise
 *  approximation of the published RICS-style relativity graphs commonly used in lease-extension
 *  valuations. Real cases use a specific graph (e.g. RICS 2020 / "Sussex") and are sensitive to
 *  small differences near the 80-year marriage-value cliff — treat this as an indicative
 *  estimate, not a substitute for a qualified valuer's figure. */
function leaseRelativity(years: number): number {
  if (years >= 99) return 1.0;
  if (years >= 90) return 0.97;
  if (years >= 80) return 0.93;
  if (years >= 70) return 0.85;
  if (years >= 60) return 0.75;
  if (years >= 50) return 0.65;
  if (years >= 40) return 0.55;
  if (years >= 30) return 0.45;
  return 0.35;
}

/** Estimates the lease-extension premium for a flat, following the same ground-rent-loss +
 *  reversionary-interest (+ marriage value if the term is under 80 years) structure as Property
 *  Filter's lease-extension calculator (6% capitalisation rate, 5% deferment rate, 50/50
 *  marriage value split below 80 years). `propertyValue` should be the property's value with a
 *  long lease (e.g. asking price) — returns null for terms of 90+ years, where the premium is
 *  small enough (typically £5k-£10k) that this estimate adds little over a flat allowance. */
export function estimateLeaseExtensionPremium(
  yearsRemaining: number,
  groundRentPa: number,
  propertyValue: number,
): LeaseExtensionEstimate | null {
  if (yearsRemaining <= 0 || yearsRemaining >= 90 || propertyValue <= 0) return null;

  const CAP_RATE = 0.06;
  const DEFERMENT_RATE = 0.05;

  const yearsPurchase = (1 - Math.pow(1 + CAP_RATE, -yearsRemaining)) / CAP_RATE;
  const groundRentLoss = groundRentPa * yearsPurchase;

  const relativity = leaseRelativity(yearsRemaining);
  const shortLeaseValue = propertyValue * relativity;
  const reversionaryInterest =
    (propertyValue - shortLeaseValue) * Math.pow(1 + DEFERMENT_RATE, -yearsRemaining);

  const hasMarriageValue = yearsRemaining < 80;
  let marriageValue: number | null = null;
  if (hasMarriageValue) {
    const valueCreated = propertyValue - shortLeaseValue - groundRentLoss - reversionaryInterest;
    marriageValue = Math.max(0, Math.round(valueCreated * 0.5));
  }

  const mid = groundRentLoss + reversionaryInterest + (marriageValue ?? 0);
  return {
    yearsRemaining,
    groundRentPa,
    groundRentLoss: Math.round(groundRentLoss),
    reversionaryInterest: Math.round(reversionaryInterest),
    marriageValue,
    hasMarriageValue,
    premiumLow: Math.round(mid * 0.97),
    premiumMid: Math.round(mid),
    premiumHigh: Math.round(mid * 1.03),
  };
}
