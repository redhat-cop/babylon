import { FetchState, K8sObject } from '@app/types';

export interface FetchStateAction {
  continue?: string;
  items?: K8sObject[];
  refreshTimeout?: ReturnType<typeof setTimeout>;
  type: string;
}


export function cancelFetchState(fetchState:FetchState): void {
  if (fetchState) {
    fetchState.canceled = true;
    if (fetchState.refreshTimeout) {
      clearTimeout(fetchState.refreshTimeout);
    }
  }
}

export function fetchStateReducer(state:FetchState, action:FetchStateAction): FetchState {
  // Any change in state cancels previous activity.
  cancelFetchState(state);
  switch (action.type) {
    case 'cancel':
      return null;
    case 'finish':
      return {
        continue: action.continue,
        fetchedUids: [...(state.fetchedUids || []), ...(action.items || []).map((item) => item.metadata.uid)],
        finished: action.continue ? false : true,
        isRefresh: state.isRefresh,
        refreshTimeout: action.refreshTimeout,
      };
    case 'refresh':
      return {
        fetchedUids: [],
        isRefresh: true,
      };
    case 'start':
      return {
        fetchedUids: [],
        isRefresh: false,
      };
    default:
      throw new Error(`Invalid FetchStateAction type: ${action.type}`);
  }
}

export function k8sObjectUid(k8sObject:K8sObject): string {
  return k8sObject.metadata.uid;
}

export interface K8sObjectsAction {
  items?: K8sObject[];
  refreshComplete?: boolean;
  refreshedUids?: string[];
  type: string;
}

export function k8sObjectsReducer(state:K8sObject[], action:K8sObjectsAction): K8sObject[] {
  switch (action.type) {
    case 'append':
      return [...state, ...action.items];
    case 'clear':
      return [];
    case 'refresh':
      const stateUids:string[] = state.map(k8sObjectUid);
      const refreshedItems:K8sObject[] = [
        ...state.map(
          (stateItem) => action.items.find(
            (actionItem) => stateItem.metadata.uid === actionItem.metadata.uid
          ) || stateItem
        ),
        ...action.items.filter((item) => !stateUids.includes(item.metadata.uid)),
      ];
      refreshedItems.sort((a, b) =>
        a.metadata.namespace < b.metadata.namespace ? -1 :
        a.metadata.namespace > b.metadata.namespace ? 1 :
        a.metadata.name < b.metadata.name ? -1 :
        a.metadata.name > b.metadata.name ? 1 :
        0
      );
      if (action.refreshComplete) {
        const refreshedUids:string[] = [...action.refreshedUids, ...action.items.map(k8sObjectUid)];
        return refreshedItems.filter((item) => refreshedUids.includes(item.metadata.uid))
      } else {
        return refreshedItems;
      }
    case 'remove':
      const removeUids:string[] = action.items.map((item) => item.metadata.uid);
      return state.filter((anarchyAction) => !removeUids.includes(anarchyAction.metadata.uid));
    case 'set':
      return action.items;
    default:
      throw new Error(`Invalid K8sObjectsAction type: ${action.type}`);
  }
}

export interface SelectedUidsAction {
  type: string;
  items?: K8sObject[];
  uids?: string[];
}

export function selectedUidsReducer(state:string[], action:SelectedUidsAction): string[] {
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
