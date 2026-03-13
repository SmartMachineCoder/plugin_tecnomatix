import {
  Component, OnInit, OnDestroy, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, interval } from 'rxjs';
import { oiProxy, DateRange } from '@mindsphere/oi-plugin-sdk';

export type DurationPreset = '1h' | '4h' | '8h' | '24h' | 'custom';
export type SendMode = 'historic' | 'live';

export interface TimeRangeSelection {
  mode: SendMode;
  from: string;
  to: string;
}

const LIVE_INTERVAL_MS = 120_000; // 2 minutes

@Component({
  selector: 'app-time-range',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './time-range.component.html',
  styleUrls: ['./time-range.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimeRangeComponent implements OnInit, OnDestroy {
  @Output() rangeReady = new EventEmitter<TimeRangeSelection>();
  @Output() liveStopped = new EventEmitter<void>();

  selectedMode: SendMode = 'historic';
  selectedDuration: DurationPreset = '1h';
  /** UTC ISO strings used for querying */
  customFrom: string = '';
  customTo: string = '';
  /** Local datetime-local values bound to the inputs (YYYY-MM-DDTHH:mm) */
  customFromLocal: string = '';
  customToLocal: string = '';
  isLive = false;
  lastSentTime: Date | null = null;
  nextSendCountdown = 0; // seconds remaining

  private liveTimerSub: Subscription | null = null;
  private countdownSub: Subscription | null = null;
  private sdkDateRangeSub: { unsubscribe(): void } | null = null;
  private sdkDateRange: { from: string; to: string } | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Listen for SDK date range picker changes (direct subscribe — avoids RxJS version conflict)
    this.sdkDateRangeSub = oiProxy.dateRange.subscribe((range: DateRange) => {
      if (range) {
        this.sdkDateRange = {
          from: range.start instanceof Date ? range.start.toISOString() : String(range.start),
          to: range.end instanceof Date ? range.end.toISOString() : String(range.end)
        };
        if (this.selectedDuration === 'custom') {
          this.customFrom = this.sdkDateRange.from;
          this.customTo = this.sdkDateRange.to;
          this.customFromLocal = this.isoToLocalInput(this.sdkDateRange.from);
          this.customToLocal = this.isoToLocalInput(this.sdkDateRange.to);
          this.cdr.markForCheck();
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.stopLiveMode();
    try { this.sdkDateRangeSub?.unsubscribe(); } catch { /* ignore */ }
  }

  onModeChange(mode: SendMode): void {
    if (this.isLive) this.stopLiveMode();
    this.selectedMode = mode;
    this.cdr.markForCheck();
  }

  onDurationChange(duration: DurationPreset): void {
    this.selectedDuration = duration;
    if (duration === 'custom') {
      // Activate SDK date/time picker
      try { oiProxy.enableDateTimeRangePicker(); } catch { /* may not be available */ }
    }
    this.cdr.markForCheck();
  }

  sendHistoric(): void {
    const range = this.getHistoricRange();
    this.rangeReady.emit({ mode: 'historic', ...range });
  }

  startLiveMode(): void {
    this.isLive = true;
    this.nextSendCountdown = LIVE_INTERVAL_MS / 1000;

    // Send immediately
    this.emitLiveRange();

    // Schedule repeating sends
    this.liveTimerSub = interval(LIVE_INTERVAL_MS).subscribe(() => {
      this.emitLiveRange();
      this.nextSendCountdown = LIVE_INTERVAL_MS / 1000;
      this.cdr.markForCheck();
    });

    // Countdown display (tick every second)
    this.countdownSub = interval(1000).subscribe(() => {
      if (this.nextSendCountdown > 0) this.nextSendCountdown--;
      this.cdr.markForCheck();
    });

    this.cdr.markForCheck();
  }

  stopLiveMode(): void {
    this.isLive = false;
    this.liveTimerSub?.unsubscribe();
    this.liveTimerSub = null;
    this.countdownSub?.unsubscribe();
    this.countdownSub = null;
    this.liveStopped.emit();
    this.cdr.markForCheck();
  }

  /** Called when user changes the From datetime-local input */
  onCustomFromChange(localValue: string): void {
    this.customFromLocal = localValue;
    this.customFrom = localValue ? this.localInputToUtcIso(localValue) : '';
    this.cdr.markForCheck();
  }

  /** Called when user changes the To datetime-local input */
  onCustomToChange(localValue: string): void {
    this.customToLocal = localValue;
    this.customTo = localValue ? this.localInputToUtcIso(localValue) : '';
    this.cdr.markForCheck();
  }

  /** Convert datetime-local string (YYYY-MM-DDTHH:mm) to UTC ISO string */
  private localInputToUtcIso(localValue: string): string {
    // datetime-local gives local time without timezone — treat as local and convert to UTC
    return new Date(localValue).toISOString();
  }

  /** Convert UTC ISO to datetime-local input value (local time, YYYY-MM-DDTHH:mm) */
  private isoToLocalInput(isoString: string): string {
    const d = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  getHistoricRange(): { from: string; to: string } {
    if (this.selectedDuration === 'custom') {
      return {
        from: this.customFrom || new Date(Date.now() - 3_600_000).toISOString(),
        to: this.customTo || new Date().toISOString()
      };
    }
    const hoursMap: Record<string, number> = { '1h': 1, '4h': 4, '8h': 8, '24h': 24 };
    const hours = hoursMap[this.selectedDuration] ?? 1;
    const to = new Date();
    const from = new Date(to.getTime() - hours * 3_600_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  get countdownDisplay(): string {
    const m = Math.floor(this.nextSendCountdown / 60);
    const s = this.nextSendCountdown % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  get lastSentDisplay(): string {
    if (!this.lastSentTime) return '';
    return this.lastSentTime.toLocaleTimeString();
  }

  private emitLiveRange(): void {
    const to = new Date();
    const from = new Date(to.getTime() - LIVE_INTERVAL_MS);
    this.lastSentTime = new Date();
    this.rangeReady.emit({
      mode: 'live',
      from: from.toISOString(),
      to: to.toISOString()
    });
  }
}
