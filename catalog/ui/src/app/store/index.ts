import {
  createAction,
  createReducer,
  configureStore,
} from '@reduxjs/toolkit';

import {
  createSelector,
} from 'reselect'

import {
  IListCustomerCustomObjectResp,
  IItems,
  IActionSetImpersonation,
  IActionStartSession,
  ICatalogItem,
  ICatalogItemsObj,
  ICatalogItemsNamespaceObj
} from "./entities";

import {
  listClusterCustomObject,
  listNamespacedCustomObject,
} from '@app/api';

let watchCatalogItemsTimeout: null | ReturnType<typeof setTimeout> = null;
let watchResourceClaimsTimeout: null | ReturnType<typeof setTimeout> = null;

async function refreshCatalogItems(triggeredByTimeout: null | ReturnType<typeof setTimeout>): Promise<void> {
  const state = store.getState();
  const namespaces = selectCatalogNamespaces(state).map(n => n.name);
  const userIsAdmin = selectUserIsAdmin(state);
  if (userIsAdmin) {
    const catalogItems : ICatalogItem = {} as ICatalogItem;
    let _continue: string = "";
    while (true) {
      const resp: IListCustomerCustomObjectResp = await listClusterCustomObject(
        'babylon.gpte.redhat.com', 'v1', 'catalogitems',
        {
          continue: _continue,
          limit: 100,
        }
      );
      if (watchCatalogItemsTimeout != triggeredByTimeout) { return }
      if (!resp.items) { break }
      for (let i=0; i < resp.items.length; ++i) {
        const catalogItem = resp.items[i];
        const namespace = catalogItem.metadata.namespace;
        if (namespaces.includes(namespace)) {
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
    for (let n=0; n < namespaces.length; ++n) {
      const namespace: string = namespaces[n];
      const catalogItems: ICatalogItem[] = [];
      let _continue = null;
      while (true) {
        const resp = await listNamespacedCustomObject(
          'babylon.gpte.redhat.com', 'v1', namespace, 'catalogitems',
          {
            continue: _continue,
            limit: 100,
          }
        );
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
    watchCatalogItemsTimeout = setTimeout(watchCatalogItems, 30 * 1000);
  }
}

function startWatchCatalogItems(): void {
  if (watchCatalogItemsTimeout) {
    clearTimeout(watchCatalogItemsTimeout);
    watchCatalogItemsTimeout = null;
  }
  watchCatalogItemsTimeout = setTimeout(watchCatalogItems, 1);
}

async function refreshResourceClaimsFromNamespace(triggeredByTimeout, namespace): Promise<void> {
  const resourceClaims: any[] = [];
  let _continue: string = "";
  while (true) {
    const resp = await listNamespacedCustomObject(
      'poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims',
      {
        continue: _continue,
        limit: 100,
      }
    );
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

async function refreshResourceClaims(triggeredByTimeout): Promise<void> {
  const state = store.getState();
  const activeNamespace = selectActiveServiceNamespace(state);
  const namespaces = selectServiceNamespaces(state).map(n => n.name);
  const userNamespace = selectUserNamespace(state);
  const userIsAdmin = selectUserIsAdmin(state);
  const userRoles = selectUserRoles(state);
  if (activeNamespace === '*') {
    if (userIsAdmin || userRoles.includes('userSupport')) {
      const resourceClaims = {}
      let _continue = null;
      while (true) {
        const resp = await listClusterCustomObject(
          'poolboy.gpte.redhat.com', 'v1', 'resourceclaims',
          {
            continue: _continue,
            limit: 100,
          }
        );
        if (watchResourceClaimsTimeout != triggeredByTimeout) { return }
        if (!resp.items) { break }
        for (let i=0; i < resp.items.length; ++i) {
          const resourceClaim = resp.items[i];
          const namespace = resourceClaim.metadata.namespace;
          if (namespaces.includes(namespace)) {
            if (namespace in resourceClaims) {
              resourceClaims[namespace].push(resourceClaim)
            } else {
              resourceClaims[namespace] = [resourceClaim]
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
        __actionSetResourceClaims({
          resourceClaims: resourceClaims,
        })
      );
    } else {
      for (const namespace of namespaces) {
        await refreshResourceClaimsFromNamespace(triggeredByTimeout, namespace);
      }
    }
  } else {
    if (activeNamespace && activeNamespace !== userNamespace?.name) {
      await refreshResourceClaimsFromNamespace(triggeredByTimeout, activeNamespace);
    }
    if (userNamespace) {
      await refreshResourceClaimsFromNamespace(triggeredByTimeout, userNamespace.name);
    }
  }
}

async function watchResourceClaims(): Promise<void> {
  const triggeredByTimeout = watchResourceClaimsTimeout;
  await refreshResourceClaims(triggeredByTimeout);
  if (triggeredByTimeout == watchResourceClaimsTimeout) {
    watchResourceClaimsTimeout = setTimeout(watchResourceClaims, 10 * 1000);
  }
}

function startWatchResourceClaims(): void {
  if (watchResourceClaimsTimeout) {
    clearTimeout(watchResourceClaimsTimeout);
    watchResourceClaimsTimeout = null;
  }
  watchResourceClaimsTimeout = setTimeout(watchResourceClaims, 1);
}


// Reducer functions
function reduce_clearImpersonation(state, action) {
  state.activeServiceNamespace = null;
  state.impersonate = null;
  state.catalogItems = null;
  state.resourceClaims = null;
  startWatchCatalogItems();
  startWatchResourceClaims();
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

function reduce_setActiveServiceNamespace(state, action) {
  if (state.activeServiceNamespace !== action.payload) {
    state.activeServiceNamespace = action.payload;
    startWatchResourceClaims();
  }
}

function reduce_setImpersonation(state, action) {
  const {admin, groups, roles, user, catalogNamespaces, serviceNamespaces, userNamespace} = action.payload;
  state.impersonate = {
    admin: admin,
    groups: groups,
    roles: roles,
    user: user,
    catalogNamespaces: catalogNamespaces,
    serviceNamespaces: serviceNamespaces,
    userNamespace: userNamespace,
  };
  state.activeServiceNamespace = null;
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
  state.activeServiceNamespace = null;
  state.auth.admin = action.payload.admin;
  state.auth.groups = action.payload.groups;
  state.auth.roles = action.payload.roles;
  state.auth.user = action.payload.user;
  state.auth.catalogNamespaces = action.payload.catalogNamespaces;
  state.auth.serviceNamespaces = action.payload.serviceNamespaces;
  state.auth.userNamespace = action.payload.userNamespace;
  state.catalogItems = null;
  state.interface = action.payload.interface;
  state.resourceClaims = null;
  startWatchCatalogItems();
}

function reduce_updateResourceClaim(state, action) {
  const {resourceClaim} = action.payload;
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


// Action creators
export const actionClearImpersonation = createAction("clearImpersonation");
export const actionSetImpersonation = createAction<IActionSetImpersonation>("setImpersonation");
export const actionStartSession = createAction<IActionStartSession>("startSession");
export const actionSetActiveServiceNamespace = createAction<string | null>("setActiveServiceNamespace");

// TODO: udpate types:: visibilty of types not available
// Actions reserved for api usage
export const apiActionDeleteResourceClaim = createAction<any>("deleteResourceClaim")
export const apiActionInsertResourceClaim = createAction<any>("insertResourceClaim")
export const apiActionUpdateResourceClaim = createAction<any>("updateResourceClaim")

// Private actions
export const __actionSetCatalogItems = createAction<ICatalogItemsObj>("setCatalogItems");
export const __actionSetCatalogItemsForNamespace = createAction<ICatalogItemsNamespaceObj>("setCatalogItemsForNamespace");
export const __actionSetResourceClaims = createAction<any>("setResourceClaims");
export const __actionSetResourceClaimsForNamespace = createAction<any>("setResourceClaimsForNamespace");


// Selectors
const selectSelf = (state: any) => state

export const selectActiveServiceNamespace = createSelector(
  selectSelf,
  state => state.activeServiceNamespace,
)

export const selectAuthIsAdmin = createSelector(
  selectSelf,
  state => state.auth.admin,
)

export const selectAuthUser = createSelector(
  selectSelf,
  state => state.auth.user,
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

export const selectResourceClaims = createSelector(
  selectSelf,
  state => state.resourceClaims,
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
      admin: false,
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
    "setActiveServiceNamespace": reduce_setActiveServiceNamespace,
    "setCatalogItems": reduce_setCatalogItems,
    "setCatalogItemsForNamespace": reduce_setCatalogItemsForNamespace,
    "setImpersonation": reduce_setImpersonation,
    "setResourceClaims": reduce_setResourceClaims,
    "setResourceClaimsForNamespace": reduce_setResourceClaimsForNamespace,
    "startSession": reduce_startSession,
    "updateResourceClaim": reduce_updateResourceClaim,
  })
});
