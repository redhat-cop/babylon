import {
  createAction,
  createReducer,
  configureStore,
} from '@reduxjs/toolkit';

import {
  createSelector,
} from 'reselect'

import {
  listCatalogItems,
  listResourceClaims,
} from '@app/api';

import {
  CatalogItem,
  CatalogItemList,
  CatalogNamespace,
  ResourceClaim,
  ResourceClaimList,
  ServiceNamespace,
} from '@app/types';

let watchCatalogItemsTimeout: null | ReturnType<typeof setTimeout> = null;
let watchResourceClaimsTimeout: null | ReturnType<typeof setTimeout> = null;

export interface ActionSetImpersonation {
  admin: string,
  user: string,
  groups: [string],
  catalogNamespaces: [],
  serviceNamespaces: [],
  userNamespace: [],
}

export interface ActionStartSession {
  admin: boolean,
  consoleURL: string,
  user: string,
  groups: [string],
  interface: string,
  catalogNamespaces: CatalogNamespace[],
  serviceNamespaces: ServiceNamespace[],
  userNamespace: ServiceNamespace,
}

export interface ActionSetCatalogItems {
  catalogItems: CatalogItemsByNamespace;
}

export interface ActionSetCatalogItemsForNamespace {
  namespace: string;
  catalogItems: CatalogItem[];
}

export interface ActionSetResourceClaims {
  resourceClaims: ResourceClaimsByNamespace;
}

export interface ActionSetResourceClaimsForNamespace {
  namespace: string;
  resourceClaims: ResourceClaim[];
}

interface CatalogItemsByNamespace {
  [key:string]: CatalogItem[];
}

interface ResourceClaimsByNamespace {
  [key:string]: ResourceClaim[];
}

async function refreshCatalogItems(triggeredByTimeout: null | ReturnType<typeof setTimeout>): Promise<void> {
  const state = store.getState();
  const catalogNamespaceNames = selectCatalogNamespaces(state).map(n => n.name);
  const userIsAdmin = selectUserIsAdmin(state);
  if (userIsAdmin) {
    const catalogItems:CatalogItemsByNamespace = {};
    let _continue: string = "";
    while (true) {
      const resp:CatalogItemList = await listCatalogItems({
        continue: _continue,
        limit: 50,
      });
      if (watchCatalogItemsTimeout != triggeredByTimeout) { return }
      if (!resp.items) { break }
      let lastNamespace:string = null;
      for (let i=0; i < resp.items.length; ++i) {
        const catalogItem = resp.items[i];
        const namespace = catalogItem.metadata.namespace;
        if (catalogNamespaceNames.includes(namespace)) {
          if (!lastNamespace) {
            lastNamespace = namespace;
          } else if (namespace !== lastNamespace) {
            store.dispatch(
              __actionSetCatalogItemsForNamespace({
                namespace: lastNamespace,
                catalogItems: catalogItems[lastNamespace],
              })
            );
            lastNamespace = namespace;
          }
          if (namespace in catalogItems) {
            catalogItems[namespace].push(catalogItem);
          } else {
            catalogItems[namespace] = [catalogItem];
          }
        }
      }
      if (resp.metadata.continue) {
        _continue = resp.metadata.continue;
      } else {
        break;
      }
    }
    store.dispatch(
      __actionSetCatalogItems({
        catalogItems: catalogItems,
      })
    );
  } else {
    for (let n=0; n < catalogNamespaceNames.length; ++n) {
      const namespace: string = catalogNamespaceNames[n];
      const catalogItems:CatalogItem[] = [];
      let _continue = null;
      while (true) {
        const resp = await listCatalogItems({
          continue: _continue,
          limit: 100,
          namespace: namespace,
        });
        if (watchCatalogItemsTimeout != triggeredByTimeout) { return }
        if (!resp.items) { break }
        catalogItems.push(...resp.items);
        if (resp.metadata.continue) {
          _continue = resp.metadata.continue;
        } else {
          break;
        }
      }
      store.dispatch(
        __actionSetCatalogItemsForNamespace({
          namespace: namespace,
          catalogItems: catalogItems,
        })
      );
    }
  }
}

