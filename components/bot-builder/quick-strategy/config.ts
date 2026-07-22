import type { TStrategies, TConfigItem, TValidationItem } from './types';

const NUMBER_DEFAULT: TValidationItem = { type: 'min', value: 1, message: 'Must be a number higher than 0' };

const LABEL_SYMBOL = (): TConfigItem => ({ type: 'label', label: 'Asset', description: 'The underlying market your bot will trade.' });
const SYMBOL = (): TConfigItem => ({ type: 'symbol', name: 'symbol' });

const LABEL_CONTRACT = (): TConfigItem => ({ type: 'label', label: 'Contract type', description: 'Your bot will use this contract type for every run.' });
const CONTRACT_TYPE = (): TConfigItem => ({ type: 'contract_type', name: 'contract_type', dependencies: ['symbol'] });

const LABEL_TRADETYPE = (): TConfigItem => ({ type: 'label', label: 'Purchase condition', description: 'Your bot uses a single trade type for each run.' });
const TRADETYPE = (): TConfigItem => ({ type: 'tradetype', name: 'tradetype', dependencies: ['symbol', 'contract_type'] });

const LABEL_STAKE = (): TConfigItem => ({ type: 'label', label: 'Initial stake', description: 'The amount you stake for the first trade.' });
const STAKE = (): TConfigItem => ({ type: 'number', name: 'stake', validation: ['number', 'required', 'ceil', { type: 'min', value: 0.35, message: 'Minimum stake is 0.35' }], has_currency_unit: true });

const LABEL_DURATION = (): TConfigItem => ({ type: 'label', label: 'Duration', description: 'How long each trade takes to expire.' });
const DURATION_TYPE = (): TConfigItem => ({ type: 'durationtype', name: 'durationtype', dependencies: ['symbol', 'tradetype'], attached: true });
const DURATION = (): TConfigItem => ({ type: 'number', name: 'duration', attached: true, validation: ['number', 'required', 'min', 'max', 'integer'] });

const LABEL_PROFIT = (): TConfigItem => ({ type: 'label', label: 'Profit threshold', description: 'Bot stops if total profit exceeds this.' });
const PROFIT = (): TConfigItem => ({ type: 'number', name: 'profit', validation: ['number', 'required', 'ceil', NUMBER_DEFAULT], has_currency_unit: true });

const LABEL_LOSS = (): TConfigItem => ({ type: 'label', label: 'Loss threshold', description: 'Bot stops if total loss exceeds this.' });
const LOSS = (): TConfigItem => ({ type: 'number', name: 'loss', validation: ['number', 'required', 'ceil', NUMBER_DEFAULT], has_currency_unit: true });

const LABEL_SIZE = (): TConfigItem => ({ type: 'label', label: 'Size', description: 'Multiplier after a losing trade.' });
const SIZE = (): TConfigItem => ({ type: 'number', name: 'size', validation: ['number', 'required', 'floor', { type: 'min', value: 2, message: 'Size must be 2 or greater' }] });

const LABEL_UNIT = (): TConfigItem => ({ type: 'label', label: 'Unit', description: 'Units added after a losing trade.' });
const UNIT = (): TConfigItem => ({ type: 'number', name: 'unit', validation: ['number', 'required', 'ceil', NUMBER_DEFAULT] });

const CHECKBOX_MAX_STAKE = (): TConfigItem => ({ type: 'checkbox', name: 'boolean_max_stake', label: 'Max stake', description: 'Reset to initial stake if exceeded.', attached: true });
const MAX_STAKE = (): TConfigItem => ({ type: 'number', name: 'max_stake', validation: ['number', 'required', 'ceil', 'min'], should_have: [{ key: 'boolean_max_stake', value: true }], hide_without_should_have: true, attached: true, has_currency_unit: true });

const GROWTH_RATE = (): TConfigItem => ({ type: 'label', label: 'Growth rate', description: 'Stake grows at this rate per tick.' });
const GROWTH_RATE_VALUE = (): TConfigItem => ({ type: 'growth_rate', name: 'growth_rate', attached: true, validation: ['number', 'required', 'ceil'] });

const SELL_CONDITIONS_LABEL = (): TConfigItem => ({ type: 'label', label: 'Sell conditions', description: 'Choose take profit or tick count.' });
const SELL_CONDITIONS = (): TConfigItem => ({ type: 'sell_conditions', name: 'sell_conditions' });

const TAKE_PROFIT = (): TConfigItem => ({ type: 'number', name: 'take_profit', should_have: [{ key: 'boolean_tick_count', value: false }], hide_without_should_have: true, attached: true, has_currency_unit: true, validation: ['number', 'required', 'ceil', { type: 'min', value: 0.35, message: 'Minimum take profit is 0.35' }] });

const TICK_COUNT = (): TConfigItem => ({ type: 'number', name: 'tick_count', should_have: [{ key: 'boolean_tick_count', value: true }], hide_without_should_have: true, attached: true, validation: ['number', 'required', 'ceil', { type: 'min', value: 1, message: 'Minimum tick count is 1' }] });

const LABEL_ACC_SIZE = (): TConfigItem => ({ type: 'label', label: 'Size', description: 'Multiplier after a losing trade.' });
const LABEL_ACC_UNIT = (): TConfigItem => ({ type: 'label', label: 'Unit', description: 'Units added after a losing trade.' });

const REVERSE_SIZE_LABEL = (): TConfigItem => ({ type: 'label', label: 'Size', description: 'Multiplier after a winning trade.' });

