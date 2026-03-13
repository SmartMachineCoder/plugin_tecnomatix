import {
  Component, Input, OnChanges, SimpleChanges, AfterViewInit,
  ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BasketEntry } from '../selection-basket/selection-basket.component';
import { TimeseriesService } from '../../services/timeseries.service';
import { TimeRangeSelection } from '../time-range/time-range.component';

const SERIES_COLORS = [
  '#007878', '#1a5fa0', '#c0392b', '#8a3a8a', '#1a8045',
  '#b07000', '#2d7db3', '#e67e22', '#16a085', '#8e44ad'
];

@Component({
  selector: 'app-timeseries-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './timeseries-chart.component.html',
  styleUrls: ['./timeseries-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimeseriesChartComponent implements OnChanges, AfterViewInit {
  /** All basket entries (used to resolve drop keys) */
  @Input() entries: BasketEntry[] = [];
  @Input() lastRangeLabel = '';
  @Input() lastRange: TimeRangeSelection | null = null;

  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  /** Entries explicitly dropped into the chart */
  chartEntries: BasketEntry[] = [];
  isDragOver = false;

  private viewReady = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private timeseriesService: TimeseriesService
  ) {}

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.draw();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lastRange'] && this.lastRange && this.chartEntries.length > 0) {
      // Re-fetch all chart entries when the time range is updated
      for (const entry of this.chartEntries) {
        this.fetchEntryData(entry);
      }
    }
    if (this.viewReady) {
      this.draw();
    }
  }

  // ── Drag-and-drop ────────────────────────────────────────────────

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    if (!this.isDragOver) {
      this.isDragOver = true;
      this.cdr.markForCheck();
    }
  }

  onDragLeave(): void {
    this.isDragOver = false;
    this.cdr.markForCheck();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;

    const key = event.dataTransfer?.getData('text/plain');
    if (!key) { this.cdr.markForCheck(); return; }

    const entry = this.entries.find(e =>
      `${e.asset.assetId}/${e.aspectName}/${e.variable.name}` === key
    );
    if (!entry) { this.cdr.markForCheck(); return; }

    // Avoid duplicates
    const alreadyAdded = this.chartEntries.some(e =>
      `${e.asset.assetId}/${e.aspectName}/${e.variable.name}` === key
    );
    if (!alreadyAdded) {
      // Clone without sparkValues so we always fetch fresh data for the chart
      const clone: BasketEntry = { ...entry, sparkValues: undefined, sparkLoading: false };
      this.chartEntries = [...this.chartEntries, clone];
      this.fetchEntryData(clone);
    }

    this.cdr.markForCheck();
    setTimeout(() => this.draw(), 0);
  }

  removeChartEntry(entry: BasketEntry): void {
    this.chartEntries = this.chartEntries.filter(e =>
      `${e.asset.assetId}/${e.aspectName}/${e.variable.name}` !==
      `${entry.asset.assetId}/${entry.aspectName}/${entry.variable.name}`
    );
    this.cdr.markForCheck();
    setTimeout(() => this.draw(), 0);
  }

  clearChart(): void {
    this.chartEntries = [];
    this.cdr.markForCheck();
    setTimeout(() => this.draw(), 0);
  }

  private async fetchEntryData(entry: BasketEntry): Promise<void> {
    if (entry.variable.dataType === 'STRING' || entry.variable.dataType === 'BOOLEAN') return;

    // Use current range or fall back to last 1 hour
    const range = this.lastRange ?? {
      mode: 'historic' as const,
      from: new Date(Date.now() - 3_600_000).toISOString(),
      to: new Date().toISOString()
    };

    entry.sparkLoading = true;
    this.cdr.markForCheck();

    try {
      const payload = await this.timeseriesService.fetchAndBuildPayload(
        entry.asset,
        [{ aspectName: entry.aspectName, variables: [entry.variable] }],
        range.from,
        range.to,
        range.mode
      );
      const varData = payload.variables.find(v => v.name === entry.variable.name);
      entry.sparkValues = varData?.values
        .map(v => Number(v.value))
        .filter(n => !isNaN(n)) ?? [];
    } catch {
      entry.sparkValues = [];
    }

    entry.sparkLoading = false;
    this.cdr.markForCheck();
    setTimeout(() => this.draw(), 0);
  }

  // ── Chart rendering ──────────────────────────────────────────────

  get numericEntries(): BasketEntry[] {
    return this.chartEntries.filter(e =>
      e.sparkValues?.length &&
      e.variable.dataType !== 'STRING' &&
      e.variable.dataType !== 'BOOLEAN'
    );
  }

  get legendItems(): { label: string; color: string; entry: BasketEntry }[] {
    return this.chartEntries.map((e, i) => ({
      label: `${e.asset.name} / ${e.variable.name}${e.variable.unit ? ' (' + e.variable.unit + ')' : ''}`,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      entry: e
    }));
  }

  get isLoading(): boolean {
    return this.chartEntries.some(e => e.sparkLoading);
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || canvas.offsetWidth || 400;
    const H = rect.height || canvas.offsetHeight || 200;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const series = this.numericEntries;
    if (series.length === 0) {
      ctx.fillStyle = '#9099aa';
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        this.chartEntries.length === 0
          ? 'Drag variables here from the Selection Basket'
          : 'No numeric data available for the selected range',
        W / 2, H / 2
      );
      return;
    }

    const padL = 48, padR = 12, padT = 12, padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let globalMin = Infinity, globalMax = -Infinity;
    for (const e of series) {
      for (const v of e.sparkValues!) {
        if (v < globalMin) globalMin = v;
        if (v > globalMax) globalMax = v;
      }
    }
    if (globalMin === globalMax) { globalMin -= 1; globalMax += 1; }
    const yRange = globalMax - globalMin;

    // Grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (i / gridLines) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      const val = globalMax - (i / gridLines) * yRange;
      ctx.fillStyle = '#9099aa';
      ctx.font = '10px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(this.formatVal(val), padL - 4, y + 3);
    }

    // Plot each series
    series.forEach((entry, si) => {
      const vals = entry.sparkValues!;
      const color = SERIES_COLORS[si % SERIES_COLORS.length];
      const n = vals.length;

      const pts = vals.map((v, i) => ({
        x: padL + (i / (n - 1 || 1)) * plotW,
        y: padT + (1 - (v - globalMin) / yRange) * plotH
      }));

      // Area fill
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padT + plotH);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, padT + plotH);
      ctx.closePath();
      ctx.fillStyle = color + '18';
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
    });

    // X axis border
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();
  }

  private formatVal(v: number): string {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
    if (Math.abs(v) < 10) return v.toFixed(2);
    return v.toFixed(1);
  }
}
