import type { TFormData } from './types';

function genId(): string {
  return Math.random().toString(36).slice(2, 15);
}

type StrategyType = 'martingale' | 'dalembert' | 'oscars_grind' | 'reverse_martingale' | 'reverse_dalembert' | '1_3_2_6'
  | 'accumulators_martingale' | 'accumulators_dalembert';

export function generateStrategyXml(strategy: StrategyType, values: TFormData): string {
  const symbol = String(values.symbol || 'R_100');
  const contractType = String(values.contract_type || 'RISE_FALL');
  const tradetype = String(values.tradetype || 'RISE');
  const stake = String(values.stake || '1');
  const duration = String(values.duration || '1');
  const durationUnit = String(values.durationtype || 't');
  const profit = String(values.profit || '');
  const loss = String(values.loss || '');
  const size = String(values.size || '2');
  const unit = String(values.unit || '1');
  const maxStake = String(values.max_stake || '10');
  const useMaxStake = !!values.boolean_max_stake;
  const growthRate = String(values.growth_rate || '0.01');
  const takeProfit = String(values.take_profit || '0');
  const tickCount = String(values.tick_count || '0');
  const useTickCount = !!values.boolean_tick_count;
  const prediction = String(values.tradetype || 'RISE');

  let afterPurchaseXml = '';

  switch (strategy) {
    case 'martingale':
      afterPurchaseXml = generateMartingaleBlocks(stake, size, profit, loss, useMaxStake, maxStake);
      break;
    case 'dalembert':
      afterPurchaseXml = generateDalembertBlocks(stake, unit, profit, loss, useMaxStake, maxStake);
      break;
    case 'oscars_grind':
      afterPurchaseXml = generateOscarsGrindBlocks(stake, unit, profit, loss, useMaxStake, maxStake);
      break;
    case 'reverse_martingale':
      afterPurchaseXml = generateReverseMartingaleBlocks(stake, size, profit, loss, useMaxStake, maxStake);
      break;
    case 'reverse_dalembert':
      afterPurchaseXml = generateReverseDalembertBlocks(stake, unit, profit, loss, useMaxStake, maxStake);
      break;
    case '1_3_2_6':
      afterPurchaseXml = generate1326Blocks(stake, profit, loss);
      break;
    case 'accumulators_martingale':
      afterPurchaseXml = generateAccumulatorMartingaleBlocks(stake, size, profit, loss, growthRate, useTickCount, tickCount, takeProfit, useMaxStake, maxStake);
      break;
    case 'accumulators_dalembert':
      afterPurchaseXml = generateAccumulatorDalembertBlocks(stake, unit, profit, loss, growthRate, useTickCount, tickCount, takeProfit, useMaxStake, maxStake);
      break;
    default:
      afterPurchaseXml = generateMartingaleBlocks(stake, size, profit, loss, useMaxStake, maxStake);
  }

  const initXml = generateInitBlock(tradetype, stake, size, unit, strategy);
  const marketBlock = generateMarketBlock(symbol);
  const contractBlock = generateContractBlock(contractType);
  const tradeOptionsBlock = generateTradeOptionsBlock(prediction, stake, duration, durationUnit);

  return `<?xml version="1.0" encoding="UTF-8"?>
<xml xmlns="https://developers.google.com/blockly/xml">
  <variables>
    ${generateVariables(strategy)}
  </variables>
  <block type="trade_definition" id="${genId()}" deletable="false" x="20" y="20">
    <value name="MARKET">
      ${marketBlock}
    </value>
    <value name="CONTRACT">
      ${contractBlock}
    </value>
    <value name="TRADE_OPTIONS">
      ${tradeOptionsBlock}
    </value>
    <statement name="INIT">
      ${initXml}
    </statement>
  </block>
  <block type="before_purchase" id="bp_${genId()}" deletable="false" x="20" y="180">
    <statement name="PURCHASE">
      <block type="purchase" id="purch_${genId()}">
        <value name="CONTRACT">
          ${contractBlock}
        </value>
        <value name="SYMBOL">
          ${marketBlock}
        </value>
        <value name="OPTIONS">
          ${tradeOptionsBlock}
        </value>
      </block>
    </statement>
  </block>
  <block type="during_purchase" id="dp_${genId()}" deletable="false" x="20" y="280"></block>
  <block type="after_purchase" id="ap_${genId()}" deletable="false" x="20" y="340">
    <statement name="RESTART">
      ${afterPurchaseXml}
    </statement>
  </block>
</xml>`;
}

