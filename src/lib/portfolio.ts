export type PortfolioInput = {
  quantity: number | null;
  averageBuyPrice: number | null;
  latestClose: number | null;
  sector?: string | null;
};

export type PortfolioPosition = PortfolioInput & {
  shares: number;
  invested: number | null;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
};

const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function calculatePosition(input: PortfolioInput): PortfolioPosition {
  const shares = positive(input.quantity) ? input.quantity : 0;
  const invested = shares && positive(input.averageBuyPrice) ? shares * input.averageBuyPrice : null;
  const currentValue = shares && positive(input.latestClose) ? shares * input.latestClose : null;
  const profitLoss = invested !== null && currentValue !== null ? currentValue - invested : null;

  return {
    ...input,
    shares,
    invested,
    currentValue,
    profitLoss,
    profitLossPercent: profitLoss !== null && invested ? (profitLoss / invested) * 100 : null,
  };
}

export function summarisePortfolio(inputs: PortfolioInput[]) {
  const positions = inputs.map(calculatePosition);
  const totalShares = positions.reduce((sum, p) => sum + p.shares, 0);
  const totalInvested = positions.reduce((sum, p) => sum + (p.invested ?? 0), 0);
  const totalCurrentValue = positions.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);
  const pricedCostBasis = positions.reduce((sum, p) => sum + (p.profitLoss !== null ? p.invested ?? 0 : 0), 0);
  const totalProfitLoss = positions.reduce((sum, p) => sum + (p.profitLoss ?? 0), 0);

  return {
    positions,
    totalShares,
    totalInvested,
    totalCurrentValue,
    totalProfitLoss,
    totalProfitLossPercent: pricedCostBasis > 0 ? (totalProfitLoss / pricedCostBasis) * 100 : null,
    positionsWithCostAndPrice: positions.filter((p) => p.profitLoss !== null).length,
    positionsMissingCost: positions.filter((p) => p.shares > 0 && p.invested === null).length,
    positionsMissingPrice: positions.filter((p) => p.shares > 0 && p.currentValue === null).length,
  };
}