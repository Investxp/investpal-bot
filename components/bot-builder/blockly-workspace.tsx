'use client';

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
import 'blockly/blocks';
import { registerDerivBlocks } from './deriv-blocks';
import { registerDerivGenerators } from './deriv-generators';
import { TOOLBOX_XML } from './toolbox';
import { convertLegacyDerivXml } from './legacy-converter';

let registered = false;

export interface BlocklyWorkspaceHandle {
  getWorkspace: () => Blockly.WorkspaceSvg | null;
  getCode: () => string;
  getXml: () => string;
  loadXml: (xml: string) => void;
  getDefaultXml: () => string;
}

export const BlocklyWorkspace = forwardRef<BlocklyWorkspaceHandle, {
  onWorkspaceReady?: (ws: Blockly.WorkspaceSvg) => void;
  onWorkspaceChange?: (code: string) => void;
}>(function BlocklyWorkspace({ onWorkspaceReady, onWorkspaceChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  useEffect(() => {
    if (!registered) {
      registerDerivBlocks();
      registerDerivGenerators();
      registered = true;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let workspace: Blockly.WorkspaceSvg;
    try {
      workspace = Blockly.inject(container, {
        toolbox: TOOLBOX_XML,
        grid: { spacing: 20, length: 3, colour: '#2a2a2a', snap: true },
        zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
        trashcan: true,
        move: { scrollbars: true, drag: true, wheel: true },
        theme: {
          name: 'investpal',
          componentStyles: {
            workspaceBackgroundColour: '#1c1c1c',
            toolboxBackgroundColour: '#151717',
            flyoutBackgroundColour: '#151717',
            flyoutOpacity: 1,
            scrollbarColour: '#2a2a2a',
            insertionMarkerColour: '#ff444f',
            insertionMarkerOpacity: 0.3,
          },
        } as any,
      });
    } catch (err: any) {
      console.error('Blockly inject failed:', err);
      container.innerHTML = `<div style="color:#ef4444;padding:20px;font-size:12px">Blockly failed to load: ${err.message}</div>`;
      return;
    }

    workspaceRef.current = workspace;

    if (onWorkspaceChange) {
      workspace.addChangeListener(() => {
        const code = javascriptGenerator.workspaceToCode(workspace);
        onWorkspaceChange(code);
      });
    }

    const DEFAULT_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_definition" id="root1" x="30" y="20" deletable="false">
    <value name="MARKET">
      <block type="trade_definition_market">
        <field name="SYMBOL">R_100</field>
      </block>
    </value>
    <value name="CONTRACT">
      <block type="trade_definition_tradetype">
        <field name="CONTRACT_TYPE">RISE_FALL</field>
      </block>
    </value>
    <value name="TRADE_OPTIONS">
      <block type="trade_definition_tradeoptions">
        <field name="PREDICTION">RISE</field>
        <field name="CURRENCY">USD</field>
        <field name="DURATION_UNIT">t</field>
        <value name="STAKE_AMOUNT">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
        <value name="DURATION_AMOUNT">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
      </block>
    </value>
    <next>
      <block type="before_purchase" id="root2" deletable="false">
        <statement name="PURCHASE">
          <block type="controls_if">
            <value name="IF0">
              <block type="logic_compare">
                <field name="OP">EQ</field>
                <value name="A">
                  <block type="tick_value"/>
                </value>
                <value name="B">
                  <shadow type="math_number">
                    <field name="NUM">0</field>
                  </shadow>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="purchase">
                <value name="CONTRACT">
                  <block type="trade_definition_tradetype">
                    <field name="CONTRACT_TYPE">RISE_FALL</field>
                  </block>
                </value>
                <value name="SYMBOL">
                  <block type="trade_definition_market">
                    <field name="SYMBOL">R_100</field>
                  </block>
                </value>
                <value name="OPTIONS">
                  <block type="trade_definition_tradeoptions">
                    <field name="PREDICTION">RISE</field>
                    <field name="CURRENCY">USD</field>
                    <field name="DURATION_UNIT">t</field>
                    <value name="STAKE_AMOUNT">
                      <shadow type="math_number">
                        <field name="NUM">1</field>
                      </shadow>
                    </value>
                    <value name="DURATION_AMOUNT">
                      <shadow type="math_number">
                        <field name="NUM">1</field>
                      </shadow>
                    </value>
                  </block>
                </value>
                <next>
                  <block type="log_message">
                    <value name="TEXT">
                      <shadow type="text">
                        <field name="TEXT">Contract bought</field>
                      </shadow>
                    </value>
                  </block>
                </next>
              </block>
            </statement>
          </block>
        </statement>
        <next>
          <block type="during_purchase" id="root3" deletable="false">
            <statement name="SELL">
              <block type="controls_if">
                <value name="IF0">
                  <block type="check_sell"/>
                </value>
                <statement name="DO0">
                  <block type="sell_at_market"/>
                </statement>
              </block>
            </statement>
            <next>
              <block type="after_purchase" id="root4" deletable="false">
                <statement name="RESTART">
                  <block type="log_message">
                    <value name="TEXT">
                      <shadow type="text">
                        <field name="TEXT">Trade completed, restarting...</field>
                      </shadow>
                    </value>
                    <next>
                      <block type="wait_ticks">
                        <value name="COUNT">
                          <shadow type="math_number">
                            <field name="NUM">1</field>
                          </shadow>
                        </value>
                      </block>
                    </next>
                  </block>
                </statement>
              </block>
            </next>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>`;
    try {
      Blockly.Xml.domToWorkspace(
        Blockly.utils.xml.textToDom(DEFAULT_XML),
        workspace,
      );
    } catch (err: any) {
      console.error('Blockly default blocks failed:', err);
    }

    onWorkspaceReady?.(workspace);

    return () => {
      try { workspace.dispose(); } catch {}
      workspaceRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => {
    const DEFAULT_XML = `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_definition" id="root1" x="30" y="20" deletable="false">
    <value name="MARKET">
      <block type="trade_definition_market">
        <field name="SYMBOL">R_100</field>
      </block>
    </value>
    <value name="CONTRACT">
      <block type="trade_definition_tradetype">
        <field name="CONTRACT_TYPE">RISE_FALL</field>
      </block>
    </value>
    <value name="TRADE_OPTIONS">
      <block type="trade_definition_tradeoptions">
        <field name="PREDICTION">RISE</field>
        <field name="CURRENCY">USD</field>
        <field name="DURATION_UNIT">t</field>
        <value name="STAKE_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
        <value name="DURATION_AMOUNT">
          <shadow type="math_number"><field name="NUM">1</field></shadow>
        </value>
      </block>
    </value>
    <next>
      <block type="before_purchase" id="root2" deletable="false">
        <statement name="PURCHASE">
          <block type="controls_if"><value name="IF0"><block type="logic_compare"><field name="OP">EQ</field><value name="A"><block type="tick_value"/></value><value name="B"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></value><statement name="DO0"><block type="purchase"><value name="CONTRACT"><block type="trade_definition_tradetype"><field name="CONTRACT_TYPE">RISE_FALL</field></block></value><value name="SYMBOL"><block type="trade_definition_market"><field name="SYMBOL">R_100</field></block></value><value name="OPTIONS"><block type="trade_definition_tradeoptions"><field name="PREDICTION">RISE</field><field name="CURRENCY">USD</field><field name="DURATION_UNIT">t</field><value name="STAKE_AMOUNT"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="DURATION_AMOUNT"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block></value></block></statement></block>
        </statement>
        <next>
          <block type="during_purchase" id="root3" deletable="false">
            <statement name="SELL">
              <block type="controls_if"><value name="IF0"><block type="check_sell"/></value><statement name="DO0"><block type="sell_at_market"/></statement></block>
            </statement>
            <next>
              <block type="after_purchase" id="root4" deletable="false">
                <statement name="RESTART">
                  <block type="log_message"><value name="TEXT"><shadow type="text"><field name="TEXT">Trade completed, restarting...</field></shadow></value></block>
                </statement>
              </block>
            </next>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>`;
    return {
    getWorkspace: () => workspaceRef.current,
    getCode: () => workspaceRef.current ? javascriptGenerator.workspaceToCode(workspaceRef.current) : '',
    getDefaultXml: () => DEFAULT_XML,
    getXml: () => {
      const ws = workspaceRef.current;
      if (!ws) return '';
      const dom = Blockly.Xml.workspaceToDom(ws);
      return Blockly.Xml.domToText(dom);
    },
    loadXml: (xml: string) => {
      const ws = workspaceRef.current;
      if (!ws) return;
      ws.clear();
      let finalXml = xml;
      const isLegacy = /block type="(trade|tick_analysis|tick|ticks|bb)"/.test(xml);
      if (isLegacy) {
        console.log('[converter] Detected legacy Deriv Bot XML, converting...');
        finalXml = convertLegacyDerivXml(xml);
      }
      const dom = Blockly.utils.xml.textToDom(finalXml);
      Blockly.Xml.domToWorkspace(dom, ws);
    },
  };
});

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    />
  );
});
