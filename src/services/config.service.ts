import { Injectable } from '@angular/core';
import { DeliveryConfig } from '../models/delivery-config.model';

const CONFIG_KEY = 'plugin_tecnomatix_config';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private config: DeliveryConfig | null = null;

  getConfig(): DeliveryConfig {
    if (!this.config) {
      const stored = this.readFromStorage(CONFIG_KEY);
      this.config = stored ? (JSON.parse(stored) as DeliveryConfig) : this.getDefaultConfig();
    }
    return this.config;
  }

  saveConfig(config: DeliveryConfig): void {
    this.config = config;
    const serialized = JSON.stringify(config);
    try {
      localStorage.setItem(CONFIG_KEY, serialized);
    } catch {
      try {
        sessionStorage.setItem(CONFIG_KEY, serialized);
      } catch {
        // In-memory only (already stored in this.config)
      }
    }
  }

  isConfigured(): boolean {
    const config = this.getConfig();
    if (config.deploymentMode === 'cloud') {
      return config.cloudMethod === 'mqtt'
        ? !!config.mqttBrokerUrl
        : !!config.plantSimXEndpoint;
    }
    return !!config.middlewareUrl;
  }

  resetConfig(): void {
    this.config = null;
    try { localStorage.removeItem(CONFIG_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(CONFIG_KEY); } catch { /* ignore */ }
  }

  private readFromStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    }
  }

  private getDefaultConfig(): DeliveryConfig {
    return {
      deploymentMode: 'cloud',
      cloudMethod: 'mqtt',
      mqttBrokerUrl: '',
      mqttTopic: 'ih/plantsim/data',
      mqttUsername: '',
      mqttPassword: '',
      plantSimXEndpoint: '',
      apiKey: '',
      middlewareUrl: '',
      middlewareApiKey: '',
      plantSimPort: 30001
    };
  }
}