function generateVariables(strategy: string): string {
  const vars = [
    { id: genId(), name: 'base_stake' },
    { id: genId(), name: 'current_stake' },
    { id: genId(), name: 'total_profit' },
    { id: genId(), name: 'total_loss' },
  ];
  if (strategy.includes('martingale') || strategy === 'reverse_martingale') {
    vars.push({ id: genId(), name: 'multiplier' });
  }
  if (strategy.includes('dalembert') || strategy === 'reverse_dalembert' || strategy === 'oscars_grind') {
    vars.push({ id: genId(), name: 'unit' });
  }
  if (strategy === '1_3_2_6') {
    vars.push({ id: genId(), name: 'step' });
  }
  if (strategy.startsWith('accumulators')) {
    vars.push({ id: genId(), name: 'growth_rate' });
    if (strategy.includes('tick_count')) {
      vars.push({ id: genId(), name: 'tick_count' });
    }
  }
  return vars.map(v => `<variable id="${v.id}">${v.name}</variable>`).join('\n    ');
}

function generateMarketBlock(symbol: string): string {
  const marketMap: Record<string, string> = {
    'R_10': 'volatility', 'R_25': 'volatility', 'R_50': 'volatility', 'R_75': 'volatility', 'R_100': 'volatility',
    '1HZ10V': 'volatility', '1HZ25V': 'volatility', '1HZ50V': 'volatility', '1HZ100V': 'volatility',
    'JD10': 'boom_crash', 'JD25': 'boom_crash', 'JD50': 'boom_crash', 'JD75': 'boom_crash',
    'EURUSD': 'forex', 'GBPUSD': 'forex',
  };
  const market = marketMap[symbol] || 'volatility';
  return `<shadow type="trade_definition_market" id="${genId()}">
      <field name="MARKET">${market}</field>
      <field name="SYMBOL">${symbol}</field>
    </shadow>`;
}

function generateContractBlock(contractType: string): string {
  return `<shadow type="trade_definition_tradetype" id="${genId()}">
      <field name="CONTRACT_TYPE">${contractType}</field>
    </shadow>`;
}

function generateTradeOptionsBlock(prediction: string, stake: string, duration: string, durationUnit: string): string {
  return `<shadow type="trade_definition_tradeoptions" id="${genId()}">
      <field name="PREDICTION">${prediction}</field>
      <field name="CURRENCY">USD</field>
      <field name="DURATION_UNIT">${durationUnit}</field>
      <value name="STAKE_AMOUNT">
        <shadow type="math_number" id="${genId()}">
          <field name="NUM">${stake}</field>
        </shadow>
      </value>
      <value name="DURATION_AMOUNT">
        <shadow type="math_number" id="${genId()}">
          <field name="NUM">${duration}</field>
        </shadow>
      </value>
    </shadow>`;
}

