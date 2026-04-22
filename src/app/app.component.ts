import {
  Component, OnInit, OnDestroy, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { oiProxy, DateRange } from '@mindsphere/oi-plugin-sdk';
import { Subscription, interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Asset } from '../models/asset.model';
import { ConfigService } from '../services/config.service';
import { AssetService } from '../services/asset.service';

import { SetupComponent } from '../components/setup/setup.component';
import { VariableSelectorComponent, SelectedVariablesByAspect } from '../components/variable-selector/variable-selector.component';
import { SendPanelComponent } from '../components/send-panel/send-panel.component';
import { SelectionBasketComponent, BasketEntry } from '../components/selection-basket/selection-basket.component';
import { TimeseriesChartComponent } from '../components/timeseries-chart/timeseries-chart.component';
import { TimeRangeSelection } from '../components/time-range/time-range.component';
import { TimeseriesService } from '../services/timeseries.service';
import { ExportService } from '../services/export.service';

export interface Toast {
  id: number;
  level: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const LIVE_INTERVAL_MS = 120_000; // 2 minutes

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SetupComponent,
    VariableSelectorComponent,
    SendPanelComponent,
    SelectionBasketComponent,
    TimeseriesChartComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild(SendPanelComponent) sendPanel?: SendPanelComponent;

  isSetupDone = false;
  isSettingsOpen = false;
  activeAssetId: string | null = null;
  selectedAsset: Asset | null = null;
  selectedVariables: SelectedVariablesByAspect[] = [];
  basketEntries: BasketEntry[] = [];
  lastRange: TimeRangeSelection | null = null;
  lastRangeLabel = '';
  toasts: Toast[] = [];
  isLive = false;
  liveCountdown = 0; // seconds remaining

  private toastCounter = 0;
  private liveTimerSub: Subscription | null = null;
  private countdownSub: Subscription | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private configService: ConfigService,
    private assetService: AssetService,
    private timeseriesService: TimeseriesService,
    private exportService: ExportService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.isSetupDone = this.configService.isConfigured();

    // Track the selected asset from IH Monitor
    oiProxy.assetId.pipe(takeUntil(this.destroy$)).subscribe((assetId: string) => {
      this.onAssetChanged(assetId);
    });

    // Use the Monitor's date range picker as the sole time range source
    oiProxy.dateRange.pipe(takeUntil(this.destroy$)).subscribe((range: DateRange) => {
      if (range) {
        const from = range.start instanceof Date ? range.start.toISOString() : String(range.start);
        const to = range.end instanceof Date ? range.end.toISOString() : String(range.end);
        this.lastRange = { mode: 'historic', from, to };
        this.lastRangeLabel = `${new Date(from).toLocaleString()} → ${new Date(to).toLocaleString()}`;
        this.cdr.markForCheck();
      }
    });

    // Stop live mode when plugin becomes inactive
    oiProxy.active.pipe(takeUntil(this.destroy$)).subscribe((isActive: boolean) => {
      if (!isActive && this.isLive) {
        this.stopLive();
        this.showToast('info', 'Live mode stopped — plugin tab became inactive.');
      }
    });
  }

  ngOnDestroy(): void {
    this.stopLive();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSetupComplete(): void {
    this.isSetupDone = true;
    this.showToast('success', 'Configuration saved successfully.');
    this.cdr.markForCheck();
  }

  openSettings(): void { this.isSettingsOpen = true; this.cdr.markForCheck(); }
  closeSettings(): void { this.isSettingsOpen = false; this.cdr.markForCheck(); }

  onSettingsSaved(): void {
    this.closeSettings();
    this.showToast('success', 'Settings updated.');
  }

  resetConfig(): void {
    this.configService.resetConfig();
    this.isSetupDone = false;
    this.isSettingsOpen = false;
    this.cdr.markForCheck();
  }

  private async onAssetChanged(assetId: string): Promise<void> {
    if (!assetId || assetId === this.activeAssetId) return;
    this.activeAssetId = assetId;
    this.selectedVariables = [];
    this.selectedAsset = null;
    this.cdr.markForCheck();
    try {
      const assets = await this.assetService.loadAllAssets();
      this.selectedAsset = assets.find((a) => a.assetId === assetId) ?? null;
    } catch { /* tree component shows errors */ }
    this.cdr.markForCheck();
  }

  onVariableSelectionChanged(selection: SelectedVariablesByAspect[]): void {
    this.selectedVariables = selection;
    if (this.selectedAsset) {
      const asset = this.selectedAsset;
      this.basketEntries = this.basketEntries.filter(e => {
        if (e.asset.assetId !== asset.assetId) return true;
        const aspect = selection.find(s => s.aspectName === e.aspectName);
        return aspect?.variables.some(v => v.name === e.variable.name) ?? false;
      });
      for (const aspect of selection) {
        for (const variable of aspect.variables) {
          const exists = this.basketEntries.some(
            e => e.asset.assetId === asset.assetId && e.aspectName === aspect.aspectName && e.variable.name === variable.name
          );
          if (!exists) {
            this.basketEntries = [...this.basketEntries, { asset, aspectName: aspect.aspectName, variable }];
          }
        }
      }
    }
    this.cdr.markForCheck();
  }

  onBasketRemove(entry: BasketEntry): void {
    this.basketEntries = this.basketEntries.filter(
      e => !(e.asset.assetId === entry.asset.assetId && e.aspectName === entry.aspectName && e.variable.name === entry.variable.name)
    );
    this.cdr.markForCheck();
  }

  onBasketClear(): void {
    this.basketEntries = [];
    this.cdr.markForCheck();
  }

  async onBasketExport(format: 'csv' | 'xml' | 'excel'): Promise<void> {
    if (!this.lastRange) {
      this.showToast('warning', 'Please select a time range in the Monitor date picker first.');
      return;
    }
    if (this.basketEntries.length === 0) {
      this.showToast('warning', 'Please add variables to the basket before exporting.');
      return;
    }

    this.showToast('info', `Fetching data for ${format.toUpperCase()} export...`);
    try {
      const assetMap = new Map<string, { asset: Asset; byAspect: Map<string, SelectedVariablesByAspect> }>();
      for (const entry of this.basketEntries) {
        if (!assetMap.has(entry.asset.assetId)) {
          assetMap.set(entry.asset.assetId, { asset: entry.asset, byAspect: new Map() });
        }
        const group = assetMap.get(entry.asset.assetId)!;
        if (!group.byAspect.has(entry.aspectName)) {
          group.byAspect.set(entry.aspectName, { aspectName: entry.aspectName, variables: [] });
        }
        group.byAspect.get(entry.aspectName)!.variables.push(entry.variable);
      }

      const payloads = [];
      for (const { asset, byAspect } of assetMap.values()) {
        const payload = await this.timeseriesService.fetchAndBuildPayload(
          asset, Array.from(byAspect.values()), this.lastRange.from, this.lastRange.to, this.lastRange.mode
        );
        payloads.push(payload);
      }

      await this.exportService.exportData(format, payloads, this.lastRangeLabel || 'export');
      this.showToast('success', `Exported to ${format.toUpperCase()} successfully.`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // User cancelled the save dialog, ignore.
      }
      this.handleDeliveryError(err instanceof Error ? err.message : 'Export failed.');
    }
  }

  /** Send to Plant Sim using the Monitor's current time range */
  onBasketSendAll(): void {
    if (!this.lastRange) {
      this.showToast('warning', 'Please select a time range in the Monitor date picker first.');
      return;
    }
    if (this.basketEntries.length === 0) {
      this.showToast('warning', 'Please add variables to the basket before sending.');
      return;
    }
    this.sendPanel?.executeSend(this.lastRange).catch((err: unknown) => {
      this.handleDeliveryError(err instanceof Error ? err.message : 'Send failed.');
    });
  }

  onStartLive(): void {
    this.isLive = true;
    this.liveCountdown = LIVE_INTERVAL_MS / 1000;
    this.executeLiveSend();

    this.liveTimerSub = interval(LIVE_INTERVAL_MS).subscribe(() => {
      this.executeLiveSend();
      this.liveCountdown = LIVE_INTERVAL_MS / 1000;
      this.cdr.markForCheck();
    });

    this.countdownSub = interval(1000).subscribe(() => {
      if (this.liveCountdown > 0) this.liveCountdown--;
      this.cdr.markForCheck();
    });

    this.cdr.markForCheck();
  }

  onStopLive(): void {
    this.stopLive();
  }

  private stopLive(): void {
    this.isLive = false;
    this.liveTimerSub?.unsubscribe(); this.liveTimerSub = null;
    this.countdownSub?.unsubscribe(); this.countdownSub = null;
    this.cdr.markForCheck();
  }

  private executeLiveSend(): void {
    const to = new Date();
    const from = new Date(to.getTime() - LIVE_INTERVAL_MS);
    const liveRange: TimeRangeSelection = { mode: 'live', from: from.toISOString(), to: to.toISOString() };
    this.lastRange = liveRange;
    this.lastRangeLabel = 'Live';
    this.sendPanel?.executeSend(liveRange).catch((err: unknown) => {
      this.handleDeliveryError(err instanceof Error ? err.message : 'Send failed.');
    });
    this.cdr.markForCheck();
  }

  get liveCountdownDisplay(): string {
    const m = Math.floor(this.liveCountdown / 60);
    const s = this.liveCountdown % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  toggleLog(): void { this.sendPanel?.toggleLog(); }

  showToast(level: Toast['level'], message: string, durationMs = 5000): void {
    const id = ++this.toastCounter;
    this.toasts = [...this.toasts, { id, level, message }];
    this.cdr.markForCheck();
    setTimeout(() => this.dismissToast(id), durationMs);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.cdr.markForCheck();
  }

  private handleDeliveryError(message: string): void {
    if (message.includes('IH_401')) this.showToast('error', 'Session expired. Please refresh the page.');
    else if (message.includes('IH_403')) this.showToast('error', 'Insufficient permissions. Check asset scopes.');
    else if (message.includes('IH_404')) this.showToast('error', 'Asset or aspect not found.');
    else if (message.includes('NO_DATA')) this.showToast('warning', 'No data available for the selected time range.');
    else if (message.includes('MQTT')) this.showToast('error', 'MQTT broker unreachable. Check broker URL and credentials.');
    else if (message.toLowerCase().includes('cannot reach') || message.toLowerCase().includes('network')) this.showToast('error', 'Cannot reach Plant Simulation. Check connection settings.');
    else this.showToast('error', message);
  }
}
