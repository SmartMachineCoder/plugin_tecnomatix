import { Injectable } from '@angular/core';
import { Asset, AssetTreeNode } from '../models/asset.model';
import { Aspect } from '../models/aspect.model';
import { Variable } from '../models/variable.model';
import { LoggerService } from './logger.service';
import { IhApiService } from './ih-api.service';

@Injectable({ providedIn: 'root' })
export class AssetService {
  constructor(private logger: LoggerService, private ihApi: IhApiService) {}

  async loadAllAssets(): Promise<Asset[]> {
    let page = 0;
    let allAssets: Asset[] = [];
    let hasMore = true;

    while (hasMore) {
      const data = await this.fetchWithRetry<{ _embedded: { assets: Asset[] } }>(
        this.ihApi.url(`/api/assetmanagement/v3/assets?size=200&page=${page}`)
      );

      const pageAssets = data._embedded?.assets ?? [];
      allAssets = [...allAssets, ...pageAssets];
      hasMore = pageAssets.length === 200;
      page++;
    }

    return allAssets;
  }

  buildTree(assets: Asset[]): AssetTreeNode[] {
    const map = new Map<string, AssetTreeNode>();

    // Create nodes
    for (const asset of assets) {
      map.set(asset.assetId, {
        asset,
        children: [],
        isExpanded: false,
        isVisible: true,
        depth: 0,
        path: []
      });
    }

    const roots: AssetTreeNode[] = [];

    // Wire parent-child relationships
    for (const asset of assets) {
      const node = map.get(asset.assetId)!;
      if (asset.parentId && map.has(asset.parentId)) {
        const parentNode = map.get(asset.parentId)!;
        parentNode.children.push(node);
        node.depth = parentNode.depth + 1;
      } else {
        roots.push(node);
      }
    }

    // Build path arrays
    this.assignPaths(roots, []);

    return roots;
  }

  async loadAspects(assetId: string): Promise<Aspect[]> {
    interface AspectVariable {
      name: string;
      unit: string;
      dataType: string;
    }
    interface AspectResponse {
      name: string;
      description?: string;
      variables: AspectVariable[];
    }
    interface AspectsApiResponse {
      _embedded: { aspects: AspectResponse[] };
    }

    const data = await this.fetchWithRetry<AspectsApiResponse>(
      this.ihApi.url(`/api/assetmanagement/v3/assets/${assetId}/aspects`)
    );

    const aspects: Aspect[] = (data._embedded?.aspects ?? []).map((a) => ({
      name: a.name,
      description: a.description,
      isExpanded: true,
      variables: (a.variables ?? []).map((v) => ({
        name: v.name,
        unit: v.unit ?? '',
        dataType: v.dataType as Variable['dataType'],
        selected: false
      }))
    }));

    return aspects;
  }

  async loadLastValue(assetId: string, aspectName: string, variableName: string): Promise<{ value: number | string | boolean | null; timestamp: string } | null> {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last 1 hour
    const url = this.ihApi.url(`/api/iottimeseries/v4/timeseries/${assetId}/${aspectName}?from=${from}&to=${to}&select=${variableName}&limit=1`);

    try {
      const data = await this.fetchWithRetry<Array<Record<string, unknown>>>(url);
      if (Array.isArray(data) && data.length > 0) {
        const row = data[0];
        return {
          value: row[variableName] as number | string | boolean | null,
          timestamp: row['_time'] as string ?? ''
        };
      }
    } catch {
      // Best-effort — don't fail if last value can't be loaded
    }
    return null;
  }

  private assignPaths(nodes: AssetTreeNode[], parentPath: string[]): void {
    for (const node of nodes) {
      node.path = [...parentPath, node.asset.name];
      this.assignPaths(node.children, node.path);
    }
  }

  private async fetchWithRetry<T>(url: string, attempt = 1): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { credentials: 'include' });
    } catch (err) {
      if (attempt < 3) {
        await this.delay(Math.pow(2, attempt) * 1000);
        return this.fetchWithRetry<T>(url, attempt + 1);
      }
      throw err;
    }

    if (response.status === 401) {
      throw new Error('IH_401: Session expired. Please refresh.');
    }
    if (response.status === 403) {
      throw new Error('IH_403: Insufficient permissions. Check asset scopes.');
    }
    if (response.status === 404) {
      throw new Error('IH_404: Asset or aspect not found.');
    }
    if (response.status === 429) {
      await this.delay(30000);
      return this.fetchWithRetry<T>(url, attempt);
    }
    if (response.status >= 500 && attempt < 3) {
      await this.delay(Math.pow(2, attempt) * 1000);
      return this.fetchWithRetry<T>(url, attempt + 1);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
