/**
 * Checkout arithmetic for Tips & Checkouts (s78) — pure functions, no I/O.
 *
 * The SOLO math mirrors the legacy check-out-calculator screen EXACTLY
 * (that screen retires at the end of this wave):
 *  - every tip-out position is a % of the ORIGINAL total sales;
 *  - the declare amount is % of the party-ADJUSTED sales (±half the party
 *    subtotal depending on whose name the check was under);
 *  - the tally is cash(signed) + all tip-outs — ≥ 0 means the server OWES the
 *    house, negative means the house owes them;
 *  - the shared-party gratuity split subtracts the party's own tip-outs from
 *    the gratuity and halves the remainder.
 *
 * POOLED mode (new, Steve's spec): per-server sales and SIGNED cash rows are
 * summed, tip-outs and declare run off the pooled totals, and every settle
 * figure also reports a ÷N per-server line. "Share a party" does not exist in
 * pooled mode — the whole night is shared.
 */

export interface TipOutLine {
  /** Org job title, EN-canonical (display is translated; data stays EN). */
  title: string;
  /** Fraction, e.g. 0.035 for 3.5%. */
  pct: number;
}

export interface TipOutAmount extends TipOutLine {
  amount: number;
}

export interface PartyInputs {
  subtotal: number;
  gratuity: number;
  checkUnderMyName: boolean;
}

export interface SoloInputs {
  sales: number;
  /** Signed: + the server holds house cash, − the house owes the server. */
  cash: number;
  /** Fraction, e.g. 0.12. */
  declarePct: number;
  tipOuts: TipOutLine[];
  party?: PartyInputs | null;
}

export interface PartyResult {
  /** Sales used for the declare amount (±half the party subtotal). */
  adjustedSales: number;
  /** The party's own tip-outs, taken off the gratuity before splitting. */
  partyTipOuts: number;
  gratuityAfterTipOuts: number;
  /** Half of the remainder — what one teammate owes the other. */
  splitAmount: number;
  /** True: you hold the gratuity, so you owe your teammate the split. */
  youOweTeammate: boolean;
}

export interface SoloResult {
  tipOuts: TipOutAmount[];
  tipOutTotal: number;
  declareAmount: number;
  cash: number;
  /** cash + tipOutTotal; ≥ 0 → the server owes the house. */
  tally: number;
  owesHouse: boolean;
  party: PartyResult | null;
}

export function calculateSolo(inputs: SoloInputs): SoloResult {
  const sales = inputs.sales || 0;
  const cash = inputs.cash || 0;

  const tipOuts: TipOutAmount[] = inputs.tipOuts.map((line) => ({
    ...line,
    amount: sales * line.pct,
  }));
  const tipOutTotal = tipOuts.reduce((sum, line) => sum + line.amount, 0);

  let party: PartyResult | null = null;
  let adjustedSales = sales;
  if (inputs.party) {
    const { subtotal, gratuity, checkUnderMyName } = inputs.party;
    const halfParty = (subtotal || 0) / 2;
    adjustedSales = checkUnderMyName ? sales - halfParty : sales + halfParty;
    const totalPct = inputs.tipOuts.reduce((sum, line) => sum + line.pct, 0);
    const partyTipOuts = (subtotal || 0) * totalPct;
    const gratuityAfterTipOuts = (gratuity || 0) - partyTipOuts;
    party = {
      adjustedSales,
      partyTipOuts,
      gratuityAfterTipOuts,
      splitAmount: gratuityAfterTipOuts / 2,
      youOweTeammate: checkUnderMyName,
    };
  }

  const declareAmount = adjustedSales * inputs.declarePct;
  const tally = cash + tipOutTotal;

  return {
    tipOuts,
    tipOutTotal,
    declareAmount,
    cash,
    tally,
    owesHouse: tally >= 0,
    party,
  };
}

export interface PooledServerInput {
  /** Display label only ("You", "Alex M."); never persisted server-side. */
  label: string;
  sales: number;
  /** Signed, same convention as solo. */
  cash: number;
}

export interface PooledInputs {
  servers: PooledServerInput[];
  declarePct: number;
  tipOuts: TipOutLine[];
}

export interface PooledResult {
  serverCount: number;
  poolSales: number;
  poolCash: number;
  tipOuts: TipOutAmount[];
  tipOutTotal: number;
  declareAmount: number;
  declarePerServer: number;
  /** poolCash + tipOutTotal; ≥ 0 → the pool owes the house. */
  tally: number;
  tallyPerServer: number;
  owesHouse: boolean;
}

export function calculatePooled(inputs: PooledInputs): PooledResult {
  const servers = inputs.servers;
  const serverCount = Math.max(servers.length, 1);
  const poolSales = servers.reduce((sum, s) => sum + (s.sales || 0), 0);
  const poolCash = servers.reduce((sum, s) => sum + (s.cash || 0), 0);

  const tipOuts: TipOutAmount[] = inputs.tipOuts.map((line) => ({
    ...line,
    amount: poolSales * line.pct,
  }));
  const tipOutTotal = tipOuts.reduce((sum, line) => sum + line.amount, 0);
  const declareAmount = poolSales * inputs.declarePct;
  const tally = poolCash + tipOutTotal;

  return {
    serverCount,
    poolSales,
    poolCash,
    tipOuts,
    tipOutTotal,
    declareAmount,
    declarePerServer: declareAmount / serverCount,
    tally,
    tallyPerServer: tally / serverCount,
    owesHouse: tally >= 0,
  };
}

/** Wheel options for tip-out percentages: 0–10% in 0.25 steps (as fractions).
 * Finer than the s78 0.5 wheel by Steve's presets-round call — Boathouse
 * servers tip Busser + Runner at 1.75% each, and a selectable 1.75 beat a
 * combined-category data model. */
export const TIP_OUT_WHEEL_STEPS: readonly number[] = Object.freeze(
  Array.from({ length: 41 }, (_, i) => i * 0.0025),
);

export function formatPct(pct: number): string {
  // Two decimals, trailing zeros trimmed: 2 → "2%", 1.5 → "1.5%", 1.75 → "1.75%"
  // (a one-decimal round would lie about the quarter steps).
  const asPercent = Math.round(pct * 10000) / 100;
  return `${asPercent}%`;
}
