import { Injectable } from '@angular/core';
import mqtt, { MqttClient } from 'mqtt';
import { BehaviorSubject, Observable } from 'rxjs';

export type MqttConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

@Injectable({ providedIn: 'root' })
export class MqttService {
  private client: MqttClient | null = null;
  private connectionState$ = new BehaviorSubject<MqttConnectionState>('disconnected');
  private lastError: string | null = null;

  get state$(): Observable<MqttConnectionState> {
    return this.connectionState$.asObservable();
  }

  get isConnected(): boolean {
    return this.connectionState$.getValue() === 'connected';
  }

  get error(): string | null {
    return this.lastError;
  }

  connect(brokerUrl: string, username: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client) {
        this.client.end(true);
        this.client = null;
      }

      this.connectionState$.next('connecting');
      this.lastError = null;

      // brokerUrl format: wss://broker.hivemq.com:8884/mqtt
      this.client = mqtt.connect(brokerUrl, {
        username,
        password,
        clientId: `ih-plugin-tecnomatix-${Date.now()}`,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000
      });

      const onConnect = () => {
        this.connectionState$.next('connected');
        this.lastError = null;
        cleanup();
        resolve();
      };

      const onError = (err: Error) => {
        this.connectionState$.next('error');
        this.lastError = err.message;
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        this.client?.removeListener('connect', onConnect);
        this.client?.removeListener('error', onError);
      };

      this.client.once('connect', onConnect);
      this.client.once('error', onError);

      this.client.on('reconnect', () => {
        this.connectionState$.next('connecting');
      });

      this.client.on('offline', () => {
        this.connectionState$.next('disconnected');
      });
    });
  }

  async publish(topic: string, message: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      throw new Error('MQTT client not connected');
    }
    return new Promise((resolve, reject) => {
      this.client!.publish(topic, message, { qos: 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    this.connectionState$.next('disconnected');
  }
}
