export type VariableDataType = 'DOUBLE' | 'STRING' | 'INT' | 'BOOLEAN' | 'LONG' | 'TIMESTAMP';

export interface Variable {
  name: string;
  unit: string;
  dataType: VariableDataType;
  lastValue?: number | string | boolean;
  lastTimestamp?: string;
  selected: boolean;
}