async function watchCatalogItems(): Promise<void> {
  const triggeredByTimeout = watchCatalogItemsTimeout
  await refreshCatalogItems(triggeredByTimeout);
  if (triggeredByTimeout == watchCatalogItemsTimeout) {
    watchCatalogItemsTimeout = setTimeout(watchCatalogItems, 120 * 1000);
  }
}

function startWatchCatalogItems(): void {
  if (watchCatalogItemsTimeout) {
    clearTimeout(watchCatalogItemsTimeout);
    watchCatalogItemsTimeout = null;
  }
  watchCatalogItemsTimeout = setTimeout(watchCatalogItems, 1);
}

async function refreshResourceClaimsFromNamespace(namespace:string, triggeredByTimeout:ReturnType<typeof setTimeout>): Promise<void> {
  const resourceClaims:ResourceClaim[] = [];
  let _continue: string = "";
  while (true) {
    const resp:ResourceClaimList = await listResourceClaims({
        continue: _continue,
        limit: 100,
	namespace: namespace,
      }
    );
    // If resource claims timeout has changed then this refresh should abort.
    if (watchResourceClaimsTimeout !== triggeredByTimeout) { return }
    if (!resp.items) { break }
    resourceClaims.push(...resp.items);
    if (resp.metadata.continue) {
      _continue = resp.metadata.continue;
    } else {
      break;
    }
  }
  store.dispatch(
    __actionSetResourceClaimsForNamespace({
      namespace: namespace,
      resourceClaims: resourceClaims,
    })
  );
}

async function refreshResourceClaims(triggeredByTimeout: ReturnType<typeof setTimeout>): Promise<void> {
  /**
   * Refresh all resource claims from service namespaces.
   *
   * @param {Timeout} 
   */
  const state = store.getState();
  const serviceNamespaceNames:string[] = selectServiceNamespaces(state).map(n => n.name);

  for (const serviceNamespaceName of serviceNamespaceNames) {
    await refreshResourceClaimsFromNamespace(serviceNamespaceName, triggeredByTimeout);
  }
}

async function watchResourceClaims(): Promise<void> {
  /**
   * Periodically refresh all resourceClaims in service namespaces.
   *
   * The state of service namespace resource claims is maintained in the store
   * so that multiple components can rely on this data without having to
   * implement a means of fetching it.
   */
  const triggeredByTimeout:ReturnType<typeof setTimeout> = watchResourceClaimsTimeout;
  await refreshResourceClaims(triggeredByTimeout);
  if (triggeredByTimeout === watchResourceClaimsTimeout) {
    watchResourceClaimsTimeout = setTimeout(watchResourceClaims, 5 * 1000);
  }
}

function startWatchResourceClaims(): void {
  /**
   * Start watch of resource claims, canceling any ongoing watch.
   */
  if (watchResourceClaimsTimeout) {
    clearTimeout(watchResourceClaimsTimeout);
    watchResourceClaimsTimeout = null;
  }
  watchResourceClaimsTimeout = setTimeout(watchResourceClaims, 1);
}


// Reducer functions
function reduce_clearImpersonation(state, action) {
  state.impersonate = null;
  state.catalogItems = null;
  state.resourceClaims = null;
  startWatchCatalogItems();
  startWatchResourceClaims();
  sessionStorage.removeItem('impersonateUser');
}

function reduce_deleteResourceClaim(state, action) {
  const {name, namespace} = action.payload;
  if (state.resourceClaims?.[namespace]) {
    state.resourceClaims[namespace] = state.resourceClaims[namespace].filter(rc => rc.metadata.name != name);
  }
}

