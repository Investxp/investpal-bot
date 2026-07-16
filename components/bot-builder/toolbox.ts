export const TOOLBOX_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <category name="Trade Parameters" colour="#FF8C00">
    <block type="trade_definition_market"/>
    <block type="trade_definition_tradetype"/>
    <block type="trade_definition_tradeoptions">
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
    <block type="trade_definition_multiplier">
      <value name="STAKE">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
    </block>
    <block type="trade_definition_accumulator">
      <value name="GROWTH">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
      <value name="STAKE">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
    </block>
    <block type="trade_definition_candleinterval"/>
    <block type="trade_definition_restartonerror"/>
    <block type="trade_definition_restartbuysell"/>
    <block type="purchase"/>
    <block type="sell_at_market"/>
    <block type="check_sell"/>
    <block type="sell_price"/>
    <block type="contract_check_result"/>
    <block type="read_details"/>
    <block type="trade_again">
      <value name="TIMES">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
    </block>
    <block type="ask_price"/>
    <block type="payout"/>
    <block type="accumulator_take_profit">
      <value name="AMOUNT">
        <shadow type="math_number">
          <field name="NUM">10</field>
        </shadow>
      </value>
    </block>
  </category>

  <category name="Purchase Conditions" colour="#FF8C00">
    <block type="before_purchase"/>
    <block type="purchase"/>
  </category>

  <category name="Sell Conditions" colour="#FF8C00">
    <block type="during_purchase"/>
    <block type="sell_at_market"/>
    <block type="check_sell"/>
    <block type="sell_price"/>
  </category>

  <category name="Restart Trading" colour="#FF8C00">
    <block type="after_purchase"/>
    <block type="trade_again">
      <value name="TIMES">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
    </block>
  </category>

  <category name="Risk Management" colour="#ef4444">
    <block type="multiplier_stop_loss">
      <value name="AMOUNT">
        <shadow type="math_number">
          <field name="NUM">10</field>
        </shadow>
      </value>
    </block>
    <block type="multiplier_take_profit">
      <value name="AMOUNT">
        <shadow type="math_number">
          <field name="NUM">20</field>
        </shadow>
      </value>
    </block>
    <block type="accumulator_take_profit">
      <value name="AMOUNT">
        <shadow type="math_number">
          <field name="NUM">10</field>
        </shadow>
      </value>
    </block>
  </category>

  <category name="Analysis" colour="#5b80a5">
    <category name="Indicators" colour="#5b80a5">
      <block type="sma">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">10</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="smaa">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">10</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="ema">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">10</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="emaa">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">10</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="rsi">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">14</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">14</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="rsia">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">14</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">14</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="bbands">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">20</field>
          </shadow>
        </value>
        <value name="STDDEV">
          <shadow type="math_number">
            <field name="NUM">2</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">20</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="bba">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">20</field>
          </shadow>
        </value>
        <value name="STDDEV">
          <shadow type="math_number">
            <field name="NUM">2</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">20</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="macd">
        <value name="FAST">
          <shadow type="math_number">
            <field name="NUM">12</field>
          </shadow>
        </value>
        <value name="SLOW">
          <shadow type="math_number">
            <field name="NUM">26</field>
          </shadow>
        </value>
        <value name="SIGNAL">
          <shadow type="math_number">
            <field name="NUM">9</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">26</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="macda">
        <value name="FAST">
          <shadow type="math_number">
            <field name="NUM">12</field>
          </shadow>
        </value>
        <value name="SLOW">
          <shadow type="math_number">
            <field name="NUM">26</field>
          </shadow>
        </value>
        <value name="SIGNAL">
          <shadow type="math_number">
            <field name="NUM">9</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">26</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="highest">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">10</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
      <block type="lowest">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">10</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
    </category>

    <category name="Tick &amp; Candle Analysis" colour="#5b80a5">
      <block type="tick_value"/>
      <block type="tick_history">
        <value name="COUNT">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
      </block>
      <block type="last_digit"/>
      <block type="last_digit_list">
        <value name="COUNT">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
      </block>
      <block type="check_direction">
        <value name="PERIOD">
          <shadow type="math_number">
            <field name="NUM">5</field>
          </shadow>
        </value>
      </block>
      <block type="ohlc">
        <value name="COUNT">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
      </block>
      <block type="ohlc_values"/>
      <block type="read_ohlc"/>
    </category>

    <category name="Contract" colour="#5b80a5">
      <block type="contract_check_result"/>
      <block type="read_details"/>
      <block type="sell_price"/>
      <block type="check_sell"/>
      <block type="payout"/>
      <block type="ask_price"/>
    </category>

    <category name="Stats" colour="#5b80a5">
      <block type="account_balance"/>
      <block type="total_profit"/>
      <block type="total_runs"/>
      <block type="stat">
        <value name="SOURCE">
          <block type="tick_history">
            <value name="COUNT">
              <shadow type="math_number">
                <field name="NUM">10</field>
              </shadow>
            </value>
          </block>
        </value>
      </block>
    </category>
  </category>

  <category name="Account" colour="#a55ba5">
    <block type="account_balance"/>
    <block type="account_loginid"/>
    <block type="is_virtual"/>
    <block type="total_profit"/>
    <block type="total_runs"/>
  </category>

  <category name="Utility" colour="#5ba58c">
    <category name="Notifications" colour="#5ba58c">
      <block type="log_message">
        <value name="TEXT">
          <shadow type="text">
            <field name="TEXT">message</field>
          </shadow>
        </value>
      </block>
      <block type="notify">
        <value name="MESSAGE">
          <shadow type="text">
            <field name="TEXT">Trade completed</field>
          </shadow>
        </value>
      </block>
      <block type="notify_telegram">
        <value name="TOKEN">
          <shadow type="text">
            <field name="TEXT">bot_token</field>
          </shadow>
        </value>
        <value name="CHAT_ID">
          <shadow type="text">
            <field name="TEXT">chat_id</field>
          </shadow>
        </value>
        <value name="MESSAGE">
          <shadow type="text">
            <field name="TEXT">Trade alert</field>
          </shadow>
        </value>
      </block>
      <block type="console">
        <value name="TEXT">
          <shadow type="text">
            <field name="TEXT">debug</field>
          </shadow>
        </value>
      </block>
    </category>

    <category name="Time" colour="#5ba58c">
      <block type="epoch"/>
      <block type="wait_ticks">
        <value name="COUNT">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
      </block>
      <block type="timeout">
        <value name="MS">
          <shadow type="math_number">
            <field name="NUM">1000</field>
          </shadow>
        </value>
      </block>
      <block type="totimestamp"/>
      <block type="todatetime"/>
    </category>

    <category name="Miscellaneous" colour="#5ba58c">
      <block type="loader"/>
    </category>
  </category>

  <category name="Logic" colour="#5ba55b">
    <block type="controls_if"/>
    <block type="logic_compare"/>
    <block type="logic_operation"/>
    <block type="logic_boolean"/>
    <block type="logic_negate"/>
    <block type="logic_ternary"/>
    <block type="logic_null"/>
  </category>

  <category name="Loops" colour="#5ba55b">
    <block type="controls_repeat_ext">
      <value name="TIMES">
        <shadow type="math_number">
          <field name="NUM">10</field>
        </shadow>
      </value>
    </block>
    <block type="controls_whileUntil"/>
    <block type="controls_for">
      <value name="FROM">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
      <value name="TO">
        <shadow type="math_number">
          <field name="NUM">10</field>
        </shadow>
      </value>
      <value name="BY">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
    </block>
    <block type="controls_forEach"/>
    <block type="controls_flow_statements"/>
  </category>

  <category name="Math" colour="#5b80a5">
    <block type="math_number">
      <field name="NUM">1</field>
    </block>
    <block type="math_arithmetic"/>
    <block type="math_single"/>
    <block type="math_trig"/>
    <block type="math_constant"/>
    <block type="math_number_property"/>
    <block type="math_change"/>
    <block type="math_random_int">
      <value name="FROM">
        <shadow type="math_number">
          <field name="NUM">1</field>
        </shadow>
      </value>
      <value name="TO">
        <shadow type="math_number">
          <field name="NUM">100</field>
        </shadow>
      </value>
    </block>
    <block type="math_random_float"/>
    <block type="math_round"/>
    <block type="math_on_list"/>
    <block type="math_modulo"/>
    <block type="math_constrain"/>
  </category>

  <category name="Variables" colour="#a55ba5" custom="VARIABLE"/>

  <category name="Functions" colour="#a55ba5" custom="PROCEDURE"/>

  <category name="Text" colour="#5ba58c">
    <block type="text"/>
    <block type="text_join"/>
    <block type="text_append"/>
    <block type="text_length"/>
    <block type="text_isEmpty"/>
    <block type="text_indexOf"/>
    <block type="text_charAt"/>
    <block type="text_getSubstring"/>
    <block type="text_changeCase"/>
    <block type="text_trim"/>
    <block type="text_print"/>
    <block type="text_prompt_ext"/>
  </category>

  <category name="Lists" colour="#5ba58c">
    <block type="lists_create_with"/>
    <block type="lists_repeat"/>
    <block type="lists_length"/>
    <block type="lists_isEmpty"/>
    <block type="lists_indexOf"/>
    <block type="lists_getIndex"/>
    <block type="lists_setIndex"/>
    <block type="lists_getSublist"/>
    <block type="lists_split"/>
    <block type="lists_sort"/>
  </category>

  <sep/>

  <category name="Pipeline" colour="#FF8C00">
    <block type="trade_definition"/>
    <block type="before_purchase"/>
    <block type="during_purchase"/>
    <block type="after_purchase"/>
  </category>
</xml>
`;
