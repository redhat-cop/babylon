import { K8sObject } from '@app/types';

export interface SelectedUidsAction {
  type: string;
  items?: K8sObject[];
  uids?: string[];
}

export function selectedUidsReducer(state: string[], action: SelectedUidsAction): string[] {
  if (action.type === 'clear') {
    return [];
  }
  const itemUids = action.uids || action.items.map((item) => item.metadata.uid);
  switch (action.type) {
    case 'add':
      return [...state, ...itemUids.filter((uid) => !state.includes(uid))];
    case 'remove':
      return [...state.filter((uid) => !itemUids.includes(uid))];
    case 'set':
      return itemUids;
    default:
      throw new Error(`Invalid SelectedUidsAction type: ${action.type}`);
  }
}