function generateInitBlock(tradetype: string, stake: string, size: string, unit: string, strategy: string): string {
  const lines: string[] = [];
  const sId = (name: string) => `var_${name}_${genId().slice(0, 6)}`;

  lines.push(`<block type="variables_set" id="${sId('base')}">
      <field name="VAR" id="${genId()}">base_stake</field>
      <value name="VALUE">
        <shadow type="math_number" id="${genId()}"><field name="NUM">${stake}</field></shadow>
      </value>`);

  lines.push(`<next>
        <block type="variables_set" id="${sId('current')}">
          <field name="VAR" id="${genId()}">current_stake</field>
          <value name="VALUE">
            <block type="variables_get" id="${sId('get_base')}">
              <field name="VAR" id="${genId()}">base_stake</field>
            </block>
          </value>`);

  if (strategy.includes('dalembert') || strategy === 'reverse_dalembert' || strategy === 'oscars_grind') {
    lines.push(`<next>
          <block type="variables_set" id="${sId('unit_var')}">
            <field name="VAR" id="${genId()}">unit</field>
            <value name="VALUE">
              <shadow type="math_number" id="${genId()}"><field name="NUM">${unit}</field></shadow>
            </value>
          </block>`);
  }

  if (strategy.includes('martingale') || strategy === 'reverse_martingale' || strategy === '1_3_2_6') {
    lines.push(`<next>
          <block type="variables_set" id="${sId('mult')}">
            <field name="VAR" id="${genId()}">multiplier</field>
            <value name="VALUE">
              <shadow type="math_number" id="${genId()}"><field name="NUM">${strategy === 'reverse_martingale' ? size : '2'}</field></shadow>
            </value>
          </block>`);
  }

  if (strategy === '1_3_2_6') {
    lines.push(`<next>
          <block type="variables_set" id="${sId('step')}">
            <field name="VAR" id="${genId()}">step</field>
            <value name="VALUE">
              <shadow type="math_number" id="${genId()}"><field name="NUM">1</field></shadow>
            </value>
          </block>`);
  }

  lines.push(`</next>`);
  if (strategy.includes('dalembert') || strategy === 'reverse_dalembert' || strategy === 'oscars_grind') lines.push('</next>');
  if (strategy.includes('martingale') || strategy === 'reverse_martingale' || strategy === '1_3_2_6') lines.push('</next>');
  if (strategy === '1_3_2_6') lines.push('</next>');

  // Close all blocks in reverse order
  const totalCloses = 2 + (strategy.includes('dalembert') || strategy === 'reverse_dalembert' || strategy === 'oscars_grind' ? 1 : 0)
    + (strategy.includes('martingale') || strategy === 'reverse_martingale' || strategy === '1_3_2_6' ? 1 : 0)
    + (strategy === '1_3_2_6' ? 1 : 0);
  for (let i = 0; i < totalCloses; i++) {
    lines.push('</block>');
  }

  return lines.join('\n      ');
}

function generateIfWonBlock(body: string): string {
  const ifId = genId();
  return `<block type="controls_if" id="${genId()}">
      <mutation elseif="0" else="1"></mutation>
      <value name="IF0">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">won</field>
        </block>
      </value>
      <statement name="DO0">
        ${body}
      </statement>
      <statement name="ELSE"></statement>
    </block>`;
}

function generateRestartBlock(): string {
  return `<block type="variables_set" id="${genId()}">
      <field name="VAR" id="${genId()}">current_stake</field>
      <value name="VALUE">
        <block type="variables_get" id="${genId()}">
          <field name="VAR" id="${genId()}">base_stake</field>
        </block>
      </value>
    </block>`;
}

function generateMartingaleBlocks(stake: string, size: string, profit: string, loss: string, useMaxStake: boolean, maxStake: string): string {
  let xml = `<block type="controls_if" id="${genId()}">
      <mutation elseif="1" else="1"></mutation>
      <value name="IF0">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">lost</field>
        </block>
      </value>
      <statement name="DO0">
        <block type="variables_set" id="${genId()}">
          <field name="VAR" id="${genId()}">current_stake</field>
          <value name="VALUE">
            <block type="math_arithmetic" id="${genId()}">
              <field name="OP">MULTIPLY</field>
              <value name="A">
                <shadow type="math_number" id="${genId()}"><field name="NUM">${size}</field></shadow>
              </value>
              <value name="B">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">current_stake</field>
                </block>
              </value>
            </block>
          </value>`;

  if (useMaxStake) {
    xml += `<next>
          <block type="controls_if" id="${genId()}">
            <value name="IF0">
              <block type="logic_compare" id="${genId()}">
                <field name="OP">GT</field>
                <value name="A">
                  <block type="variables_get" id="${genId()}">
                    <field name="VAR" id="${genId()}">current_stake</field>
                  </block>
                </value>
                <value name="B">
                  <shadow type="math_number" id="${genId()}"><field name="NUM">${maxStake}</field></shadow>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="variables_set" id="${genId()}">
                <field name="VAR" id="${genId()}">current_stake</field>
                <value name="VALUE">
                  <shadow type="math_number" id="${genId()}"><field name="NUM">${maxStake}</field></shadow>
                </value>
              </block>
            </statement>
          </block>
        </next>`;
  }

  xml += `</block>
      </statement>
      <value name="IF1">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">won</field>
        </block>
      </value>
      <statement name="DO1">
        ${generateRestartBlock()}
      </statement>
      <statement name="ELSE"></statement>
    </block>`;

  return xml;
}

