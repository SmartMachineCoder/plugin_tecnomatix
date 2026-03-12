import { Variable } from './variable.model';

export interface Aspect {
  name: string;
  description?: string;
  variables: Variable[];
  isExpanded: boolean;
}
