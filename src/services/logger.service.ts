import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type LogLevel = 'success' | 'error' | 'info' | 'warning';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  assetName?: string;
  variableCount?: number;
  dataPointCount?: number;
  mode?: 'historic' | 'live';
  status?: number;
  attempt?: number;
  message: string;
}

const MAX_LOG_ENTRIES = 200;

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private entries$ = new BehaviorSubject<LogEntry[]>([]);

  get logs$(): Observable<LogEntry[]> {
    return this.entries$.asObservable();
  }

  log(entry: {
    timestamp: string;
    assetName: string;
    variableCount: number;
    dataPointCount?: number;
    mode: 'historic' | 'live';
    status: number;
    attempt: number;
  }): void {
    const msg = `SENT  ${entry.assetName} | ${entry.variableCount} vars` +
      (entry.dataPointCount != null ? ` | ${entry.dataPointCount} pts` : '') +
      ` | ${entry.mode} | HTTP ${entry.status}` +
      (entry.attempt > 1 ? ` (retry ${entry.attempt})` : '');

    this.addEntry({
      timestamp: entry.timestamp,
      level: 'success',
      assetName: entry.assetName,
      variableCount: entry.variableCount,
      dataPointCount: entry.dataPointCount,
      mode: entry.mode,
      status: entry.status,
      attempt: entry.attempt,
      message: msg
    });
  }

  logError(error: unknown, context: string, attempt: number): void {
    const msg = `FAIL  ${context} | retry ${attempt}/3 | ${error instanceof Error ? error.message : String(error)}`;
    this.addEntry({
      timestamp: new Date().toISOString(),
      level: 'error',
      attempt,
      message: msg
    });
  }

  logInfo(message: string): void {
    this.addEntry({ timestamp: new Date().toISOString(), level: 'info', message });
  }

  logWarning(message: string): void {
    this.addEntry({ timestamp: new Date().toISOString(), level: 'warning', message });
  }

  clearLogs(): void {
    this.entries$.next([]);
  }

  private addEntry(entry: LogEntry): void {
    const current = this.entries$.getValue();
    const updated = [entry, ...current].slice(0, MAX_LOG_ENTRIES);
    this.entries$.next(updated);
  }
}
