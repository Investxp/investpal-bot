import * as Blockly from 'blockly';

const TRADING = '#FF8C00';
const EVENTS = '#5b80a5';
const INDICATOR = '#5b80a5';
const ACCOUNT = '#a55ba5';
const UTILITY = '#5ba58c';
const RISK = '#ef4444';
const ANALYSIS = '#5b80a5';
const MISC = '#5ba58c';
const MATH_C = '#5ba55b';
const LOOPS_C = '#5ba55b';

export function registerDerivBlocks() {
  // ════════════════════════════════════════════════════════════
  // TRADE PARAMETERS
  // ════════════════════════════════════════════════════════════

  Blockly.Blocks['trade_definition'] = {
    init() {
      this.appendDummyInput('HEADER')
        .appendField('1. Trade Parameters');
      this.appendValueInput('MARKET')
        .setCheck('String')
        .appendField('market');
      this.appendValueInput('CONTRACT')
        .setCheck('String')
        .appendField('contract type');
      this.appendValueInput('TRADE_OPTIONS')
        .setCheck('Object')
        .appendField('options');
      this.appendStatementInput('INIT')
        .setCheck(null)
        .appendField('run once');
      this.setNextStatement(true, null);
      this.setColour(TRADING);
      this.setDeletable(false);
      this.setTooltip('Define your trading parameters');
    },
  };

  Blockly.Blocks['trade_definition_market'] = {
    init() {
      this.appendDummyInput()
        .appendField('market')
        .appendField(
          new Blockly.FieldDropdown([
            ['Volatility Indices', 'volatility'],
            ['Boom & Crash', 'boom_crash'],
            ['Forex', 'forex'],
            ['Stock Indices', 'stock_indices'],
            ['Commodities', 'commodities'],
          ]),
          'MARKET',
        );
      this.appendDummyInput()
        .appendField('symbol')
        .appendField(
          new Blockly.FieldDropdown([
            ['Volatility 10', 'R_10'],
            ['Volatility 25', 'R_25'],
            ['Volatility 50', 'R_50'],
            ['Volatility 75', 'R_75'],
            ['Volatility 100', 'R_100'],
            ['Volatility 10 (1s)', '1HZ10V'],
            ['Volatility 25 (1s)', '1HZ25V'],
            ['Volatility 50 (1s)', '1HZ50V'],
            ['Volatility 100 (1s)', '1HZ100V'],
          ]),
          'SYMBOL',
        );
      this.setOutput(true, 'String');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['trade_definition_tradetype'] = {
    init() {
      this.appendDummyInput()
        .appendField('contract')
        .appendField(
          new Blockly.FieldDropdown([
            ['Rise / Fall', 'RISE_FALL'],
            ['Rise', 'RISE'],
            ['Fall', 'FALL'],
            ['Accumulators', 'ACCU'],
            ['Multipliers', 'MULTIPLIER'],
            ['Digit Matches', 'DIGITMATCH'],
            ['Digit Differs', 'DIFF'],
            ['Touch / No Touch', 'TOUCH'],
            ['Even / Odd', 'EVENODD'],
            ['Over / Under', 'OVERUNDER'],
            ['Match/Diff', 'MATCHDIFF'],
          ]),
          'CONTRACT_TYPE',
        );
      this.setOutput(true, 'String');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['trade_definition_tradeoptions'] = {
    init() {
      this.appendDummyInput()
        .appendField('prediction')
        .appendField(
          new Blockly.FieldDropdown([
            ['Rise', 'RISE'],
            ['Fall', 'FALL'],
          ]),
          'PREDICTION',
        );
      this.appendValueInput('STAKE_AMOUNT')
        .setCheck('Number')
        .appendField('stake');
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['USD', 'USD'],
            ['EUR', 'EUR'],
            ['GBP', 'GBP'],
            ['AUD', 'AUD'],
          ]),
          'CURRENCY',
        );
      this.appendValueInput('DURATION_AMOUNT')
        .setCheck('Number')
        .appendField('duration');
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['ticks', 't'],
            ['seconds', 's'],
            ['minutes', 'm'],
            ['hours', 'h'],
            ['days', 'd'],
          ]),
          'DURATION_UNIT',
        );
      this.setOutput(true, 'Object');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['trade_definition_multiplier'] = {
    init() {
      this.appendDummyInput()
        .appendField('multiplier')
        .appendField(
          new Blockly.FieldDropdown([
            ['x1', '1'],
            ['x2', '2'],
            ['x3', '3'],
            ['x5', '5'],
            ['x10', '10'],
            ['x20', '20'],
            ['x50', '50'],
            ['x100', '100'],
          ]),
          'MULTIPLIER',
        );
      this.appendValueInput('STAKE')
        .setCheck('Number')
        .appendField('stake');
      this.setOutput(true, 'Object');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['trade_definition_accumulator'] = {
    init() {
      this.appendValueInput('GROWTH')
        .setCheck('Number')
        .appendField('accumulator growth');
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([['%', '%']]),
          'GROWTH_UNIT',
        );
      this.appendValueInput('STAKE')
        .setCheck('Number')
        .appendField('stake');
      this.setOutput(true, 'Object');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['accumulator_take_profit'] = {
    init() {
      this.appendValueInput('AMOUNT')
        .setCheck('Number')
        .appendField('accumulator take profit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(RISK);
    },
  };

  Blockly.Blocks['trade_definition_candleinterval'] = {
    init() {
      this.appendDummyInput()
        .appendField('candle interval')
        .appendField(
          new Blockly.FieldDropdown([
            ['1 tick', '1t'],
            ['1 minute', '1m'],
            ['2 minutes', '2m'],
            ['5 minutes', '5m'],
            ['15 minutes', '15m'],
            ['30 minutes', '30m'],
            ['1 hour', '1h'],
            ['4 hours', '4h'],
            ['1 day', '1d'],
          ]),
          'INTERVAL',
        );
      this.setOutput(true, 'String');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['trade_definition_restartonerror'] = {
    init() {
      this.appendDummyInput()
        .appendField('restart on error')
        .appendField(
          new Blockly.FieldCheckbox('TRUE'),
          'ENABLED',
        );
      this.setOutput(true, 'Boolean');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['trade_definition_restartbuysell'] = {
    init() {
      this.appendDummyInput()
        .appendField('retry buy/sell on error')
        .appendField(
          new Blockly.FieldCheckbox('TRUE'),
          'ENABLED',
        );
      this.setOutput(true, 'Boolean');
      this.setColour(TRADING);
    },
  };

  // ════════════════════════════════════════════════════════════
  // PIPELINE BLOCKS
  // ════════════════════════════════════════════════════════════

  Blockly.Blocks['before_purchase'] = {
    init() {
      this.appendDummyInput()
        .appendField('2. Purchase Conditions');
      this.appendStatementInput('PURCHASE')
        .setCheck(null)
        .appendField('buy when');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(TRADING);
      this.setDeletable(false);
      this.setTooltip('Set conditions for buying contracts');
    },
  };

  Blockly.Blocks['during_purchase'] = {
    init() {
      this.appendDummyInput()
        .appendField('3. Sell Conditions');
      this.appendStatementInput('SELL')
        .setCheck(null)
        .appendField('sell when');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(TRADING);
      this.setDeletable(false);
      this.setTooltip('Set conditions for selling contracts');
    },
  };

  Blockly.Blocks['after_purchase'] = {
    init() {
      this.appendDummyInput()
        .appendField('4. Restart Trading');
      this.appendStatementInput('RESTART')
        .setCheck(null)
        .appendField('after trade');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(TRADING);
      this.setDeletable(false);
      this.setTooltip('Set restart conditions after a trade completes');
    },
  };

  Blockly.Blocks['purchase'] = {
    init() {
      this.appendDummyInput()
        .appendField('purchase');
      this.appendValueInput('CONTRACT')
        .setCheck('String')
        .appendField('contract type');
      this.appendValueInput('SYMBOL')
        .setCheck('String')
        .appendField('on');
      this.appendValueInput('OPTIONS')
        .setCheck('Object')
        .appendField('with');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(TRADING);
      this.setTooltip('Buy a contract');
    },
  };

  Blockly.Blocks['sell_at_market'] = {
    init() {
      this.appendDummyInput()
        .appendField('sell at market');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(RISK);
    },
  };

  Blockly.Blocks['check_sell'] = {
    init() {
      this.appendDummyInput()
        .appendField('can sell');
      this.setOutput(true, 'Boolean');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['sell_price'] = {
    init() {
      this.appendDummyInput()
        .appendField('sell price');
      this.setOutput(true, 'Number');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['contract_check_result'] = {
    init() {
      this.appendDummyInput()
        .appendField('trade result')
        .appendField(
          new Blockly.FieldDropdown([
            ['won', 'won'],
            ['lost', 'lost'],
          ]),
          'RESULT',
        );
      this.setOutput(true, 'Boolean');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['read_details'] = {
    init() {
      this.appendDummyInput()
        .appendField('contract details');
      this.setOutput(true, 'Object');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['trade_again'] = {
    init() {
      this.appendValueInput('TIMES')
        .setCheck('Number')
        .appendField('trade again');
      this.appendDummyInput()
        .appendField('times');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['ask_price'] = {
    init() {
      this.appendDummyInput()
        .appendField('ask price');
      this.setOutput(true, 'Number');
      this.setColour(TRADING);
    },
  };

  Blockly.Blocks['payout'] = {
    init() {
      this.appendDummyInput()
        .appendField('payout');
      this.setOutput(true, 'Number');
      this.setColour(TRADING);
    },
  };

  // ════════════════════════════════════════════════════════════
  // TICK / CANDLE ANALYSIS
  // ════════════════════════════════════════════════════════════

  Blockly.Blocks['tick_value'] = {
    init() {
      this.appendDummyInput().appendField('tick');
      this.setOutput(true, 'Number');
      this.setColour(EVENTS);
    },
  };

  Blockly.Blocks['tick_history'] = {
    init() {
      this.appendValueInput('COUNT')
        .setCheck('Number')
        .appendField('last');
      this.appendDummyInput()
        .appendField('ticks');
      this.setOutput(true, 'Array');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['last_digit'] = {
    init() {
      this.appendDummyInput()
        .appendField('last digit');
      this.setOutput(true, 'Number');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['last_digit_list'] = {
    init() {
      this.appendValueInput('COUNT')
        .setCheck('Number')
        .appendField('last');
      this.appendDummyInput()
        .appendField('digits');
      this.setOutput(true, 'Array');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['check_direction'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('candle direction');
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['rising', 'rising'],
            ['falling', 'falling'],
          ]),
          'DIRECTION',
        );
      this.setOutput(true, 'Boolean');
      this.setColour(ANALYSIS);
    },
  };

  Blockly.Blocks['ohlc'] = {
    init() {
      this.appendDummyInput()
        .appendField('candles');
      this.appendValueInput('COUNT')
        .setCheck('Number')
        .appendField('last');
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['1m', '1m'],
            ['5m', '5m'],
            ['15m', '15m'],
            ['1h', '1h'],
          ]),
          'GRANULARITY',
        );
      this.setOutput(true, 'Array');
      this.setColour(ANALYSIS);
    },
  };

  Blockly.Blocks['ohlc_values'] = {
    init() {
      this.appendValueInput('CANDLES')
        .setCheck('Array')
        .appendField('OHLC values');
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['open', 'open'],
            ['high', 'high'],
            ['low', 'low'],
            ['close', 'close'],
          ]),
          'FIELD',
        );
      this.setOutput(true, 'Array');
      this.setColour(ANALYSIS);
    },
  };

  Blockly.Blocks['read_ohlc'] = {
    init() {
      this.appendValueInput('CANDLE')
        .appendField('read candle')
        .appendField(
          new Blockly.FieldDropdown([
            ['open', 'open'],
            ['high', 'high'],
            ['low', 'low'],
            ['close', 'close'],
          ]),
          'FIELD',
        );
      this.setOutput(true, 'Number');
      this.setColour(ANALYSIS);
    },
  };

  Blockly.Blocks['stat'] = {
    init() {
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('statistic');
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown([
            ['min', 'min'],
            ['max', 'max'],
            ['mean', 'mean'],
            ['median', 'median'],
            ['mode', 'mode'],
            ['standard deviation', 'stddev'],
            ['sum', 'sum'],
          ]),
          'FUNC',
        );
      this.setOutput(true, 'Number');
      this.setColour(ANALYSIS);
    },
  };

  // ════════════════════════════════════════════════════════════
  // INDICATORS (single-value + array variants)
  // ════════════════════════════════════════════════════════════

  Blockly.Blocks['sma'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('SMA');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Number');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['smaa'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('SMA array');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Array');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['ema'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('EMA');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Number');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['emaa'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('EMA array');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Array');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['rsi'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('RSI');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Number');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['rsia'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('RSI array');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Array');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['bbands'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('BB');
      this.appendValueInput('STDDEV')
        .setCheck('Number')
        .appendField('stdev');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Object');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['bba'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('BB array');
      this.appendValueInput('STDDEV')
        .setCheck('Number')
        .appendField('stdev');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Object');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['macd'] = {
    init() {
      this.appendValueInput('FAST')
        .setCheck('Number')
        .appendField('MACD fast');
      this.appendValueInput('SLOW')
        .setCheck('Number')
        .appendField('slow');
      this.appendValueInput('SIGNAL')
        .setCheck('Number')
        .appendField('signal');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Object');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['macda'] = {
    init() {
      this.appendValueInput('FAST')
        .setCheck('Number')
        .appendField('MACD array fast');
      this.appendValueInput('SLOW')
        .setCheck('Number')
        .appendField('slow');
      this.appendValueInput('SIGNAL')
        .setCheck('Number')
        .appendField('signal');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Object');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['highest'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('highest');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Number');
      this.setColour(INDICATOR);
    },
  };

  Blockly.Blocks['lowest'] = {
    init() {
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('lowest');
      this.appendValueInput('SOURCE')
        .setCheck('Array')
        .appendField('of');
      this.setOutput(true, 'Number');
      this.setColour(INDICATOR);
    },
  };

  // ════════════════════════════════════════════════════════════
  // ACCOUNT
  // ════════════════════════════════════════════════════════════

  Blockly.Blocks['account_balance'] = {
    init() {
      this.appendDummyInput().appendField('balance');
      this.setOutput(true, 'Number');
      this.setColour(ACCOUNT);
    },
  };

  Blockly.Blocks['account_loginid'] = {
    init() {
      this.appendDummyInput().appendField('login id');
      this.setOutput(true, 'String');
      this.setColour(ACCOUNT);
    },
  };

  Blockly.Blocks['is_virtual'] = {
    init() {
      this.appendDummyInput().appendField('is demo');
      this.setOutput(true, 'Boolean');
      this.setColour(ACCOUNT);
    },
  };

  Blockly.Blocks['total_profit'] = {
    init() {
      this.appendDummyInput().appendField('total profit');
      this.setOutput(true, 'Number');
      this.setColour(ACCOUNT);
    },
  };

  Blockly.Blocks['total_runs'] = {
    init() {
      this.appendDummyInput().appendField('total trades');
      this.setOutput(true, 'Number');
      this.setColour(ACCOUNT);
    },
  };

  // ════════════════════════════════════════════════════════════
  // RISK MANAGEMENT
  // ════════════════════════════════════════════════════════════

  Blockly.Blocks['multiplier_stop_loss'] = {
    init() {
      this.appendValueInput('AMOUNT')
        .setCheck('Number')
        .appendField('stop loss');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(RISK);
    },
  };

  Blockly.Blocks['multiplier_take_profit'] = {
    init() {
      this.appendValueInput('AMOUNT')
        .setCheck('Number')
        .appendField('take profit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(RISK);
    },
  };

  // ════════════════════════════════════════════════════════════
  // UTILITY
  // ════════════════════════════════════════════════════════════

  Blockly.Blocks['notify'] = {
    init() {
      this.appendValueInput('MESSAGE')
        .setCheck('String')
        .appendField('notify');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['notify_telegram'] = {
    init() {
      this.appendValueInput('TOKEN')
        .setCheck('String')
        .appendField('telegram bot token');
      this.appendValueInput('CHAT_ID')
        .setCheck('String')
        .appendField('chat id');
      this.appendValueInput('MESSAGE')
        .setCheck('String')
        .appendField('message');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['log_message'] = {
    init() {
      this.appendValueInput('TEXT')
        .setCheck('String')
        .appendField('log');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['console'] = {
    init() {
      this.appendValueInput('TEXT')
        .appendField('console');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['loader'] = {
    init() {
      this.appendDummyInput()
        .appendField('loading')
        .appendField(
          new Blockly.FieldDropdown([
            ['show', 'show'],
            ['hide', 'hide'],
          ]),
          'ACTION',
        );
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['wait_ticks'] = {
    init() {
      this.appendValueInput('COUNT')
        .setCheck('Number')
        .appendField('wait');
      this.appendDummyInput()
        .appendField('ticks');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['timeout'] = {
    init() {
      this.appendValueInput('MS')
        .setCheck('Number')
        .appendField('timeout (ms)');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['epoch'] = {
    init() {
      this.appendDummyInput().appendField('current time');
      this.setOutput(true, 'Number');
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['totimestamp'] = {
    init() {
      this.appendValueInput('DATETIME')
        .setCheck('String')
        .appendField('to timestamp');
      this.setOutput(true, 'Number');
      this.setColour(UTILITY);
    },
  };

  Blockly.Blocks['todatetime'] = {
    init() {
      this.appendValueInput('TIMESTAMP')
        .setCheck('Number')
        .appendField('to datetime');
      this.setOutput(true, 'String');
      this.setColour(UTILITY);
    },
  };
}