function generateDalembertBlocks(stake: string, unit: string, profit: string, loss: string, useMaxStake: boolean, maxStake: string): string {
  let xml = `<block type="controls_if" id="${genId()}">
      <mutation elseif="1" else="1"></mutation>
      <value name="IF0">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">lost</field>
        </block>
      </value>
      <statement name="DO0">
        <block type="variables_set" id="${genId()}">
          <field name="VAR" id="${genId()}">current_stake</field>
          <value name="VALUE">
            <block type="math_arithmetic" id="${genId()}">
              <field name="OP">ADD</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">current_stake</field>
                </block>
              </value>
              <value name="B">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">unit</field>
                </block>
              </value>
            </block>
          </value>`;

  if (useMaxStake) {
    xml += `<next>
          <block type="controls_if" id="${genId()}">
            <value name="IF0">
              <block type="logic_compare" id="${genId()}">
                <field name="OP">GT</field>
                <value name="A">
                  <block type="variables_get" id="${genId()}">
                    <field name="VAR" id="${genId()}">current_stake</field>
                  </block>
                </value>
                <value name="B">
                  <shadow type="math_number" id="${genId()}"><field name="NUM">${maxStake}</field></shadow>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="variables_set" id="${genId()}">
                <field name="VAR" id="${genId()}">current_stake</field>
                <value name="VALUE">
                  <shadow type="math_number" id="${genId()}"><field name="NUM">${maxStake}</field></shadow>
                </value>
              </block>
            </statement>
          </block>
        </next>`;
  }

  xml += `</block>
      </statement>
      <value name="IF1">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">won</field>
        </block>
      </value>
      <statement name="DO1">
        <block type="controls_if" id="${genId()}">
          <value name="IF0">
            <block type="logic_compare" id="${genId()}">
              <field name="OP">GT</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">current_stake</field>
                </block>
              </value>
              <value name="B">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">unit</field>
                </block>
              </value>
            </block>
          </value>
          <statement name="DO0">
            <block type="variables_set" id="${genId()}">
              <field name="VAR" id="${genId()}">current_stake</field>
              <value name="VALUE">
                <block type="math_arithmetic" id="${genId()}">
                  <field name="OP">MINUS</field>
                  <value name="A">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">current_stake</field>
                    </block>
                  </value>
                  <value name="B">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">unit</field>
                    </block>
                  </value>
                </block>
              </value>
            </block>
          </statement>
        </block>
      </statement>
      <statement name="ELSE"></statement>
    </block>`;

  return xml;
}

function generateOscarsGrindBlocks(stake: string, unit: string, profit: string, loss: string, useMaxStake: boolean, maxStake: string): string {
  return `<block type="controls_if" id="${genId()}">
      <mutation elseif="0" else="1"></mutation>
      <value name="IF0">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">won</field>
        </block>
      </value>
      <statement name="DO0">
        <block type="variables_set" id="${genId()}">
          <field name="VAR" id="${genId()}">current_stake</field>
          <value name="VALUE">
            <block type="math_arithmetic" id="${genId()}">
              <field name="OP">ADD</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">current_stake</field>
                </block>
              </value>
              <value name="B">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">unit</field>
                </block>
              </value>
            </block>
          </value>
        </block>
      </statement>
      <statement name="ELSE">
        <block type="variables_get" id="${genId()}">
          <field name="VAR" id="${genId()}">current_stake</field>
        </block>
      </statement>
    </block>`;
}

