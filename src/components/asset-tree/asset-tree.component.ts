import {
  Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AssetTreeNode } from '../../models/asset.model';
import { AssetService } from '../../services/asset.service';
import { oiProxy } from '@mindsphere/oi-plugin-sdk';

@Component({
  selector: 'app-asset-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssetTreeComponent implements OnInit, OnDestroy {
  @Input() activeAssetId: string | null = null;
  @Output() assetSelected = new EventEmitter<string>();

  isLoading = true;
  errorMessage: string | null = null;
  treeRoots: AssetTreeNode[] = [];
  filteredRoots: AssetTreeNode[] = [];
  searchQuery = '';
  breadcrumb = '';

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private assetService: AssetService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadTree();

    // Debounce search input
    this.searchSubject.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((query) => {
      this.applyFilter(query);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadTree(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    try {
      const assets = await this.assetService.loadAllAssets();
      this.treeRoots = this.assetService.buildTree(assets);
      this.filteredRoots = this.treeRoots;
      this.updateBreadcrumb();
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : 'Failed to load assets.';
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  onSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery = query;
    this.searchSubject.next(query);
  }

  onNodeClick(node: AssetTreeNode): void {
    const assetId = node.asset.assetId;
    this.assetSelected.emit(assetId);
    oiProxy.setAssetId(assetId);
    this.breadcrumb = node.path.join(' > ');
    this.cdr.markForCheck();
  }

  toggleNode(node: AssetTreeNode): void {
    node.isExpanded = !node.isExpanded;
    this.cdr.markForCheck();
  }

  isActive(node: AssetTreeNode): boolean {
    return node.asset.assetId === this.activeAssetId;
  }

  trackByAssetId(_index: number, node: AssetTreeNode): string {
    return node.asset.assetId;
  }

  private applyFilter(query: string): void {
    if (!query.trim()) {
      this.resetVisibility(this.treeRoots);
      this.filteredRoots = this.treeRoots;
      return;
    }

    const lower = query.toLowerCase();
    this.filterNodes(this.treeRoots, lower);
    this.filteredRoots = this.treeRoots;
  }

  private filterNodes(nodes: AssetTreeNode[], query: string): boolean {
    let anyVisible = false;
    for (const node of nodes) {
      const selfMatch = node.asset.name.toLowerCase().includes(query);
      const childMatch = this.filterNodes(node.children, query);
      node.isVisible = selfMatch || childMatch;
      node.isExpanded = childMatch; // auto-expand if a child matches
      if (node.isVisible) anyVisible = true;
    }
    return anyVisible;
  }

  private resetVisibility(nodes: AssetTreeNode[]): void {
    for (const node of nodes) {
      node.isVisible = true;
      this.resetVisibility(node.children);
    }
  }

  private updateBreadcrumb(): void {
    if (this.activeAssetId) {
      const found = this.findNode(this.treeRoots, this.activeAssetId);
      if (found) {
        this.breadcrumb = found.path.join(' > ');
      }
    }
  }

  private findNode(nodes: AssetTreeNode[], assetId: string): AssetTreeNode | null {
    for (const node of nodes) {
      if (node.asset.assetId === assetId) return node;
      const found = this.findNode(node.children, assetId);
      if (found) return found;
    }
    return null;
  }
}
