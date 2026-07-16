// Regex-based legacy Deriv Bot XML converter.
// Avoids DOMParser namespace issues by using string operations.
export function convertLegacyDerivXml(xml: string): string {
  // ── Helper: extract first block of a given type ──
  function extractBlock(type: string): string | null {
    // Match <block type="type" ...> ... </block> (non-greedy, captures attributes)
    const re = new RegExp(`<block\\s+type="${type}"[^>]*>[\\s\\S]*?<\\/block>`, 'i');
    const m = xml.match(re);
    if (!m) return null;
    return m[0];
  }

  // ── Helper: extract content of a statement by name from a block XML string ──
  function extractStatement(blockXml: string, stName: string): string {
    const re = new RegExp(`<statement\\s+name="${stName}"[^>]*>([\\s\\S]*?)<\\/statement>`, 'i');
    const m = blockXml.match(re);
    return m ? m[1].trim() : '';
  }

  // ── Helper: rename block types ──
  function renameBlocks(xmlStr: string, oldType: string, newType: string): string {
    const re1 = new RegExp(`(<block\\s+type=")${oldType}(")`, 'g');
    const re2 = new RegExp(`(<shadow\\s+type=")${oldType}(")`, 'g');
    return xmlStr.replace(re1, `$1${newType}$2`).replace(re2, `$1${newType}$2`);
  }

  // ── Helper: rename field values ──
  function renameFieldVal(xmlStr: string, blockType: string, oldField: string, newField: string, valMap?: Record<string, string>): string {
    let s = xmlStr;
    const re = new RegExp(`(<block\\s+type="${blockType}"[^>]*>)`, 'g');
    // We need to find the block, then rename fields within it
    // Simple approach: replace all field name references globally
    s = s.replace(new RegExp(`(<field\\s+name=")${oldField}(">)`, 'g'), `$1${newField}$2`);
    if (valMap) {
      for (const [oldVal, newVal] of Object.entries(valMap)) {
        s = s.replace(new RegExp(`(>)\\s*${oldVal}\\s*(<\\/field>)`, 'g'), `$1${newVal}$2`);
      }
    }
    return s;
  }

  // ── Helper: rename statement names ──
  function renameStatement(xmlStr: string, oldSt: string, newSt: string): string {
    return xmlStr.replace(new RegExp(`(<statement\\s+name=")${oldSt}(">)`, 'g'), `$1${newSt}$2`);
  }

  // ── Helper: rename value input names ──
  function renameInput(xmlStr: string, oldName: string, newName: string): string {
    return xmlStr.replace(new RegExp(`(<value\\s+name=")${oldName}(">)`, 'g'), `$1${newName}$2`);
  }

  // ── Helper: remove elements matching regex ──
  function removeEl(xmlStr: string, pattern: RegExp): string {
    return xmlStr.replace(pattern, '');
  }

  // ── Helper: extract field value ──
  function getField(xmlStr: string, fieldName: string): string {
    const re = new RegExp(`<field\\s+name="${fieldName}"[^>]*>([^<]*)<\\/field>`, 'i');
    const m = xmlStr.match(re);
    return m ? m[1] : '';
  }

  // ── Step 1: Extract old blocks ──
  const tradeBlock = extractBlock('trade');
  const bpBlock = extractBlock('before_purchase');
  const apBlock = extractBlock('after_purchase');
  const tickAnalysisBlocks: string[] = [];
  let remaining = xml;
  // Extract all tick_analysis blocks
  while (true) {
    const b = extractBlock.call({ xml: remaining }, 'tick_analysis');
    if (!b) break;
    tickAnalysisBlocks.push(b);
    remaining = remaining.replace(b, '');
  }

  if (!tradeBlock) {
    // No legacy trade block — just do block renames and return
    let res = xml;
    res = renameBlocks(res, 'tick', 'tick_value');
    res = renameBlocks(res, 'ticks', 'tick_history');
    res = renameBlocks(res, 'bb', 'bbands');
    res = renameBlocks(res, 'tradeOptions', 'trade_definition_tradeoptions');
    res = renameFieldVal(res, 'contract_check_result', 'CHECK_RESULT', 'RESULT', { win: 'won', loss: 'lost' });
    res = renameStatement(res, 'BEFOREPURCHASE_STACK', 'PURCHASE');
    res = renameStatement(res, 'AFTERPURCHASE_STACK', 'RESTART');
    res = removeEl(res, /<field\s+name="(NOTIFICATION_TYPE|NOTIFICATION_SOUND|BBRESULT_LIST|PURCHASE_LIST|MARKET_LIST|SUBMARKET_LIST|SYMBOL_LIST|TRADETYPECAT_LIST|TRADETYPE_LIST|TYPE_LIST|CANDLEINTERVAL_LIST|TIME_MACHINE_ENABLED|RESTARTONERROR)"[^>]*>[^<]*<\/field>/g);
    res = res.replace(/x="[^"]*"/g, '').replace(/y="[^"]*"/g, '');
    res = renameInput(res, 'INPUT', 'SOURCE');
    res = renameInput(res, 'UPMULTIPLIER', 'STDDEV');
    return res;
  }

  // ── Step 2: Extract data from trade block ──
  const marketList = getField(tradeBlock, 'MARKET_LIST') || 'volatility';
  const symbolList = getField(tradeBlock, 'SYMBOL_LIST') || 'R_100';
  const tradeTypeField = getField(tradeBlock, 'TRADETYPE_LIST') || 'risefall';
  let contractType = 'RISE_FALL';
  if (tradeTypeField === 'calldigit') contractType = 'DIGITMATCH';
  else if (tradeTypeField === 'putdigit') contractType = 'DIFF';

  const initContent = extractStatement(tradeBlock, 'INITIALIZATION');
  const submarketContent = extractStatement(tradeBlock, 'SUBMARKET');

  // ── Step 3: Extract before_purchase content ──
  let bpContent = '';
  if (bpBlock) {
    bpContent = extractStatement(bpBlock, 'BEFOREPURCHASE_STACK');
  }

  // ── Step 4: Extract after_purchase content ──
  let apContent = '';
  if (apBlock) {
    apContent = extractStatement(apBlock, 'AFTERPURCHASE_STACK');
  }

  // ── Step 5: Extract tick_analysis content ──
  let taContent = '';
  for (const ta of tickAnalysisBlocks) {
    const c = extractStatement(ta, 'TICKANALYSIS_STACK');
    if (c) taContent += c + '\n';
  }

  // ── Step 6: Rename blocks inside extracted content ──
  const convertInner = (s: string): string => {
    let res = s;
    res = renameBlocks(res, 'tick', 'tick_value');
    res = renameBlocks(res, 'ticks', 'tick_history');
    res = renameBlocks(res, 'bb', 'bbands');
    res = renameBlocks(res, 'tradeOptions', 'trade_definition_tradeoptions');
    res = renameFieldVal(res, 'contract_check_result', 'CHECK_RESULT', 'RESULT', { win: 'won', loss: 'lost' });
    res = renameInput(res, 'INPUT', 'SOURCE');
    res = renameInput(res, 'UPMULTIPLIER', 'STDDEV');
    // Remove old fields
    res = removeEl(res, /<field\s+name="(NOTIFICATION_TYPE|NOTIFICATION_SOUND|BBRESULT_LIST)"[^>]*>[^<]*<\/field>/g);
    // Convert purchase block
    res = res.replace(
      /<block\s+type="purchase"([^>]*)>\s*<field\s+name="PURCHASE_LIST">([^<]+)<\/field>([\s\S]*?)<\/block>/g,
      (_, attrs, val, rest) => {
        const ct = val === 'PUT' ? 'FALL' : 'RISE';
        return `<block type="purchase"${attrs}><value name="CONTRACT"><block type="trade_definition_tradetype" deletable="false"><field name="CONTRACT_TYPE">${ct}</field></block></value>${rest}</block>`;
      }
    );
    return res;
  };

  const convertedInit = convertInner(initContent);
  const convertedBp = convertInner(bpContent);
  const convertedAp = convertInner(apContent);
  const convertedTa = convertInner(taContent);

  // ── Step 7: Build clean pipeline ──
  // Merge tick_analysis + before_purchase content into PURCHASE statement
  const purchaseContent = [convertedTa, convertedBp].filter(Boolean).join('\n');
  const afterContent = convertedAp;

  // Trade options
  let optionsXml = '';
  if (submarketContent) {
    // Extract tradeOptions block from submarket
    const optRe = /<block\s+type="trade_definition_tradeoptions"[\s\S]*?<\/block>/i;
    const m = submarketContent.match(optRe);
    if (m) optionsXml = m[0];
  }

  const lines: string[] = [];
  lines.push('<xml xmlns="https://developers.google.com/blockly/xml">');
  lines.push('<block type="trade_definition" id="root1" deletable="false" x="30" y="20">');
  lines.push(`<value name="MARKET"><block type="trade_definition_market" deletable="false"><field name="MARKET">${marketList}</field><field name="SYMBOL">${symbolList}</field></block></value>`);
  lines.push(`<value name="CONTRACT"><block type="trade_definition_tradetype" deletable="false"><field name="CONTRACT_TYPE">${contractType}</field></block></value>`);
  if (optionsXml) {
    lines.push(`<value name="TRADE_OPTIONS">${optionsXml}</value>`);
  }
  if (convertedInit) {
    lines.push(`<statement name="INIT">${convertedInit}</statement>`);
  }
  lines.push('<next>');
  lines.push('<block type="before_purchase" id="root2" deletable="false" x="30" y="250">');
  if (purchaseContent) {
    lines.push(`<statement name="PURCHASE">${purchaseContent}</statement>`);
  }
  lines.push('<next>');
  lines.push('<block type="during_purchase" id="root3" deletable="false" x="30" y="400">');
  lines.push('<statement name="SELL"></statement>');
  lines.push('<next>');
  lines.push('<block type="after_purchase" id="root4" deletable="false" x="30" y="550">');
  if (afterContent) {
    lines.push(`<statement name="RESTART">${afterContent}</statement>`);
  }
  lines.push('</block>');
  lines.push('</next>');
  lines.push('</block>');
  lines.push('</next>');
  lines.push('</block>');
  lines.push('</next>');
  lines.push('</block>');
  lines.push('</xml>');

  return lines.join('\n');
}
