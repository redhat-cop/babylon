import {
  createAction,
  createReducer,
  configureStore,
} from '@reduxjs/toolkit';

import {
  createSelector,
} from 'reselect'

import {
  listNamespacedCustomObject,
} from '@app/api';

let watchResourceClaimsTimeout = null;
let watchCatalogItemsTimeout = null;

async function refreshCatalogItems(): number {
  const namespaces = selectCatalogNamespaces(store.getState());
  const catalogItems = [];
  let count = 0;
  for (let n=0; n < namespaces.length; ++n) {
    const namespace = namespaces[n];
    const resp = await listNamespacedCustomObject('babylon.gpte.redhat.com', 'v1', namespace.name, 'catalogitems');
    if (resp.items) {
      count += resp.items.length;
      store.dispatch(
        __actionSetCatalogItems({
          namespace: namespace.name,
          catalogItems: resp.items,
        })
      );
    }
  }
  return count;
}

async function refreshResourceClaims(): number {
  const namespaces = selectServiceNamespaces(store.getState());
  const resourceClaims = [];
  let count = 0;
  for (let n=0; n < namespaces.length; ++n) {
    const namespace = namespaces[n];
    const resp = await listNamespacedCustomObject('poolboy.gpte.redhat.com', 'v1', namespace.name, 'resourceclaims');
    if (resp.items) {
      count += resp.items.length;
      store.dispatch(
        __actionSetResourceClaims({
          namespace: namespace.name,
          resourceClaims: resp.items,
        })
      );
    }
  }
  return count;
}

async function __startWatchCatalogItems(): void {
  await refreshCatalogItems();
  watchCatalogItemTimeout = setTimeout(
    refreshCatalogItems,
    // Refresh catalog items every two minutes
    2 * 60 * 1000,
  );
}

function startWatchCatalogItems(): void {
  if (watchCatalogItemsTimeout) {
    clearTimeout(watchCatalogItemsTimeout);
  }
  watchCatalogItemsTimeout = setTimeout(watchCatalogItems, 1);
}

async function watchCatalogItems(): void {
  await refreshCatalogItems();
  watchCatalogItemsTimeout = setTimeout(watchCatalogItems, 60000);
}

function startWatchResourceClaims(): void {
  if (watchResourceClaimsTimeout) {
    clearTimeout(watchResourceClaimsTimeout);
  }
  watchResourceClaimsTimeout = setTimeout(watchResourceClaims, 1);
}

async function watchResourceClaims(): void {
  await refreshResourceClaims();
  watchResourceClaimsTimeout = setTimeout(watchResourceClaims, 5000);
}


// Reducer functions
function reduce_clearImpersonation(state, action) {
  state.impersonate = null;
  state.catalogItems = {};
  state.resourceClaims = {};
  startWatchCatalogItems();
  startWatchResourceClaims();
}

function reduce_deleteResourceClaim(state, action) {
  const {name, namespace} = action.payload;
  if (state.resourceClaims[namespace]) {
    state.resourceClaims[namespace] = state.resourceClaims[namespace].filter(rc => rc.name != name);
  }
}

function reduce_setImpersonation(state, action) {
  const {user, admin, catalogNamespaces, serviceNamespaces, userNamespace} = action.payload;
  state.impersonate = {
    admin: admin,
    user: user,
    catalogNamespaces: catalogNamespaces,
    serviceNamespaces: serviceNamespaces,
    userNamespace: userNamespace,
  };
  state.catalogItems = {};
  state.resourceClaims = {};
  startWatchCatalogItems();
  startWatchResourceClaims();
}

function reduce_setCatalogItems(state, action) {
  const {namespace, catalogItems} = action.payload;
  state.catalogItems[namespace] = catalogItems;
}

function reduce_setResourceClaims(state, action) {
  const {namespace, resourceClaims} = action.payload;
  state.resourceClaims[namespace] = resourceClaims;
}

function reduce_startSession(state, action) {
  const {admin, user, catalogNamespaces, serviceNamespaces, userNamespace} = action.payload;
  state.auth.admin = admin;
  state.auth.user = user;
  state.auth.catalogNamespaces = catalogNamespaces;
  state.auth.serviceNamespaces = serviceNamespaces;
  state.auth.userNamespace = userNamespace;
  state.catalogItems = {};
  state.resourceClaims = {};
  startWatchCatalogItems();
  startWatchResourceClaims();
}


// Action creators
export const actionClearImpersonation = createAction("clearImpersonation");
export const actionSetImpersonation = createAction("setImpersonation");
export const actionStartSession = createAction("startSession");

// Actions reserved for api usage
export const apiActionDeleteResourceClaim = createAction("deleteResourceClaim")

// Private actions
export const __actionSetCatalogItems = createAction("setCatalogItems");
export const __actionSetResourceClaims = createAction("setResourceClaims");


// Selectors
const selectSelf = (state: State) => state

export const selectAuthIsAdmin = createSelector(
  selectSelf,
  state => state.auth.admin,
)

export const selectAuthUser = createSelector(
  selectSelf,
  state => state.auth.user,
)

export const selectUser = createSelector(
  selectSelf,
  state => state.impersonate?.user || state.auth.user,
)

export const selectUserIsAdmin = createSelector(
  selectSelf,
  state => state.impersonate?.admin || state.auth.admin,
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
  state => state.impersonate?.catalogNamespaces || state.auth.catalogNamespaces,
)

export const selectResourceClaims = createSelector(
  selectSelf,
  state => state.resourceClaims,
)

export const selectServiceNamespaces = createSelector(
  selectSelf,
  state => state.impersonate?.serviceNamespaces || state.auth.serviceNamespaces,
)

export const selectUserNamespace = createSelector(
  selectSelf,
  state => state.impersonate?.userNamespace || state.auth.userNamespace,
)


// Store
export const store = configureStore({
  reducer: createReducer({
    auth: {
      admin: false,
      user: null,
      catalogNamespaces: [],
      serviceNamespaces: [],
      userNamespace: null,
    },
    catalogItems: {},
    impersonate: null,
    resourceClaims: {},
  }, {
    "clearImpersonation": reduce_clearImpersonation,
    "deleteResourceClaim": reduce_deleteResourceClaim,
    "setCatalogItems": reduce_setCatalogItems,
    "setImpersonation": reduce_setImpersonation,
    "setResourceClaims": reduce_setResourceClaims,
    "startSession": reduce_startSession,
  })
});