function reduce_insertResourceClaim(state, action) {
  const {resourceClaim} = action.payload;
  const namespace = resourceClaim.metadata.namespace;
  if (state.resourceClaims?.[namespace]) {
    state.resourceClaims[namespace].push(resourceClaim);
  } else if(state.resourceClaims) {
    state.resourceClaims[namespace] = [resourceClaim];
  } else {
    state.resourceClaims = {
      [namespace]: [resourceClaim],
    };
  }
}

function reduce_setImpersonation(state, action) {
  const {admin, groups, roles, user, catalogNamespaces, serviceNamespaces, userNamespace} = action.payload;
  state.impersonate = {
    admin: admin || false,
    groups: groups || [],
    roles: roles || [],
    user: user,
    catalogNamespaces: catalogNamespaces,
    serviceNamespaces: serviceNamespaces,
    userNamespace: userNamespace,
  };
  state.catalogItems = null;
  state.resourceClaims = null;
  startWatchCatalogItems();
  startWatchResourceClaims();
}

function reduce_setCatalogItems(state, action) {
  const {catalogItems} = action.payload;
  state.catalogItems = catalogItems;
}

function reduce_setCatalogItemsForNamespace(state, action) {
  const {namespace, catalogItems} = action.payload;
  if (state.catalogItems) {
    state.catalogItems[namespace] = catalogItems;
  } else {
    state.catalogItems = { [namespace]: catalogItems };
  }
}

function reduce_setResourceClaims(state, action) {
  const {resourceClaims} = action.payload;
  state.resourceClaims = resourceClaims;
}

function reduce_setResourceClaimsForNamespace(state, action) {
  const {namespace, resourceClaims} = action.payload;
  if (state.resourceClaims) {
    state.resourceClaims[namespace] = resourceClaims;
  } else {
    state.resourceClaims = { [namespace]: resourceClaims };
  }
}

function reduce_startSession(state, action) {
  state.auth.admin = action.payload.admin || false;
  state.auth.groups = action.payload.groups || [];
  state.auth.roles = action.payload.roles || [];
  state.auth.user = action.payload.user;
  state.auth.catalogNamespaces = action.payload.catalogNamespaces;
  state.auth.serviceNamespaces = action.payload.serviceNamespaces;
  state.auth.userNamespace = action.payload.userNamespace;
  state.catalogItems = null;
  state.consoleURL = action.payload.consoleURL;
  state.interface = action.payload.interface;
  state.resourceClaims = null;
  startWatchCatalogItems();
  startWatchResourceClaims();
}

function reduce_updateResourceClaim(state, action) {
  const {resourceClaim} = action.payload;
  if (state.resourceClaims?.[resourceClaim.metadata.namespace]) {
    const resourceClaims = state.resourceClaims[resourceClaim.metadata.namespace]
    if (resourceClaims) {
      for (let i=0; i < resourceClaims.length; ++i) {
        if (resourceClaims[i].metadata.name == resourceClaim.metadata.name) {
          resourceClaims[i] = resourceClaim;
          break;
        }
      }
    }
  }
}

// Action creators
export const actionClearImpersonation = createAction("clearImpersonation");
export const actionSetImpersonation = createAction<ActionSetImpersonation>("setImpersonation");
export const actionStartSession = createAction<ActionStartSession>("startSession");

// TODO: udpate types:: visibilty of types not available
// Actions reserved for api usage
export const apiActionDeleteResourceClaim = createAction<any>("deleteResourceClaim")
export const apiActionInsertResourceClaim = createAction<any>("insertResourceClaim")
export const apiActionUpdateResourceClaim = createAction<any>("updateResourceClaim")

// Private actions
export const __actionSetCatalogItems = createAction<ActionSetCatalogItems>("setCatalogItems");
export const __actionSetCatalogItemsForNamespace = createAction<ActionSetCatalogItemsForNamespace>("setCatalogItemsForNamespace");
export const __actionSetResourceClaims = createAction<ActionSetResourceClaims>("setResourceClaims");
export const __actionSetResourceClaimsForNamespace = createAction<ActionSetResourceClaimsForNamespace>("setResourceClaimsForNamespace");


