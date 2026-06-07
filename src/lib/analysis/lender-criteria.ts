export type InvestorType =
  | "individual"
  | "ltd_company"
  | "group_holding"
  | "portfolio_landlord"
  | "first_time_landlord";

export interface LenderCriteria {
  mortgage_rate: number;
  ltv: number;
  stress_rate: number;
  label: string;
  description: string;
}

// Approximate UK BTL lending bands by ownership/borrower structure. What changes a *lender's* risk
// appetite — and therefore the rate, max LTV and stress methodology on offer — is the structure the
// investor borrows through, not their personal target numbers. Centralising this here means the
// figures can be refined as the market moves without asking every persona to guess at their own
// mortgage terms.
export const LENDER_CRITERIA: Record<InvestorType, LenderCriteria> = {
  individual: {
    mortgage_rate: 0.0525,
    ltv: 0.75,
    stress_rate: 0.055,
    label: "Personal name (individual)",
    description:
      "Widest lender choice and the cheapest headline rates, up to ~75-80% LTV. Higher-rate taxpayers face a tougher 145% rent-cover stress test (vs 125% for Ltd co or basic-rate borrowers) and lose full mortgage-interest relief.",
  },
  ltd_company: {
    mortgage_rate: 0.0575,
    ltv: 0.75,
    stress_rate: 0.05,
    label: "Limited company (SPV)",
    description:
      "Rates and product fees typically run ~0.25-0.75pts above personal lending and the lender pool is narrower, but you keep full mortgage-interest relief and a flat 125% stress test regardless of tax band — often the cheaper route overall for higher-rate taxpayers.",
  },
  group_holding: {
    mortgage_rate: 0.06,
    ltv: 0.70,
    stress_rate: 0.055,
    label: "Group / holding structure",
    description:
      "Multi-SPV or parent-company structures narrow the lender pool further still — expect a rate premium, a lower max LTV (~70%), and full underwriting of group accounts and inter-company loans before any offer is made.",
  },
  portfolio_landlord: {
    mortgage_rate: 0.0575,
    ltv: 0.70,
    stress_rate: 0.06,
    label: "Portfolio landlord (4+ mortgaged BTLs)",
    description:
      "PRA portfolio rules mean the lender stress-tests your whole portfolio, not just this loan — expect a lower max LTV (~70%), heavier paperwork (full schedule, business plan), and a modest rate premium versus a one-off BTL.",
  },
  first_time_landlord: {
    mortgage_rate: 0.055,
    ltv: 0.75,
    stress_rate: 0.055,
    label: "First-time landlord",
    description:
      "Fewer lenders will take on a first BTL — typically capped at ~75% LTV, and some require an existing residential mortgage or a minimum personal income (~£25k/yr) before they'll lend.",
  },
};

export const INVESTOR_TYPES = Object.keys(LENDER_CRITERIA) as InvestorType[];

export function deriveLenderCriteria(type: InvestorType | string | null | undefined): LenderCriteria {
  return LENDER_CRITERIA[type as InvestorType] ?? LENDER_CRITERIA.individual;
}
