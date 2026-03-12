export interface TimeSeriesDataPoint {
  time: string;
  [variableName: string]: string | number | boolean | null;
}

export interface TimeSeriesResponse {
  aspectName: string;
  data: TimeSeriesDataPoint[];
}

export interface PlantSimVariable {
  aspect: string;
  name: string;
  unit: string;
  dataType: string;
  values: { time: string; value: number | string | boolean | null }[];
}

export interface PlantSimPayload {
  assetId: string;
  assetName: string;
  mode: 'historic' | 'live';
  from: string;
  to: string;
  variables: PlantSimVariable[];
}
