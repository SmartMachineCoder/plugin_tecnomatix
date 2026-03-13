import {
  Component, OnInit, OnDestroy, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { oiProxy } from '@mindsphere/oi-plugin-sdk';

import { Asset } from '../models/asset.model';
import { ConfigService } from '../services/config.service';
import { AssetService } from '../services/asset.service';

import { SetupComponent } from '../components/setup/setup.component';
import { VariableSelectorComponent, SelectedVariablesByAspect } from '../components/variable-selector/variable-selector.component';
import { TimeRangeComponent, TimeRangeSelection } from '../components/time-range/time-range.component';
import { SendPanelComponent } from '../components/send-panel/send-panel.component';
import { SelectionBasketComponent, BasketEntry } from '../components/selection-basket/selection-basket.component';
import { TimeseriesChartComponent } from '../components/timeseries-chart/timeseries-chart.component';

export interface Toast {
  id: number;
  level: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    SetupComponent,
    VariableSelectorComponent,
    TimeRangeComponent,
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
  @ViewChild(TimeRangeComponent) timeRange?: TimeRangeComponent;

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

  private toastCounter = 0;
  private sdkSubs: { unsubscribe(): void }[] = [];

  constructor(
    private configService: ConfigService,
    private assetService: AssetService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.isSetupDone = this.configService.isConfigured();

    this.sdkSubs.push(
      oiProxy.assetId.subscribe((assetId: string) => {
        this.onAssetChanged(assetId);
      })
    );

    this.sdkSubs.push(
      oiProxy.active.subscribe((isActive: boolean) => {
        if (!isActive && this.isLive) {
          this.timeRange?.stopLiveMode();
          this.isLive = false;
          this.showToast('info', 'Live mode stopped — plugin tab became inactive.');
        }
      })
    );
  }

  ngOnDestroy(): void {
    for (const sub of this.sdkSubs) {
      try { sub.unsubscribe(); } catch { /* ignore */ }
    }
    this.sdkSubs = [];
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
    // Sync basket: add new selections, remove deselected ones for this asset
    if (this.selectedAsset) {
      const asset = this.selectedAsset;
      // Remove entries for this asset that are no longer selected
      this.basketEntries = this.basketEntries.filter(e => {
        if (e.asset.assetId !== asset.assetId) return true;
        const aspect = selection.find(s => s.aspectName === e.aspectName);
        return aspect?.variables.some(v => v.name === e.variable.name) ?? false;
      });
      // Add newly selected entries
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

  onRangeChanged(range: TimeRangeSelection): void {
    this.lastRange = range;
    this.lastRangeLabel = `${new Date(range.from).toLocaleString()} → ${new Date(range.to).toLocaleString()}`;
    this.cdr.markForCheck();
  }

  onRangeReady(range: TimeRangeSelection): void {
    this.lastRange = range;
    this.lastRangeLabel = range.mode === 'live' ? 'Live' :
      `${new Date(range.from).toLocaleString()} → ${new Date(range.to).toLocaleString()}`;
    if (this.basketEntries.length === 0) { this.showToast('warning', 'Please add variables to the basket before sending.'); return; }
    this.sendPanel?.executeSend(range).catch((err: unknown) => {
      this.handleDeliveryError(err instanceof Error ? err.message : 'Send failed.');
    });
  }

  onBasketSendAll(): void { this.timeRange?.sendHistoric(); }

  onSendHistoric(): void { this.timeRange?.sendHistoric(); }

  onStartLive(): void {
    this.isLive = true;
    this.timeRange?.startLiveMode();
    this.cdr.markForCheck();
  }

  onStopLive(): void {
    this.isLive = false;
    this.timeRange?.stopLiveMode();
    this.cdr.markForCheck();
  }

  onLiveStopped(): void { this.isLive = false; this.cdr.markForCheck(); }
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
