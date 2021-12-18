import {
  K8sObject,
  K8sObjectList,
} from '@app/types';

export interface K8sFetchState {
  canceled?: boolean;
  continue?: string;
  namespace?: string;
  namespaces?: string[];
  filter?: (k8sObject:K8sObject) => boolean;
  filteredItems?: K8sObject[];
  finished?: boolean;
  item?: K8sObject;
  items?: K8sObject[];
  prune?: (k8sObject:K8sObject) => K8sObject;
  refreshing?: boolean;
  _lastRefreshedItem?: K8sObject;
  _refreshTimeout?: any;
}

export interface K8sFetchStateAction {
  filter?: (k8sObject:K8sObject) => boolean;
  item?: K8sObject;
  items?: K8sObject[];
  k8sObjectList?: K8sObjectList;
  namespace?: string;
  namespaces?: string[];
  prune?: (k8sObject:K8sObject) => K8sObject;
  refreshTimeout?: ReturnType<typeof setTimeout>;
  type: "post" | "removeItems" | "setFilter" | "startFetch" | "startRefresh" | "updateItems";
}

export function cancelFetchState(state:K8sFetchState): void {
  if (state) {
    state.canceled = true;
    if (state._refreshTimeout) {
      clearTimeout(state._refreshTimeout);
    }
  }
}

function compareK8sObjects(a:K8sObject, b:K8sObject) {
  return (
    a.metadata.namespace < b.metadata.namespace ? -1 :
    a.metadata.namespace > b.metadata.namespace ? 1 :
    a.metadata.name < b.metadata.name ? -1 :
    a.metadata.name > b.metadata.name ? 1 :
    0
  );
}

function reducePostItem(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  return {
    finished: true,
    item: action.item,
    _refreshTimeout: action.refreshTimeout,
  };
}

function reducePostItems(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  const _continue:string = action.k8sObjectList.metadata.continue;
  const namespace:string = _continue ? state.namespace : state.namespace ? (
    state.namespaces[state.namespaces.indexOf(state.namespace) + 1]
  ) : null;
  const finished:boolean = (_continue || namespace) ? false : true;
  const postedItems:K8sObject[] = state.prune ? (
    action.k8sObjectList.items.map(state.prune)
  ) : action.k8sObjectList.items;
  const stateItems:K8sObject[] = state.items || [];

  const newFetchState:K8sFetchState = {
    canceled: false,
    continue: _continue,
    filter: state.filter,
    finished: finished,
    namespace: namespace,
    namespaces: state.namespaces,
    prune: state.prune,
    _refreshTimeout: action.refreshTimeout,
  };

  if (state.refreshing) {
    const lastPostedItem = postedItems.length > 0 ? postedItems[postedItems.length - 1] : state._lastRefreshedItem;

    const previouslyRefreshedItems:K8sObject[] = state._lastRefreshedItem ? (
      stateItems.filter((item) => 1 !== compareK8sObjects(item, state._lastRefreshedItem))
    ) : [];
    const unrefreshedItems:K8sObject[] = finished ? [] : lastPostedItem ? (
      stateItems.filter((item) => 1 === compareK8sObjects(item, lastPostedItem))
    ) : stateItems;

    newFetchState.items = [...previouslyRefreshedItems, ...postedItems, ...unrefreshedItems];
    newFetchState.refreshing = !finished;
    newFetchState._lastRefreshedItem = finished ? null : lastPostedItem;

    if (state.filter) {
      const previouslyRefreshedFilteredItems:K8sObject[] = state._lastRefreshedItem ? (
        state.filteredItems.filter((item) => 1 !== compareK8sObjects(item, state._lastRefreshedItem))
      ) : [];
      const unrefreshedFilteredItems:K8sObject[] = finished ? [] : lastPostedItem ? (
        state.filteredItems.filter((item) => 1 === compareK8sObjects(item, lastPostedItem))
      ) : state.filteredItems;
      newFetchState.filteredItems = [...previouslyRefreshedFilteredItems, ...postedItems.filter(state.filter), ...unrefreshedFilteredItems];
    } else {
      newFetchState.filteredItems = newFetchState.items;
    }
  } else {
    const items:K8sObject[] = [...stateItems, ...postedItems];
    const filteredItems:K8sObject[] = state.filter ? [...state.filteredItems, ...postedItems.filter(state.filter)] : items;
    newFetchState.items = items;
    newFetchState.filteredItems = filteredItems;
  }

  return newFetchState;
}

function reduceRemoveItems(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  const removeItems = action.items;
  const items = [...state.items.filter(
    (item) => !removeItems.find((remove) => remove.metadata.uid === item.metadata.uid)
  )];
  const filteredItems = state.filter ? [...state.filteredItems.filter(
    (item) => !removeItems.find((remove) => remove.metadata.uid === item.metadata.uid)
  )] : items;
  return {
    ...state,
    filteredItems: filteredItems,
    items: items,
  }
}

function reduceSetFilter(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  return {
    ...state,
    filter: action.filter,
    filteredItems: action.filter ? state.items.filter(action.filter) : state.items,
  };
}

function reduceStartFetch(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  const namespaces:string[] = (
    action.namespaces !== undefined ? action.namespaces :
    action.namespace ? [action.namespace] :
    state?.namespaces !== undefined ? state.namespaces :
    null
  );
  return {
    filter: action.filter || state?.filter,
    filteredItems: [],
    item: null,
    items: [],
    namespace: namespaces?.[0],
    namespaces: namespaces,
    prune: action.prune || state?.prune,
  };
}

function reduceStartRefresh(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  return {
    filter: state.filter,
    item: state.item,
    items: state.items,
    filteredItems: state.filteredItems,
    namespace: state.namespaces?.[0],
    namespaces: state.namespaces,
    prune: state.prune,
    refreshing: true,
  };
}

function reduceUpdateItems(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  const updatedItems = action.items;
  const items = [...state.items.map(
    (item) => updatedItems.find((update) => update.metadata.uid === item.metadata.uid) || item
  )];
  const filteredItems = state.filter ? items.filter(state.filter) : items;
  return {
    ...state,
    filteredItems: filteredItems,
    items: items,
  }
}

export function k8sFetchStateReducer(state:K8sFetchState, action:K8sFetchStateAction): K8sFetchState {
  // Any change in state cancels previous activity.
  cancelFetchState(state);
  switch (action.type) {
    case 'post':
      if (action.item) {
        return reducePostItem(state, action);
      } else {
        return reducePostItems(state, action);
      }
    case 'removeItems':
      return reduceRemoveItems(state, action);
    case 'setFilter':
      return reduceSetFilter(state, action);
    case 'startFetch':
      return reduceStartFetch(state, action);
    case 'startRefresh':
      return reduceStartRefresh(state, action);
    case 'updateItems':
      return reduceUpdateItems(state, action);
    default:
      throw new Error(`Invalid FetchStateAction type: ${action.type}`);
  }
}
