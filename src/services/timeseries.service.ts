import { Injectable } from '@angular/core';
import { Variable } from '../models/variable.model';
import { PlantSimPayload, PlantSimVariable, TimeSeriesDataPoint } from '../models/timeseries.model';
import { Asset } from '../models/asset.model';
import { IhApiService } from './ih-api.service';

interface SelectedAspectVariables {
  aspectName: string;
  variables: Variable[];
}

@Injectable({ providedIn: 'root' })
export class TimeseriesService {
  constructor(private ihApi: IhApiService) {}

  async fetchAndBuildPayload(
    asset: Asset,
    selectedByAspect: SelectedAspectVariables[],
    from: string,
    to: string,
    mode: 'historic' | 'live'
  ): Promise<PlantSimPayload> {
    const plantSimVars: PlantSimVariable[] = [];
    let totalPoints = 0;

    for (const { aspectName, variables } of selectedByAspect) {
      if (variables.length === 0) continue;

      const varNames = variables.map((v) => v.name).join(',');
      const url = this.ihApi.url(
        `/api/iottimeseries/v4/timeseries/${asset.assetId}/${aspectName}` +
        `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&select=${varNames}&limit=2000`
      );

      const rows = await this.fetchWithRetry<TimeSeriesDataPoint[]>(url);

      for (const variable of variables) {
        const values = rows.map((row) => ({
          time: row['_time'] as string ?? row['time'] as string ?? '',
          value: row[variable.name] as number | string | boolean | null
        })).filter((v) => v.time !== '');

        totalPoints += values.length;

        plantSimVars.push({
          aspect: aspectName,
          name: variable.name,
          unit: variable.unit,
          dataType: variable.dataType,
          values
        });
      }
    }

    if (plantSimVars.length > 0 && totalPoints === 0) {
      throw new Error('NO_DATA: No data available for selected time range.');
    }

    return {
      assetId: asset.assetId,
      assetName: asset.name,
      mode,
      from,
      to,
      variables: plantSimVars
    };
  }

  countDataPoints(payload: PlantSimPayload): number {
    return payload.variables.reduce((sum, v) => sum + v.values.length, 0);
  }

  private async fetchWithRetry<T>(url: string, attempt = 1): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { credentials: 'include' });
    } catch (err) {
      if (attempt < 3) {
        await this.delay(Math.pow(2, attempt) * 1000);
        return this.fetchWithRetry<T>(url, attempt + 1);
      }
      throw err;
    }

    if (response.status === 401) {
      throw new Error('IH_401: Session expired. Please refresh.');
    }
    if (response.status === 403) {
      throw new Error('IH_403: Insufficient permissions. Check asset scopes.');
    }
    if (response.status === 404) {
      throw new Error('IH_404: Asset or aspect not found.');
    }
    if (response.status === 429) {
      await this.delay(30000);
      return this.fetchWithRetry<T>(url, attempt);
    }
    if (response.status >= 500 && attempt < 3) {
      await this.delay(Math.pow(2, attempt) * 1000);
      return this.fetchWithRetry<T>(url, attempt + 1);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
