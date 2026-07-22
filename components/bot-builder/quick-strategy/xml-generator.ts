import type { TFormData } from './types';

export function generateBlockXML(strategyName: string, data: TFormData, variableName: string = 'bot'): string {
  const { symbol, contract_type, tradetype, stake, duration, durationtype, profit, loss, size, unit, boolean_max_stake, max_stake, growth_rate, sell_conditions, take_profit, tick_count } = data;

  const blocks: string[] = [];

  // strategy name comment
  blocks.push(`<comment x="10" y="10" w="160" h="50" pinned="false">${strategyName}</comment>`);

  // symbol
  blocks.push(`<block type="symbol" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><field name="symbol">${symbol || 'R_10'}</field></block>`);

  if (contract_type) {
    blocks.push(`<block type="contract_type" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><field name="contract_type">${contract_type}</field></block>`);
  }
  if (tradetype) {
    blocks.push(`<block type="tradetype" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><field name="tradetype">${tradetype}</field></block>`);
  }
  if (stake) {
    blocks.push(`<block type="stake" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="stake"><shadow type="math_number"><field name="NUM">${stake}</field></shadow></value></block>`);
  }
  if (duration) {
    blocks.push(`<block type="duration" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><field name="durationtype">${durationtype || 't'}</field><value name="duration"><shadow type="math_number"><field name="NUM">${duration}</field></shadow></value></block>`);
  }
  if (profit) {
    blocks.push(`<block type="profit" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="profit"><shadow type="math_number"><field name="NUM">${profit}</field></shadow></value></block>`);
  }
  if (loss) {
    blocks.push(`<block type="loss" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="loss"><shadow type="math_number"><field name="NUM">${loss}</field></shadow></value></block>`);
  }
  if (size) {
    blocks.push(`<block type="size" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="size"><shadow type="math_number"><field name="NUM">${size}</field></shadow></value></block>`);
  }
  if (unit) {
    blocks.push(`<block type="unit" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="unit"><shadow type="math_number"><field name="NUM">${unit}</field></shadow></value></block>`);
  }
  if (boolean_max_stake && max_stake) {
    blocks.push(`<block type="max_stake" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><field name="boolean_max_stake">TRUE</field><value name="max_stake"><shadow type="math_number"><field name="NUM">${max_stake}</field></shadow></value></block>`);
  }
  if (growth_rate) {
    blocks.push(`<block type="growth_rate" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="growth_rate"><shadow type="math_number"><field name="NUM">${growth_rate}</field></shadow></value></block>`);
  }
  if (sell_conditions) {
    blocks.push(`<block type="sell_conditions" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><field name="sell_conditions">${sell_conditions}</field></block>`);
    if (take_profit) {
      blocks.push(`<block type="take_profit" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="take_profit"><shadow type="math_number"><field name="NUM">${take_profit}</field></shadow></value></block>`);
    }
    if (tick_count) {
      blocks.push(`<block type="tick_count" id="${genId()}" x="10" y="${10 + blocks.length * 40}"><value name="tick_count"><shadow type="math_number"><field name="NUM">${tick_count}</field></shadow></value></block>`);
    }
  }

  if (blocks.length === 0) return '<xml xmlns="https://developers.google.com/blockly/xml"></xml>';
  return `<xml xmlns="https://developers.google.com/blockly/xml">\n${blocks.join('\n')}\n</xml>`;
}

let _idCounter = 0;
function genId(): string {
  return `qs_${Date.now()}_${++_idCounter}`;
}
