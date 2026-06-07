export const fmtGBP = (n: number | null | undefined, decimals = 0): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
};

export const fmtPct = (n: number | null | undefined, decimals = 1): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
};

export const fmtNum = (n: number | null | undefined, decimals = 0): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
};