export interface Asset {
  assetId: string;
  name: string;
  typeId: string;
  parentId: string | null;
  description?: string;
  children?: Asset[];
}

export interface AssetTreeNode {
  asset: Asset;
  children: AssetTreeNode[];
  isExpanded: boolean;
  isVisible: boolean;
  depth: number;
  path: string[]; // array of ancestor names for breadcrumb
}
