import { K8sObject, K8sObjectList } from '@app/types';

export interface K8sFetchState {
  activity?: K8sFetchStateActivity;
  canContinue?: boolean;
  continue?: string;
  namespace?: string;
  namespaces?: string[];
  filter?: (any) => boolean;
  filteredItems?: K8sObject[];
  finished?: boolean;
  item?: K8sObject;
  items?: K8sObject[];
  limit?: number;
  prune?: (any) => any;
  refreshing?: boolean;
}

export interface K8sFetchStateAction {
  filter?: (any) => boolean;
  item?: K8sObject;
  items?: K8sObject[];
  k8sObjectList?: K8sObjectList;
  limit?: number;
  namespace?: string;
  namespaces?: string[];
  prune?: (any) => any;
  refresh?: () => void;
  refreshInterval?: number;
  type: 'modify' | 'post' | 'removeItems' | 'startFetch' | 'startRefresh' | 'updateItem' | 'updateItems';
}

export interface K8sFetchStateActivity {
  canceled?: boolean;
  lastItemToRefresh?: K8sObject;
  lastRefreshedItem?: K8sObject;
  refreshTimeout?: ReturnType<typeof setTimeout>;
}

export function cancelFetchActivity(state: K8sFetchState): void {
  if (state?.activity) {
    state.activity.canceled = true;
    if (state.activity.refreshTimeout) {
      clearTimeout(state.activity.refreshTimeout);
    }
  }
}

function compareK8sObjects(a: K8sObject, b: K8sObject) {
  return a.metadata.namespace < b.metadata.namespace
    ? -1
    : a.metadata.namespace > b.metadata.namespace
    ? 1
    : a.metadata.name < b.metadata.name
    ? -1
    : a.metadata.name > b.metadata.name
    ? 1
    : 0;
}

function reduceModify(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  const newFetchState: K8sFetchState = { ...state };
  if (action.filter !== undefined) {
    newFetchState.filter = action.filter;
    newFetchState.filteredItems = action.filter ? state.items.filter(action.filter) : state.items;
  }
  if (action.limit !== undefined) {
    newFetchState.limit = action.limit;
  }
  return newFetchState;
}

function reducePostItem(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  cancelFetchActivity(state);
  const newFetchState: K8sFetchState = {
    finished: true,
    item: action.item,
  };
  if (action.refresh) {
    newFetchState.activity = {
      refreshTimeout: action.refresh ? setTimeout(action.refresh, action.refreshInterval) : null,
    };
  }
  return newFetchState;
}

function reducePostItems(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  // Post indicates that any previous activity has concluded.
  cancelFetchActivity(state);

  // k8s continue to pass to next list, prefixed with underscore because
  // continue is a javascript keyword.
  const _continue: string = action.k8sObjectList.metadata.continue;

  // Namespace for next fetch. State namespaces can be null to fetch from all
  // namespaces.
  const namespace: string | null = _continue
    ? state.namespace
    : state.namespace
    ? state.namespaces[state.namespaces.indexOf(state.namespace) + 1]
    : null;

  // Can fetch more if can continue or if there is another namespace to fetch.
  const canContinue: boolean = _continue || namespace ? true : false;

  // finished if previously finished or there is no more to fetch.
  const finished: boolean = state.finished || !canContinue;

  // Prune objects from post if a prune function is defined.
  const postedItems: K8sObject[] = state.prune
    ? action.k8sObjectList.items.map(state.prune)
    : action.k8sObjectList.items;

  // Current list of unfiltered items.
  const stateItems: K8sObject[] = state.items || [];

  const newFetchState: K8sFetchState = {
    activity: {
      canceled: false,
    },
    canContinue: canContinue,
    continue: _continue,
    filter: state.filter,
    finished: finished,
    limit: state.limit,
    namespace: namespace,
    namespaces: state.namespaces,
    prune: state.prune,
  };

  if (state.refreshing) {
    const lastPostedItem =
      postedItems.length > 0 ? postedItems[postedItems.length - 1] : state.activity.lastRefreshedItem;

    const previouslyRefreshedItems: K8sObject[] = state.activity.lastRefreshedItem
      ? stateItems.filter((item) => 1 !== compareK8sObjects(item, state.activity.lastRefreshedItem))
      : [];
    const unrefreshedItems: K8sObject[] = finished
      ? []
      : lastPostedItem
      ? stateItems.filter((item) => 1 === compareK8sObjects(item, lastPostedItem))
      : stateItems;

    newFetchState.items = [...previouslyRefreshedItems, ...postedItems, ...unrefreshedItems];
    newFetchState.activity.lastRefreshedItem = finished ? null : lastPostedItem;

    if (state.filter) {
      const previouslyRefreshedFilteredItems: K8sObject[] = state.activity.lastRefreshedItem
        ? state.filteredItems.filter((item) => 1 !== compareK8sObjects(item, state.activity.lastRefreshedItem))
        : [];
      const unrefreshedFilteredItems: K8sObject[] = finished
        ? []
        : lastPostedItem
        ? state.filteredItems.filter((item) => 1 === compareK8sObjects(item, lastPostedItem))
        : state.filteredItems;
      newFetchState.filteredItems = [
        ...previouslyRefreshedFilteredItems,
        ...postedItems.filter(state.filter),
        ...unrefreshedFilteredItems,
      ];
    } else {
      newFetchState.filteredItems = newFetchState.items;
    }

    // Done refreshing if both all previously fetched items are refreshed and
    // the count of filtered tems reaches the limit.
    if (
      canContinue &&
      ((state.activity.lastItemToRefresh &&
        -1 === compareK8sObjects(lastPostedItem, state.activity.lastItemToRefresh)) ||
        !state.limit ||
        state.limit > newFetchState.filteredItems.length)
    ) {
      newFetchState.refreshing = true;
      newFetchState.activity.lastItemToRefresh = state.activity.lastItemToRefresh;
    } else {
      newFetchState.refreshing = false;
    }
  } else {
    const items: K8sObject[] = [...stateItems, ...postedItems];
    const filteredItems: K8sObject[] = state.filter
      ? [...state.filteredItems, ...postedItems.filter(state.filter)]
      : items;
    newFetchState.items = items;
    newFetchState.filteredItems = filteredItems;
  }

  // Need to schedule a refresh if refresh callback is provided and not already
  // refreshing and continued fetch is not expected because it cannot continue
  // or limit has been reached.
  if (
    action.refresh &&
    !newFetchState.refreshing &&
    (!canContinue || (state.limit && newFetchState.filteredItems.length >= state.limit))
  ) {
    newFetchState.activity.refreshTimeout = setTimeout(action.refresh, action.refreshInterval);
  }
  return newFetchState;
}

