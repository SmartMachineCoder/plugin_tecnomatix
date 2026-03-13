import {
  Component, Input, Output, EventEmitter, OnChanges, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef, AfterViewChecked, ElementRef, ViewChildren, QueryList
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Asset } from '../../models/asset.model';
import { Variable } from '../../models/variable.model';
import { TimeRangeSelection } from '../time-range/time-range.component';
import { TimeseriesService } from '../../services/timeseries.service';

export interface BasketEntry {
  asset: Asset;
  aspectName: string;
  variable: Variable;
  /** sparkline data fetched after time range is chosen */
  sparkValues?: number[];
  sparkLoading?: boolean;
}

@Component({
  selector: 'app-selection-basket',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './selection-basket.component.html',
  styleUrls: ['./selection-basket.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectionBasketComponent implements OnChanges, AfterViewChecked {
  @Input() entries: BasketEntry[] = [];
  @Input() lastRange: TimeRangeSelection | null = null;
  @Input() isLive = false;

  @Output() removeEntry = new EventEmitter<BasketEntry>();
  @Output() clearAll    = new EventEmitter<void>();
  @Output() sendAll     = new EventEmitter<void>();
  @Output() startLive   = new EventEmitter<void>();
  @Output() stopLive    = new EventEmitter<void>();

  @ViewChildren('sparkCanvas') sparkCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  collapsedAssets = new Set<string>();
  private sparksPending = false;

  constructor(
    private timeseriesService: TimeseriesService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lastRange'] && this.lastRange && this.entries.length > 0) {
      this.fetchAllSparks();
    }
    if (changes['entries']) {
      this.sparksPending = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.sparksPending) {
      this.sparksPending = false;
      this.drawAllSparks();
    }
  }

  private async fetchAllSparks(): Promise<void> {
    if (!this.lastRange) return;
    const range = this.lastRange;

    for (const entry of this.entries) {
      if (entry.variable.dataType === 'STRING' || entry.variable.dataType === 'BOOLEAN') continue;
      entry.sparkLoading = true;
      this.cdr.markForCheck();

      try {
        const payload = await this.timeseriesService.fetchAndBuildPayload(
          entry.asset,
          [{ aspectName: entry.aspectName, variables: [entry.variable] }],
          range.from, range.to, range.mode
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
      this.sparksPending = true;
    }
  }

  private drawAllSparks(): void {
    const canvases = this.sparkCanvases.toArray();
    this.entries.forEach((entry, i) => {
      const canvas = canvases[i]?.nativeElement;
      if (!canvas || !entry.sparkValues?.length) return;
      this.drawSparkline(canvas, entry.sparkValues);
    });
  }

  private drawSparkline(canvas: HTMLCanvasElement, values: number[]): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pad = 2;
    const points = values.map((v, i) => ({
      x: pad + (i / (values.length - 1 || 1)) * (W - pad * 2),
      y: H - pad - ((v - min) / range) * (H - pad * 2)
    }));

    // Fill area
    ctx.beginPath();
    ctx.moveTo(points[0].x, H);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,120,120,0.10)';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#007878';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  onDragStart(event: DragEvent, entry: BasketEntry): void {
    const key = `${entry.asset.assetId}/${entry.aspectName}/${entry.variable.name}`;
    event.dataTransfer?.setData('text/plain', key);
    event.dataTransfer!.effectAllowed = 'copy';
  }

  toggleAssetCollapse(assetId: string): void {
    if (this.collapsedAssets.has(assetId)) {
      this.collapsedAssets.delete(assetId);
    } else {
      this.collapsedAssets.add(assetId);
    }
    this.cdr.markForCheck();
  }

  isAssetCollapsed(assetId: string): boolean {
    return this.collapsedAssets.has(assetId);
  }

  trackEntry(_: number, e: BasketEntry): string {
    return `${e.asset.assetId}/${e.aspectName}/${e.variable.name}`;
  }

  get groupedByAsset(): { asset: Asset; entries: BasketEntry[] }[] {
    const map = new Map<string, { asset: Asset; entries: BasketEntry[] }>();
    for (const e of this.entries) {
      if (!map.has(e.asset.assetId)) {
        map.set(e.asset.assetId, { asset: e.asset, entries: [] });
      }
      map.get(e.asset.assetId)!.entries.push(e);
    }
    return Array.from(map.values());
  }
}
