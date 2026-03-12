import { Injectable } from '@angular/core';
import { PlantSimPayload } from '../models/timeseries.model';
import { ConfigService } from './config.service';
import { MqttService } from './mqtt.service';
import { LoggerService } from './logger.service';
import { TimeseriesService } from './timeseries.service';

@Injectable({ providedIn: 'root' })
export class DeliveryService {
  constructor(
    private configService: ConfigService,
    private mqttService: MqttService,
    private loggerService: LoggerService,
    private timeseriesService: TimeseriesService
  ) {}

  async sendToPlantSimulation(payload: PlantSimPayload): Promise<void> {
    const config = this.configService.getConfig();

    if (config.deploymentMode === 'cloud') {
      await this.sendViaCloud(payload);
    } else {
      await this.sendViaOnPrem(payload);
    }
  }

  // ── CLOUD MODE: Plant Simulation X (SaaS) ──────────────────────────────
  private async sendViaCloud(payload: PlantSimPayload): Promise<void> {
    const config = this.configService.getConfig();

    if (config.cloudMethod === 'mqtt') {
      // Ensure MQTT is connected
      if (!this.mqttService.isConnected) {
        await this.mqttService.connect(
          config.mqttBrokerUrl,
          config.mqttUsername,
          config.mqttPassword
        );
      }
      const topic = `ih/plantsim/${payload.assetId}/data`;
      await this.mqttService.publish(topic, JSON.stringify(payload));

      const dataPointCount = this.timeseriesService.countDataPoints(payload);
      this.loggerService.log({
        timestamp: new Date().toISOString(),
        assetName: payload.assetName,
        variableCount: payload.variables.length,
        dataPointCount,
        mode: payload.mode,
        status: 200,
        attempt: 1
      });
    } else {
      // HTTP POST to Plant Sim X REST endpoint
      await this.httpPostWithRetry(
        config.plantSimXEndpoint,
        payload,
        config.apiKey
      );
    }
  }

  // ── ON-PREM MODE: Plant Simulation Classic (Desktop) ───────────────────
  private async sendViaOnPrem(payload: PlantSimPayload): Promise<void> {
    const config = this.configService.getConfig();
    await this.httpPostWithRetry(
      `${config.middlewareUrl}/ingest`,
      payload,
      config.middlewareApiKey
    );
  }

  // ── Retry Logic (3 attempts, exponential backoff) ───────────────────────
  private async httpPostWithRetry(
    url: string,
    payload: PlantSimPayload,
    apiKey: string,
    attempt = 1
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok && response.status >= 500 && attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
        this.loggerService.logError(
          new Error(`HTTP ${response.status}: ${response.statusText}`),
          url,
          attempt
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.httpPostWithRetry(url, payload, apiKey, attempt + 1);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const dataPointCount = this.timeseriesService.countDataPoints(payload);
      this.loggerService.log({
        timestamp: new Date().toISOString(),
        assetName: payload.assetName,
        variableCount: payload.variables.length,
        dataPointCount,
        mode: payload.mode,
        status: response.status,
        attempt
      });

    } catch (error) {
      this.loggerService.logError(error, url, attempt);
      throw error;
    }
  }

  // ── Test connection (used in Setup screen) ──────────────────────────────
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = this.configService.getConfig();

    try {
      if (config.deploymentMode === 'cloud' && config.cloudMethod === 'mqtt') {
        await this.mqttService.connect(
          config.mqttBrokerUrl,
          config.mqttUsername,
          config.mqttPassword
        );
        return { success: true, message: 'Connected to MQTT broker successfully.' };
      } else {
        const endpoint = config.deploymentMode === 'cloud'
          ? config.plantSimXEndpoint
          : `${config.middlewareUrl}/ingest`;
        const apiKey = config.deploymentMode === 'cloud'
          ? config.apiKey
          : config.middlewareApiKey;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({ type: 'ping' })
        });

        if (response.ok || response.status === 400) {
          // 400 means endpoint exists but rejected ping payload — that's fine
          return { success: true, message: `Endpoint reachable (HTTP ${response.status}).` };
        }
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed.'
      };
    }
  }
}
