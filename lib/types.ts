export type {
  ActiveSymbol,
  Tick,
  TicksHistoryResponse,
  ContractsForResponse,
  ContractInfo,
  DurationLimits,
  ProposalResponse,
  ProposalInfo,
  BuyResponse,
  BuyResult,
} from '@deriv/core';

export type { OpenPosition } from '@/hooks/use-open-positions';
export type { ClosedPosition } from '@/hooks/use-closed-positions';

/**
 * Extended contract info for accumulators — the base `ContractInfo` from
 * `@deriv/core` does not include accumulator-specific fields.
 */
export interface AccumulatorContractInfo {
  barriers: number;
  contract_category: string;
  contract_type: string;
  default_stake: number;
  expiry_type: string;
  growth_rate_range: number[];
  high_barrier: string;
  low_barrier: string;
  market: string;
  max_contract_duration: string;
  min_contract_duration: string;
  sentiment: string;
  submarket: string;
  underlying_symbol: string;
}

export type GrowthRate = number;

export type PositionFilter = 'open' | 'closed' | 'all';

// Digits-specific types
export type ContractMode =
  | 'DIGITMATCH'
  | 'DIGITDIFF'
  | 'DIGITOVER'
  | 'DIGITUNDER'
  | 'DIGITEVEN'
  | 'DIGITODD';

export type TradeType = 'matches-differs' | 'over-under' | 'even-odd';

export interface DigitStats {
  /** Count of each digit 0-9 from tick history */
  counts: number[];
  /** Percentage of each digit 0-9 */
  percentages: number[];
  /** Total number of ticks analyzed */
  totalTicks: number;
  /** Bitmap: for each digit 0-9, array of 1/0 for last 20 ticks (most recent last) */
  bitmap: number[][];
}

// Rise/Fall-specific types
export type Direction = 'CALL' | 'PUT';

export type { DurationSelectUnit, DurationOption } from '@/lib/duration-utils';

