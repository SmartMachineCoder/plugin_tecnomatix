import {
  Component, Input, OnChanges, SimpleChanges, AfterViewInit,
  ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BasketEntry } from '../selection-basket/selection-basket.component';

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
  @Input() entries: BasketEntry[] = [];
  @Input() lastRangeLabel = '';

  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private viewReady = false;

  constructor(private cdr: ChangeDetectorRef, private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.draw();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.viewReady) {
      this.draw();
    }
  }

  get numericEntries(): BasketEntry[] {
    return this.entries.filter(e =>
      e.sparkValues?.length &&
      e.variable.dataType !== 'STRING' &&
      e.variable.dataType !== 'BOOLEAN'
    );
  }

  get legendItems(): { label: string; color: string }[] {
    return this.numericEntries.map((e, i) => ({
      label: `${e.asset.name} / ${e.variable.name}${e.variable.unit ? ' (' + e.variable.unit + ')' : ''}`,
      color: SERIES_COLORS[i % SERIES_COLORS.length]
    }));
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
      // No data placeholder
      ctx.fillStyle = '#9099aa';
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        this.entries.length === 0
          ? 'Select variables to see chart'
          : 'No numeric data — select a time range first',
        W / 2, H / 2
      );
      return;
    }

    const padL = 48, padR = 12, padT = 12, padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // Compute global Y range across all series
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

      // Y axis labels
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
      const hex = color;
      ctx.fillStyle = hex + '18';
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
