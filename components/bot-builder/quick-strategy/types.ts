export type TFormData = Record<string, string | number | boolean>;

export type TValidationItem =
  | 'number' | 'required' | 'ceil' | 'floor' | 'integer'
  | { type: 'min' | 'max'; value: number; message: string };

export type TConfigItem = {
  type: 'number' | 'label' | 'checkbox' | 'symbol' | 'tradetype' | 'contract_type' | 'durationtype' | 'growth_rate' | 'sell_conditions';
  name?: keyof TFormData;
  label?: string;
  description?: string;
  attached?: boolean;
  hide?: string[];
  validation?: TValidationItem[];
  should_have?: { key: string; value: string | number | boolean; multiple?: string[] }[];
  hide_without_should_have?: boolean;
  has_currency_unit?: boolean;
};

export type TStrategy = {
  name: string;
  label: string;
  description: string;
  category: 'options' | 'accumulators';
  fields: TConfigItem[][];
};

export type TStrategies = Record<string, TStrategy>;
