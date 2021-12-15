import { FetchState, K8sObject } from '@app/types';

export interface FetchStateAction {
  refreshTimeout?: ReturnType<typeof setTimeout>;
  type: string;
}


export function cancelFetchState(fetchState:FetchState): void {
  fetchState.canceled = true;
  if (fetchState.refreshTimeout) {
    clearTimeout(fetchState.refreshTimeout);
  }
}

export function fetchStateReducer(state:FetchState, action:FetchStateAction): FetchState {
  // Any change in state cancels previous activity.
  cancelFetchState(state);
  switch (action.type) {
    case 'cancel':
      return null;
    case 'finish':
      return { finished: true };
    case 'refresh':
      return { isRefresh: true };
    case 'start':
      return {};
    default:
      throw new Error(`Invalid FetchStateAction type: ${action.type}`);
  }
}

export interface K8sObjectsAction {
  items: K8sObject[];
  type: string;
}

export function k8sObjectsReducer(state:K8sObject[], action:K8sObjectsAction): K8sObject[] {
  switch (action.type) {
    case 'remove':
      const removeUids:string[] = action.items.map((item) => item.metadata.uid);
      return state.filter((anarchyAction) => !removeUids.includes(anarchyAction.metadata.uid));
    case 'set':
      return action.items;
    default:
      throw new Error(`Invalid AnarchyActionsAction type: ${action.type}`);
  }
}

export interface SelectedUidsAction {
  type: string;
  uids?: string[];
}

export function selectedUidsReducer(state:string[], action:SelectedUidsAction): string[] {
  switch (action.type) {
    case 'add':
      return [...state, ...action.uids.filter((uid) => !state.includes(uid))];
    case 'clear':
      return [];
    case 'remove':
      return [...state.filter((uid) => !action.uids.includes(uid))];
    case 'set':
      return action.uids;
    default:
      throw new Error(`Invalid SelectedUidsAction type: ${action.type}`);
  }
}
