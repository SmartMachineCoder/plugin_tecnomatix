import {
  Component, OnInit, OnChanges, Input, Output, EventEmitter,
  SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Aspect } from '../../models/aspect.model';
import { Variable } from '../../models/variable.model';
import { AssetService } from '../../services/asset.service';

export interface SelectedVariablesByAspect {
  aspectName: string;
  variables: Variable[];
}

@Component({
  selector: 'app-variable-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './variable-selector.component.html',
  styleUrls: ['./variable-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VariableSelectorComponent implements OnInit, OnChanges {
  @Input() assetId: string | null = null;
  @Input() assetName: string = '';
  @Output() selectionChanged = new EventEmitter<SelectedVariablesByAspect[]>();

  aspects: Aspect[] = [];
  isLoading = false;
  errorMessage: string | null = null;

  constructor(
    private assetService: AssetService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.assetId) this.loadAspects();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assetId'] && !changes['assetId'].firstChange) {
      this.aspects = [];
      if (this.assetId) this.loadAspects();
    }
  }

  async loadAspects(): Promise<void> {
    if (!this.assetId) return;
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    try {
      this.aspects = await this.assetService.loadAspects(this.assetId);
      // Load last values for all variables in parallel
      await this.loadAllLastValues();
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : 'Failed to load aspects.';
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async loadAllLastValues(): Promise<void> {
    if (!this.assetId) return;
    const promises: Promise<void>[] = [];

    for (const aspect of this.aspects) {
      for (const variable of aspect.variables) {
        promises.push(
          this.assetService
            .loadLastValue(this.assetId, aspect.name, variable.name)
            .then((result) => {
              if (result) {
                variable.lastValue = result.value ?? undefined;
                variable.lastTimestamp = result.timestamp;
              }
            })
        );
      }
    }

    await Promise.allSettled(promises);
    this.cdr.markForCheck();
  }

  toggleAspect(aspect: Aspect): void {
    aspect.isExpanded = !aspect.isExpanded;
    this.cdr.markForCheck();
  }

  toggleSelectAll(aspect: Aspect): void {
    const allSelected = this.allSelectedInAspect(aspect);
    for (const v of aspect.variables) {
      v.selected = !allSelected;
    }
    this.emitSelection();
    this.cdr.markForCheck();
  }

  toggleVariable(variable: Variable): void {
    variable.selected = !variable.selected;
    this.emitSelection();
    this.cdr.markForCheck();
  }

  allSelectedInAspect(aspect: Aspect): boolean {
    return aspect.variables.length > 0 && aspect.variables.every((v) => v.selected);
  }

  someSelectedInAspect(aspect: Aspect): boolean {
    return aspect.variables.some((v) => v.selected) && !this.allSelectedInAspect(aspect);
  }

  get totalSelected(): number {
    return this.aspects.reduce(
      (sum, a) => sum + a.variables.filter((v) => v.selected).length,
      0
    );
  }

  trackByAspect(_index: number, aspect: Aspect): string {
    return aspect.name;
  }

  trackByVariable(_index: number, variable: Variable): string {
    return variable.name;
  }

  formatLastValue(v: Variable): string {
    if (v.lastValue === undefined || v.lastValue === null) return '—';
    return String(v.lastValue);
  }

  formatTimestamp(ts: string | undefined): string {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return ts;
    }
  }

  private emitSelection(): void {
    const result: SelectedVariablesByAspect[] = this.aspects
      .map((a) => ({
        aspectName: a.name,
        variables: a.variables.filter((v) => v.selected)
      }))
      .filter((entry) => entry.variables.length > 0);

    this.selectionChanged.emit(result);
  }
}