function reduceRemoveItems(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  if (!state?.items) {
    return state;
  }
  const removeItems = action.items;
  const items = [
    ...state.items.filter((item) => !removeItems.find((remove) => remove.metadata.uid === item.metadata.uid)),
  ];
  const filteredItems = state.filter
    ? [
        ...state.filteredItems.filter(
          (item) => !removeItems.find((remove) => remove.metadata.uid === item.metadata.uid)
        ),
      ]
    : items;
  return {
    ...state,
    filteredItems: filteredItems,
    items: items,
  };
}

function reduceStartFetch(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  const namespaces: string[] =
    action.namespaces !== undefined
      ? action.namespaces
      : action.namespace
      ? [action.namespace]
      : state?.namespaces !== undefined
      ? state.namespaces
      : null;
  cancelFetchActivity(state);
  return {
    activity: {
      canceled: false,
    },
    canContinue: true,
    filter: action.filter || state?.filter,
    filteredItems: [],
    item: undefined,
    items: [],
    limit: action.limit || undefined,
    namespace: namespaces?.[0],
    namespaces: namespaces,
    prune: action.prune || state?.prune,
    refreshing: false,
  };
}

function reduceStartRefresh(state: K8sFetchState): K8sFetchState {
  cancelFetchActivity(state);
  return {
    activity: {
      canceled: false,
      // Refresh completion requires this item to be refreshed.
      lastItemToRefresh: state.items && state.items.length > 0 ? state.items[state.items.length - 1] : undefined,
    },
    canContinue: true,
    filter: state.filter,
    item: state.item,
    items: state.items,
    filteredItems: state.filteredItems,
    limit: state.limit || null,
    namespace: state.namespaces?.[0],
    namespaces: state.namespaces,
    prune: state.prune,
    refreshing: true,
  };
}

function reduceUpdateItem(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  return {
    ...state,
    item: action.item,
  };
}

function reduceUpdateItems(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  const updatedItems = action.items;
  const items = [
    ...state.items.map((item) => {
      const updatedItem = updatedItems.find((update) => update.metadata.uid === item.metadata.uid);
      if (updatedItem && updatedItem.metadata.resourceVersion > (item.metadata.resourceVersion || 0)) {
        return updatedItem;
      } else {
        return item;
      }
    }),
  ];
  const filteredItems = state.filter ? items.filter(state.filter) : items;
  return {
    ...state,
    filteredItems: filteredItems,
    items: items,
  };
}

export function k8sFetchStateReducer(state: K8sFetchState, action: K8sFetchStateAction): K8sFetchState {
  switch (action.type) {
    case 'modify':
      return reduceModify(state, action);
    case 'post':
      if (action.k8sObjectList) {
        return reducePostItems(state, action);
      } else {
        return reducePostItem(state, action);
      }
    case 'removeItems':
      return reduceRemoveItems(state, action);
    case 'startFetch':
      return reduceStartFetch(state, action);
    case 'startRefresh':
      return reduceStartRefresh(state);
    case 'updateItem':
      return reduceUpdateItem(state, action);
    case 'updateItems':
      return reduceUpdateItems(state, action);
    default:
      throw new Error(`Invalid FetchStateAction type: ${action.type}`);
  }
}