function generateReverseMartingaleBlocks(stake: string, size: string, profit: string, loss: string, useMaxStake: boolean, maxStake: string): string {
  return `<block type="controls_if" id="${genId()}">
      <mutation elseif="0" else="1"></mutation>
      <value name="IF0">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">won</field>
        </block>
      </value>
      <statement name="DO0">
        <block type="variables_set" id="${genId()}">
          <field name="VAR" id="${genId()}">current_stake</field>
          <value name="VALUE">
            <block type="math_arithmetic" id="${genId()}">
              <field name="OP">MULTIPLY</field>
              <value name="A">
                <shadow type="math_number" id="${genId()}"><field name="NUM">${size}</field></shadow>
              </value>
              <value name="B">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">current_stake</field>
                </block>
              </value>
            </block>
          </value>
        </block>
      </statement>
      <statement name="ELSE">
        ${generateRestartBlock()}
      </statement>
    </block>`;
}

function generateReverseDalembertBlocks(stake: string, unit: string, profit: string, loss: string, useMaxStake: boolean, maxStake: string): string {
  return `<block type="controls_if" id="${genId()}">
      <mutation elseif="0" else="1"></mutation>
      <value name="IF0">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">won</field>
        </block>
      </value>
      <statement name="DO0">
        <block type="variables_set" id="${genId()}">
          <field name="VAR" id="${genId()}">current_stake</field>
          <value name="VALUE">
            <block type="math_arithmetic" id="${genId()}">
              <field name="OP">ADD</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">current_stake</field>
                </block>
              </value>
              <value name="B">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">unit</field>
                </block>
              </value>
            </block>
          </value>
        </block>
      </statement>
      <statement name="ELSE">
        <block type="controls_if" id="${genId()}">
          <value name="IF0">
            <block type="logic_compare" id="${genId()}">
              <field name="OP">GT</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">current_stake</field>
                </block>
              </value>
              <value name="B">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">unit</field>
                </block>
              </value>
            </block>
          </value>
          <statement name="DO0">
            <block type="variables_set" id="${genId()}">
              <field name="VAR" id="${genId()}">current_stake</field>
              <value name="VALUE">
                <block type="math_arithmetic" id="${genId()}">
                  <field name="OP">MINUS</field>
                  <value name="A">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">current_stake</field>
                    </block>
                  </value>
                  <value name="B">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">unit</field>
                    </block>
                  </value>
                </block>
              </value>
            </block>
          </statement>
        </block>
      </statement>
    </block>`;
}

