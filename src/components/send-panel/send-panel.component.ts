import {
  Component, Input, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Asset } from '../../models/asset.model';
import { PlantSimPayload } from '../../models/timeseries.model';
import { SelectedVariablesByAspect } from '../variable-selector/variable-selector.component';
import { TimeRangeSelection } from '../time-range/time-range.component';
import { TimeseriesService } from '../../services/timeseries.service';
import { DeliveryService } from '../../services/delivery.service';
import { LoggerService, LogEntry } from '../../services/logger.service';

export type SendStatus = 'idle' | 'fetching' | 'sending' | 'success' | 'error';

@Component({
  selector: 'app-send-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './send-panel.component.html',
  styleUrls: ['./send-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SendPanelComponent implements OnInit, OnDestroy {
  @Input() asset: Asset | null = null;
  @Input() selectedVariables: SelectedVariablesByAspect[] = [];
  @Input() isLive = false;

  sendStatus: SendStatus = 'idle';
  statusMessage = '';
  lastPayload: PlantSimPayload | null = null;
  isLogOpen = false;
  logs: LogEntry[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private timeseriesService: TimeseriesService,
    private deliveryService: DeliveryService,
    private loggerService: LoggerService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loggerService.logs$.pipe(takeUntil(this.destroy$)).subscribe((entries) => {
      this.logs = entries;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalSelectedVars(): number {
    return this.selectedVariables.reduce((sum, a) => sum + a.variables.length, 0);
  }

  get canSend(): boolean {
    return !!this.asset && this.totalSelectedVars > 0 &&
      this.sendStatus !== 'fetching' && this.sendStatus !== 'sending';
  }

  async executeSend(range: TimeRangeSelection): Promise<void> {
    if (!this.asset) return;

    this.sendStatus = 'fetching';
    this.statusMessage = 'Fetching data from Insights Hub...';
    this.cdr.markForCheck();

    try {
      const payload = await this.timeseriesService.fetchAndBuildPayload(
        this.asset,
        this.selectedVariables,
        range.from,
        range.to,
        range.mode
      );

      this.sendStatus = 'sending';
      this.statusMessage = 'Sending to Plant Simulation...';
      this.lastPayload = payload;
      this.cdr.markForCheck();

      await this.deliveryService.sendToPlantSimulation(payload);

      const pts = this.timeseriesService.countDataPoints(payload);
      this.sendStatus = 'success';
      this.statusMessage = `Sent ${payload.variables.length} variables, ${pts} data points`;
    } catch (err) {
      this.sendStatus = 'error';
      this.statusMessage = err instanceof Error ? err.message : 'Send failed.';
    }

    this.cdr.markForCheck();
  }

  toggleLog(): void {
    this.isLogOpen = !this.isLogOpen;
    this.cdr.markForCheck();
  }

  clearLog(): void {
    this.loggerService.clearLogs();
  }

  logLevelClass(level: string): string {
    return `log-level-${level}`;
  }

  formatLogTimestamp(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return ts;
    }
  }

  trackByLog(index: number, entry: LogEntry): string {
    return `${entry.timestamp}-${index}`;
  }
}
