import { javascriptGenerator, Order } from 'blockly/javascript';

export function registerDerivGenerators() {
  const { forBlock } = javascriptGenerator;

  // ════════════════════════════════════════════════════════════
  // TRADE PARAMETERS
  // ════════════════════════════════════════════════════════════

  forBlock['trade_definition'] = (block: any) => {
    const market = javascriptGenerator.valueToCode(block, 'MARKET', Order.ATOMIC) || "'R_100'";
    const contract = javascriptGenerator.valueToCode(block, 'CONTRACT', Order.ATOMIC) || "'RISE_FALL'";
    const options = javascriptGenerator.valueToCode(block, 'TRADE_OPTIONS', Order.ATOMIC) || '{}';
    const init = javascriptGenerator.statementToCode(block, 'INIT');
    let pipeline = '';
    let current = block.nextConnection?.targetBlock();
    while (current) {
      const code = javascriptGenerator.blockToCode(current);
      if (typeof code === 'string') pipeline += code;
      current = current.nextConnection?.targetBlock();
    }
    return `const _market = ${market};\nconst _contract = ${contract};\nconst _options = ${options};\n${init}\nDeriv.onTick(async () => {\n${pipeline}});\n`;
  };

  forBlock['trade_definition_market'] = (block: any) => {
    return [`'${block.getFieldValue('SYMBOL')}'`, Order.ATOMIC];
  };

  forBlock['trade_definition_tradetype'] = (block: any) => {
    return [`'${block.getFieldValue('CONTRACT_TYPE')}'`, Order.ATOMIC];
  };

  forBlock['trade_definition_tradeoptions'] = (block: any) => {
    const prediction = block.getFieldValue('PREDICTION');
    const stake = javascriptGenerator.valueToCode(block, 'STAKE_AMOUNT', Order.ATOMIC) || '1';
    const currency = block.getFieldValue('CURRENCY');
    const duration = javascriptGenerator.valueToCode(block, 'DURATION_AMOUNT', Order.ATOMIC) || '1';
    const unit = block.getFieldValue('DURATION_UNIT');
    return [
      `{prediction:'${prediction}',stake:{amount:${stake},currency:'${currency}'},duration:{amount:${duration},unit:'${unit}'}}`,
      Order.ATOMIC,
    ];
  };

  forBlock['trade_definition_multiplier'] = (block: any) => {
    const mult = block.getFieldValue('MULTIPLIER');
    const stake = javascriptGenerator.valueToCode(block, 'STAKE', Order.ATOMIC) || '1';
    return [`{multiplier:${mult},stake:{amount:${stake}}}`, Order.ATOMIC];
  };

  forBlock['trade_definition_accumulator'] = (block: any) => {
    const growth = javascriptGenerator.valueToCode(block, 'GROWTH', Order.ATOMIC) || '1';
    const stake = javascriptGenerator.valueToCode(block, 'STAKE', Order.ATOMIC) || '1';
    return [`{growth_rate:${growth},stake:{amount:${stake}}}`, Order.ATOMIC];
  };

  forBlock['accumulator_take_profit'] = (block: any) => {
    const amount = javascriptGenerator.valueToCode(block, 'AMOUNT', Order.ATOMIC) || '0';
    return `Deriv.setAccumulatorTakeProfit(${amount});\n`;
  };

  forBlock['trade_definition_candleinterval'] = (block: any) => {
    return [`'${block.getFieldValue('INTERVAL')}'`, Order.ATOMIC];
  };

  forBlock['trade_definition_restartonerror'] = (block: any) => {
    return [block.getFieldValue('ENABLED') === 'TRUE' ? 'true' : 'false', Order.ATOMIC];
  };

  forBlock['trade_definition_restartbuysell'] = (block: any) => {
    return [block.getFieldValue('ENABLED') === 'TRUE' ? 'true' : 'false', Order.ATOMIC];
  };

  // ════════════════════════════════════════════════════════════
  // PIPELINE
  // ════════════════════════════════════════════════════════════

  forBlock['before_purchase'] = (block: any) => {
    const purchase = javascriptGenerator.statementToCode(block, 'PURCHASE');
    return `if (!Deriv.currentContract()) {\n${purchase}};\n`;
  };

  forBlock['during_purchase'] = (block: any) => {
    const sell = javascriptGenerator.statementToCode(block, 'SELL');
    return `${sell}`;
  };

  forBlock['after_purchase'] = (block: any) => {
    const restart = javascriptGenerator.statementToCode(block, 'RESTART');
    return `${restart}`;
  };

  forBlock['purchase'] = (block: any) => {
    const contract = javascriptGenerator.valueToCode(block, 'CONTRACT', Order.ATOMIC) || "'RISE_FALL'";
    const symbol = javascriptGenerator.valueToCode(block, 'SYMBOL', Order.ATOMIC) || "'R_100'";
    const opts = javascriptGenerator.valueToCode(block, 'OPTIONS', Order.ATOMIC) || '{}';
    return `await Deriv.buyContract({contract_type:${contract},symbol:${symbol},options:${opts}});\n`;
  };

  forBlock['sell_at_market'] = () => {
    return `await Deriv.sellContract();\n`;
  };

  forBlock['check_sell'] = () => {
    return ['(Deriv.currentContract()?.is_sold === false)', Order.ATOMIC];
  };

  forBlock['sell_price'] = () => {
    return ['(Deriv.currentContract()?.sell_price ?? 0)', Order.ATOMIC];
  };

  forBlock['contract_check_result'] = (block: any) => {
    return [`(Deriv.lastContract?.status === '${block.getFieldValue('RESULT')}')`, Order.ATOMIC];
  };

  forBlock['read_details'] = () => {
    return ['Deriv.lastContract', Order.ATOMIC];
  };

  forBlock['trade_again'] = (block: any) => {
    const times = javascriptGenerator.valueToCode(block, 'TIMES', Order.ATOMIC) || '1';
    return `for(let _i=0;_i<${times};_i++){await Deriv.waitTicks(1);};\n`;
  };

  forBlock['ask_price'] = () => {
    return ['(Deriv.currentContract()?.ask_price ?? 0)', Order.ATOMIC];
  };

  forBlock['payout'] = () => {
    return ['(Deriv.lastContract?.payout ?? 0)', Order.ATOMIC];
  };

  // ════════════════════════════════════════════════════════════
  // TICK / CANDLE ANALYSIS
  // ════════════════════════════════════════════════════════════

  forBlock['tick_value'] = () => {
    return ['Deriv.currentTick()', Order.ATOMIC];
  };

  forBlock['tick_history'] = (block: any) => {
    const count = javascriptGenerator.valueToCode(block, 'COUNT', Order.ATOMIC) || '10';
    return [`Deriv.getTickHistory(${count})`, Order.ATOMIC];
  };

  forBlock['last_digit'] = () => {
    return ['(Deriv.currentTick()%1!==0?Math.floor(Deriv.currentTick()%10):Deriv.currentTick()%10)', Order.ATOMIC];
  };

  forBlock['last_digit_list'] = (block: any) => {
    const count = javascriptGenerator.valueToCode(block, 'COUNT', Order.ATOMIC) || '10';
    return [`Deriv.getTickHistory(${count}).map(t=>Math.floor(t%10))`, Order.ATOMIC];
  };

  forBlock['check_direction'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '5';
    const dir = block.getFieldValue('DIRECTION');
    return [`Deriv.checkDirection(${period},'${dir}')`, Order.ATOMIC];
  };

  forBlock['ohlc'] = (block: any) => {
    const count = javascriptGenerator.valueToCode(block, 'COUNT', Order.ATOMIC) || '10';
    return [`Deriv.getOhlc(${count})`, Order.ATOMIC];
  };

  forBlock['ohlc_values'] = (block: any) => {
    const candles = javascriptGenerator.valueToCode(block, 'CANDLES', Order.ATOMIC) || '[]';
    const field = block.getFieldValue('FIELD');
    return [`(${candles}).map(c=>c.${field})`, Order.ATOMIC];
  };

  forBlock['read_ohlc'] = (block: any) => {
    const candle = javascriptGenerator.valueToCode(block, 'CANDLE', Order.ATOMIC) || '{}';
    const field = block.getFieldValue('FIELD');
    return [`(${candle}).${field}`, Order.ATOMIC];
  };

  forBlock['stat'] = (block: any) => {
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    const func = block.getFieldValue('FUNC');
    return [`Deriv.stat(${source},'${func}')`, Order.ATOMIC];
  };

  // ════════════════════════════════════════════════════════════
  // INDICATORS
  // ════════════════════════════════════════════════════════════

  forBlock['sma'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '10';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.sma(${period},${source})`, Order.ATOMIC];
  };

  forBlock['smaa'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '10';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.smaArray(${period},${source})`, Order.ATOMIC];
  };

  forBlock['ema'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '10';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.ema(${period},${source})`, Order.ATOMIC];
  };

  forBlock['emaa'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '10';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.emaArray(${period},${source})`, Order.ATOMIC];
  };

  forBlock['rsi'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '14';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.rsi(${period},${source})`, Order.ATOMIC];
  };

  forBlock['rsia'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '14';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.rsiArray(${period},${source})`, Order.ATOMIC];
  };

  forBlock['bbands'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '20';
    const stddev = javascriptGenerator.valueToCode(block, 'STDDEV', Order.ATOMIC) || '2';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.bbands(${period},${stddev},${source})`, Order.ATOMIC];
  };

  forBlock['bba'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '20';
    const stddev = javascriptGenerator.valueToCode(block, 'STDDEV', Order.ATOMIC) || '2';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.bbandsArray(${period},${stddev},${source})`, Order.ATOMIC];
  };

  forBlock['macd'] = (block: any) => {
    const fast = javascriptGenerator.valueToCode(block, 'FAST', Order.ATOMIC) || '12';
    const slow = javascriptGenerator.valueToCode(block, 'SLOW', Order.ATOMIC) || '26';
    const signal = javascriptGenerator.valueToCode(block, 'SIGNAL', Order.ATOMIC) || '9';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.macd(${fast},${slow},${signal},${source})`, Order.ATOMIC];
  };

  forBlock['macda'] = (block: any) => {
    const fast = javascriptGenerator.valueToCode(block, 'FAST', Order.ATOMIC) || '12';
    const slow = javascriptGenerator.valueToCode(block, 'SLOW', Order.ATOMIC) || '26';
    const signal = javascriptGenerator.valueToCode(block, 'SIGNAL', Order.ATOMIC) || '9';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.macdArray(${fast},${slow},${signal},${source})`, Order.ATOMIC];
  };

  forBlock['highest'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '10';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.highest(${period},${source})`, Order.ATOMIC];
  };

  forBlock['lowest'] = (block: any) => {
    const period = javascriptGenerator.valueToCode(block, 'PERIOD', Order.ATOMIC) || '10';
    const source = javascriptGenerator.valueToCode(block, 'SOURCE', Order.ATOMIC) || '[]';
    return [`Deriv.lowest(${period},${source})`, Order.ATOMIC];
  };

  // ════════════════════════════════════════════════════════════
  // ACCOUNT
  // ════════════════════════════════════════════════════════════

  forBlock['account_balance'] = () => {
    return ['Deriv.accountBalance()', Order.ATOMIC];
  };

  forBlock['account_loginid'] = () => {
    return ['Deriv.accountLoginId()', Order.ATOMIC];
  };

  forBlock['is_virtual'] = () => {
    return ['Deriv.isVirtual()', Order.ATOMIC];
  };

  forBlock['total_profit'] = () => {
    return ['Deriv.totalProfit()', Order.ATOMIC];
  };

  forBlock['total_runs'] = () => {
    return ['Deriv.totalRuns()', Order.ATOMIC];
  };

  // ════════════════════════════════════════════════════════════
  // UTILITY
  // ════════════════════════════════════════════════════════════

  forBlock['notify'] = (block: any) => {
    const msg = javascriptGenerator.valueToCode(block, 'MESSAGE', Order.ATOMIC) || "''";
    return `Deriv.log(${msg});\n`;
  };

  forBlock['notify_telegram'] = (block: any) => {
    const token = javascriptGenerator.valueToCode(block, 'TOKEN', Order.ATOMIC) || '(Deriv.settings?.telegramToken || localStorage.getItem("investpal_telegram_token") || "")';
    const chatId = javascriptGenerator.valueToCode(block, 'CHAT_ID', Order.ATOMIC) || '(Deriv.settings?.telegramChatId || localStorage.getItem("investpal_telegram_chatid") || "")';
    const msg = javascriptGenerator.valueToCode(block, 'MESSAGE', Order.ATOMIC) || "''";
    return `Deriv.telegramNotify(${token},${chatId},${msg});\n`;
  };

  forBlock['log_message'] = (block: any) => {
    const text = javascriptGenerator.valueToCode(block, 'TEXT', Order.ATOMIC) || "''";
    return `Deriv.log(${text});\n`;
  };

  forBlock['console'] = (block: any) => {
    const text = javascriptGenerator.valueToCode(block, 'TEXT', Order.ATOMIC) || "''";
    return `console.log(${text});\n`;
  };

  forBlock['loader'] = (block: any) => {
    const action = block.getFieldValue('ACTION');
    return `Deriv.showLoader(${action === 'show'});\n`;
  };

  forBlock['wait_ticks'] = (block: any) => {
    const count = javascriptGenerator.valueToCode(block, 'COUNT', Order.ATOMIC) || '1';
    return `await Deriv.waitTicks(${count});\n`;
  };

  forBlock['timeout'] = (block: any) => {
    const ms = javascriptGenerator.valueToCode(block, 'MS', Order.ATOMIC) || '1000';
    return `await new Promise(r=>setTimeout(r,${ms}));\n`;
  };

  forBlock['epoch'] = () => {
    return ['Date.now()', Order.ATOMIC];
  };

  forBlock['totimestamp'] = (block: any) => {
    const dt = javascriptGenerator.valueToCode(block, 'DATETIME', Order.ATOMIC) || "''";
    return [`new Date(${dt}).getTime()`, Order.ATOMIC];
  };

  forBlock['todatetime'] = (block: any) => {
    const ts = javascriptGenerator.valueToCode(block, 'TIMESTAMP', Order.ATOMIC) || '0';
    return [`new Date(${ts}).toISOString()`, Order.ATOMIC];
  };

  // ════════════════════════════════════════════════════════════
  // RISK MANAGEMENT
  // ════════════════════════════════════════════════════════════

  forBlock['multiplier_stop_loss'] = (block: any) => {
    const amount = javascriptGenerator.valueToCode(block, 'AMOUNT', Order.ATOMIC) || '0';
    return `Deriv.setStopLoss(${amount});\n`;
  };

  forBlock['multiplier_take_profit'] = (block: any) => {
    const amount = javascriptGenerator.valueToCode(block, 'AMOUNT', Order.ATOMIC) || '0';
    return `Deriv.setTakeProfit(${amount});\n`;
  };
}
