export function AppFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="container mx-auto grid gap-6 px-6 py-8 text-sm text-muted-foreground sm:grid-cols-3">
        <div>
          <img src="/omnispace-logo.png" alt="Deal Negotiator — Omnispace Estates" className="h-8 w-auto" />
          <p className="mt-3 text-xs">Negotiate deals like a pro — analysis, leverage and deal sheets for UK property investors.</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Not financial advice</p>
          <p className="mt-2 text-xs leading-relaxed">
            Deal Negotiator is an analysis and negotiation-preparation tool, not a financial adviser, surveyor, solicitor or mortgage broker.
            Every figure on this site — deal scores, suggested offers, walk-away prices, refurb estimates, rental projections, EPC costings,
            survey markdown ranges and AI-generated commentary — is an algorithmic or AI-assisted estimate produced from incomplete, third-party
            data. None of it is a recommendation to buy, sell, let, lend against, or value any property, and none of it constitutes financial,
            legal, surveying, tax or investment advice.
          </p>
          <p className="mt-2 text-xs leading-relaxed">
            Property investment carries real financial risk, including the possibility of losing money. Always carry out your own due diligence —
            commission a RICS Level 2/3 survey, take independent financial, legal, tax and mortgage advice, and verify every figure shown here
            (asking price, condition, EPC, planning status, comparables, rents and costs) directly with the agent, surveyor, solicitor and lender
            before making any offer or commitment. Use your own judgement: you, not this tool, are responsible for any decision you make.
          </p>
        </div>
      </div>
      <div className="border-t">
        <div className="container mx-auto px-6 py-3 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Omnispace Estates · Deal Negotiator — for informational purposes only, not financial advice.
        </div>
      </div>
    </footer>
  );
}