// Selectors
const selectSelf = (state: any) => state

export const selectAuthIsAdmin = createSelector(
  selectSelf,
  state => state.auth.admin,
)

export const selectAuthUser = createSelector(
  selectSelf,
  state => state.auth.user,
)

export const selectConsoleURL = createSelector(
  selectSelf,
  state => state.consoleURL,
)

export const selectInterface = createSelector(
  selectSelf,
  state => state.interface,
)

export const selectUser = createSelector(
  selectSelf,
  state => state.impersonate ? state.impersonate.user : state.auth.user,
)

export const selectUserGroups = createSelector(
  selectSelf,
  state => state.impersonate ? state.impersonate.groups : state.auth.groups,
)

export const selectUserIsAdmin = createSelector(
  selectSelf,
  state => state.impersonate ? state.impersonate.admin : state.auth.admin,
)

export const selectUserRoles = createSelector(
  selectSelf,
  state => state.impersonate ? state.impersonate.roles : state.auth.roles || [],
)

export const selectImpersonationUser = createSelector(
  selectSelf,
  state => state.impersonate?.user,
)

export const selectCatalogItems = createSelector(
  selectSelf,
  state => state.catalogItems,
)

export const selectCatalogNamespaces = createSelector(
  selectSelf,
  state => state.impersonate ? state.impersonate.catalogNamespaces : state.auth.catalogNamespaces,
)

export const selectResourceClaim = createSelector(
  [
    (state:any) => state.resourceClaims,
    (state:any, namespace:string, name:string): string[] => [namespace, name],
  ],
  (resourceClaims:any, args:string[]): ResourceClaim => {
    const [namespace, name] = args;
    return (resourceClaims?.[namespace] || []).find((resourceClaim) => resourceClaim.metadata.name === name);
  }
)

export const selectResourceClaims = createSelector(
  selectSelf,
  (state:any): ResourceClaim[] => {
    if (!state.resourceClaims) { return [] }
    const namespaceNames = Object.keys(state.resourceClaims);
    namespaceNames.sort();
    const resourceClaims = [];
    for (const ns of namespaceNames) {
      resourceClaims.push(...state.resourceClaims[ns]);
    }
    return resourceClaims;
  }
)

export const selectResourceClaimsInNamespace = createSelector(
  [
    (state:any) => state.resourceClaims,
    (state:any, namespace:string): string => namespace,
  ],
  (resourceClaims:any, namespace:string): ResourceClaim[] => resourceClaims?.[namespace] || []
)

export const selectServiceNamespaces = createSelector(
  selectSelf,
  state => state.impersonate ? state.impersonate.serviceNamespaces : state.auth.serviceNamespaces,
)

export const selectUserNamespace = createSelector(
  selectSelf,
  state => state.impersonate ? state.impersonate.userNamespace : state.auth.userNamespace,
)


// Store
export const store = configureStore({
  reducer: createReducer({
    auth: {
      admin: null,
      groups: [],
      user: null,
      catalogNamespaces: [],
      serviceNamespaces: [],
      userNamespace: null,
    },
    catalogItems: null,
    impersonate: null,
    interface: null,
    resourceClaims: null,
  }, {
    "clearImpersonation": reduce_clearImpersonation,
    "deleteResourceClaim": reduce_deleteResourceClaim,
    "insertResourceClaim": reduce_insertResourceClaim,
    "setCatalogItems": reduce_setCatalogItems,
    "setCatalogItemsForNamespace": reduce_setCatalogItemsForNamespace,
    "setImpersonation": reduce_setImpersonation,
    "setResourceClaims": reduce_setResourceClaims,
    "setResourceClaimsForNamespace": reduce_setResourceClaimsForNamespace,
    "startSession": reduce_startSession,
    "updateResourceClaim": reduce_updateResourceClaim,
  })
});