export const STRATEGIES = (): TStrategies => ({
  MARTINGALE: {
    name: 'martingale', label: 'Martingale', category: 'options',
    description: 'Double your stake after each loss, reset after a win.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_CONTRACT(), CONTRACT_TYPE(), LABEL_TRADETYPE(), TRADETYPE(), LABEL_STAKE(), STAKE(), LABEL_DURATION(), DURATION_TYPE(), DURATION()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_SIZE(), SIZE(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  D_ALEMBERT: {
    name: 'dalembert', label: 'D\'Alembert', category: 'options',
    description: 'Increase stake by 1 unit after loss, decrease by 1 after win.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_CONTRACT(), CONTRACT_TYPE(), LABEL_TRADETYPE(), TRADETYPE(), LABEL_STAKE(), STAKE(), LABEL_DURATION(), DURATION_TYPE(), DURATION()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_UNIT(), UNIT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  OSCARS_GRIND: {
    name: 'oscars_grind', label: 'Oscar\'s Grind', category: 'options',
    description: 'Increase stake by 1 unit after a win, keep same after loss.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_CONTRACT(), CONTRACT_TYPE(), LABEL_TRADETYPE(), TRADETYPE(), LABEL_STAKE(), STAKE(), LABEL_DURATION(), DURATION_TYPE(), DURATION()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  REVERSE_MARTINGALE: {
    name: 'reverse_martingale', label: 'Reverse Martingale', category: 'options',
    description: 'Double stake after each win, reset after loss.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_CONTRACT(), CONTRACT_TYPE(), LABEL_TRADETYPE(), TRADETYPE(), LABEL_STAKE(), STAKE(), LABEL_DURATION(), DURATION_TYPE(), DURATION()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), REVERSE_SIZE_LABEL(), SIZE(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  REVERSE_D_ALEMBERT: {
    name: 'reverse_dalembert', label: 'Reverse D\'Alembert', category: 'options',
    description: 'Increase stake by 1 unit after win, decrease after loss.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_CONTRACT(), CONTRACT_TYPE(), LABEL_TRADETYPE(), TRADETYPE(), LABEL_STAKE(), STAKE(), LABEL_DURATION(), DURATION_TYPE(), DURATION()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_UNIT(), UNIT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  STRATEGY_1_3_2_6: {
    name: '1_3_2_6', label: '1-3-2-6', category: 'options',
    description: 'Bet 1, 3, 2, 6 units in sequence after wins, reset on loss.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_CONTRACT(), CONTRACT_TYPE(), LABEL_TRADETYPE(), TRADETYPE(), LABEL_STAKE(), STAKE(), LABEL_DURATION(), DURATION_TYPE(), DURATION()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS()],
    ],
  },
  ACCUMULATORS_MARTINGALE: {
    name: 'accumulators_martingale', label: 'Martingale', category: 'accumulators',
    description: 'Martingale for accumulator contracts.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_SIZE(), SIZE(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  ACCUMULATORS_DALEMBERT: {
    name: 'accumulators_dalembert', label: 'D\'Alembert', category: 'accumulators',
    description: 'D\'Alembert for accumulator contracts.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_UNIT(), UNIT(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  ACCUMULATORS_MARTINGALE_ON_STAT_RESET: {
    name: 'accumulators_martingale_on_stat_reset', label: 'Martingale on Stat Reset', category: 'accumulators',
    description: 'Martingale resetting on stat change for accumulators.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_SIZE(), SIZE(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  ACCUMULATORS_DALEMBERT_ON_STAT_RESET: {
    name: 'accumulators_dalembert_on_stat_reset', label: 'D\'Alembert on Stat Reset', category: 'accumulators',
    description: 'D\'Alembert resetting on stat change for accumulators.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_UNIT(), UNIT(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  ACCUMULATORS_REVERSE_MARTINGALE: {
    name: 'accumulators_reverse_martingale', label: 'Reverse Martingale', category: 'accumulators',
    description: 'Reverse Martingale for accumulator contracts.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_SIZE(), SIZE(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  ACCUMULATORS_REVERSE_MARTINGALE_ON_STAT_RESET: {
    name: 'accumulators_reverse_martingale_on_stat_reset', label: 'Reverse Martingale on Stat Reset', category: 'accumulators',
    description: 'Reverse Martingale on stat reset for accumulators.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_SIZE(), SIZE(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  ACCUMULATORS_REVERSE_DALEMBERT: {
    name: 'accumulators_reverse_dalembert', label: 'Reverse D\'Alembert', category: 'accumulators',
    description: 'Reverse D\'Alembert for accumulator contracts.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_UNIT(), UNIT(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
  ACCUMULATORS_REVERSE_DALEMBERT_ON_STAT_RESET: {
    name: 'accumulators_reverse_dalembert_on_stat_reset', label: 'Reverse D\'Alembert on Stat Reset', category: 'accumulators',
    description: 'Reverse D\'Alembert on stat reset for accumulators.',
    fields: [
      [LABEL_SYMBOL(), SYMBOL(), LABEL_STAKE(), STAKE(), GROWTH_RATE(), GROWTH_RATE_VALUE()],
      [LABEL_PROFIT(), PROFIT(), LABEL_LOSS(), LOSS(), LABEL_ACC_UNIT(), UNIT(), SELL_CONDITIONS_LABEL(), SELL_CONDITIONS(), TAKE_PROFIT(), TICK_COUNT(), CHECKBOX_MAX_STAKE(), MAX_STAKE()],
    ],
  },
});