function generate1326Blocks(stake: string, profit: string, loss: string): string {
  return `<block type="controls_if" id="${genId()}">
      <mutation elseif="0" else="1"></mutation>
      <value name="IF0">
        <block type="contract_check_result" id="${genId()}">
          <field name="RESULT">won</field>
        </block>
      </value>
      <statement name="DO0">
        <block type="controls_if" id="${genId()}">
          <mutation elseif="3" else="1"></mutation>
          <value name="IF0">
            <block type="logic_compare" id="${genId()}">
              <field name="OP">EQ</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                </block>
              </value>
              <value name="B">
                <shadow type="math_number" id="${genId()}"><field name="NUM">1</field></shadow>
              </value>
            </block>
          </value>
          <statement name="DO0">
            <block type="variables_set" id="${genId()}">
              <field name="VAR" id="${genId()}">current_stake</field>
              <value name="VALUE">
                <block type="math_arithmetic" id="${genId()}">
                  <field name="OP">MULTIPLY</field>
                  <value name="A">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">1</field></shadow>
                  </value>
                  <value name="B">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">base_stake</field>
                    </block>
                  </value>
                </block>
              </value>
              <next>
                <block type="variables_set" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                  <value name="VALUE">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">2</field></shadow>
                  </value>
                </block>
              </next>
            </block>
          </statement>
          <value name="IF1">
            <block type="logic_compare" id="${genId()}">
              <field name="OP">EQ</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                </block>
              </value>
              <value name="B">
                <shadow type="math_number" id="${genId()}"><field name="NUM">2</field></shadow>
              </value>
            </block>
          </value>
          <statement name="DO1">
            <block type="variables_set" id="${genId()}">
              <field name="VAR" id="${genId()}">current_stake</field>
              <value name="VALUE">
                <block type="math_arithmetic" id="${genId()}">
                  <field name="OP">MULTIPLY</field>
                  <value name="A">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">3</field></shadow>
                  </value>
                  <value name="B">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">base_stake</field>
                    </block>
                  </value>
                </block>
              </value>
              <next>
                <block type="variables_set" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                  <value name="VALUE">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">3</field></shadow>
                  </value>
                </block>
              </next>
            </block>
          </statement>
          <value name="IF2">
            <block type="logic_compare" id="${genId()}">
              <field name="OP">EQ</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                </block>
              </value>
              <value name="B">
                <shadow type="math_number" id="${genId()}"><field name="NUM">3</field></shadow>
              </value>
            </block>
          </value>
          <statement name="DO2">
            <block type="variables_set" id="${genId()}">
              <field name="VAR" id="${genId()}">current_stake</field>
              <value name="VALUE">
                <block type="math_arithmetic" id="${genId()}">
                  <field name="OP">MULTIPLY</field>
                  <value name="A">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">2</field></shadow>
                  </value>
                  <value name="B">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">base_stake</field>
                    </block>
                  </value>
                </block>
              </value>
              <next>
                <block type="variables_set" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                  <value name="VALUE">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">4</field></shadow>
                  </value>
                </block>
              </next>
            </block>
          </statement>
          <value name="IF3">
            <block type="logic_compare" id="${genId()}">
              <field name="OP">EQ</field>
              <value name="A">
                <block type="variables_get" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                </block>
              </value>
              <value name="B">
                <shadow type="math_number" id="${genId()}"><field name="NUM">4</field></shadow>
              </value>
            </block>
          </value>
          <statement name="DO3">
            <block type="variables_set" id="${genId()}">
              <field name="VAR" id="${genId()}">current_stake</field>
              <value name="VALUE">
                <block type="math_arithmetic" id="${genId()}">
                  <field name="OP">MULTIPLY</field>
                  <value name="A">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">6</field></shadow>
                  </value>
                  <value name="B">
                    <block type="variables_get" id="${genId()}">
                      <field name="VAR" id="${genId()}">base_stake</field>
                    </block>
                  </value>
                </block>
              </value>
              <next>
                ${generateRestartBlock().replace('current_stake', 'step').replace('base_stake', '1').replace('variables_set', 'variables_set').replace('current_stake', 'step').replace('base_stake', '1')}
                <next>
                <block type="variables_set" id="${genId()}">
                  <field name="VAR" id="${genId()}">step</field>
                  <value name="VALUE">
                    <shadow type="math_number" id="${genId()}"><field name="NUM">1</field></shadow>
                  </value>
                </block>
                </next>
                </block>
              </next>
            </block>
          </statement>
          <statement name="ELSE"></statement>
        </block>
      </statement>
      <statement name="ELSE">
        ${generateRestartBlock()}
        <next>
        <block type="variables_set" id="${genId()}">
          <field name="VAR" id="${genId()}">step</field>
          <value name="VALUE">
            <shadow type="math_number" id="${genId()}"><field name="NUM">1</field></shadow>
          </value>
        </block>
        </next>
      </statement>
    </block>`;
}

function generateAccumulatorMartingaleBlocks(stake: string, size: string, profit: string, loss: string, growthRate: string, useTickCount: boolean, tickCount: string, takeProfit: string, useMaxStake: boolean, maxStake: string): string {
  return generateMartingaleBlocks(stake, size, profit, loss, useMaxStake, maxStake);
}

function generateAccumulatorDalembertBlocks(stake: string, unit: string, profit: string, loss: string, growthRate: string, useTickCount: boolean, tickCount: string, takeProfit: string, useMaxStake: boolean, maxStake: string): string {
  return generateDalembertBlocks(stake, unit, profit, loss, useMaxStake, maxStake);
}
