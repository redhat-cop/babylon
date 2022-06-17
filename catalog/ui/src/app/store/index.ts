import { createAction, createReducer, configureStore } from '@reduxjs/toolkit';

import { createSelector } from 'reselect';

import { listResourceClaims } from '@app/api';

import { CatalogNamespace, ResourceClaim, ResourceClaimList, ServiceNamespace } from '@app/types';

let watchResourceClaimsTimeout: null | ReturnType<typeof setTimeout> = null;

export interface ActionSetImpersonation {
  admin: string;
  user: string;
  groups: [string];
  catalogNamespaces: [];
  serviceNamespaces: [];
  userNamespace: [];
}

export interface ActionStartSession {
  admin: boolean;
  consoleURL: string;
  user: string;
  groups: [string];
  interface: string;
  catalogNamespaces: CatalogNamespace[];
  serviceNamespaces: ServiceNamespace[];
  userNamespace: ServiceNamespace;
}

export interface ActionSetResourceClaims {
  resourceClaims: ResourceClaimsByNamespace;
}

export interface ActionSetResourceClaimsForNamespace {
  namespace: string;
  resourceClaims: ResourceClaim[];
}

interface ResourceClaimsByNamespace {
  [key: string]: ResourceClaim[];
}

async function refreshResourceClaimsFromNamespace(
  namespace: string,
  triggeredByTimeout: ReturnType<typeof setTimeout>
): Promise<void> {
  const resourceClaims: ResourceClaim[] = [];
  let _continue: string = '';
  while (true) {
    const resp: ResourceClaimList = await listResourceClaims({
      continue: _continue,
      limit: 100,
      namespace: namespace,
    });
    // If resource claims timeout has changed then this refresh should abort.
    if (watchResourceClaimsTimeout !== triggeredByTimeout) {
      return;
    }
    if (!resp.items) {
      break;
    }
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
  const serviceNamespaceNames: string[] = selectServiceNamespaces(state).map((n) => n.name);

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
  const triggeredByTimeout: ReturnType<typeof setTimeout> = watchResourceClaimsTimeout;
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
  startWatchResourceClaims();
  sessionStorage.removeItem('impersonateUser');
}

function reduce_deleteResourceClaim(state, action) {
  const { name, namespace } = action.payload;
  if (state.resourceClaims?.[namespace]) {
    state.resourceClaims[namespace] = state.resourceClaims[namespace].filter((rc) => rc.metadata.name != name);
  }
}

function reduce_insertResourceClaim(state, action) {
  const { resourceClaim } = action.payload;
  const namespace = resourceClaim.metadata.namespace;
  if (state.resourceClaims?.[namespace]) {
    state.resourceClaims[namespace].push(resourceClaim);
  } else if (state.resourceClaims) {
    state.resourceClaims[namespace] = [resourceClaim];
  } else {
    state.resourceClaims = {
      [namespace]: [resourceClaim],
    };
  }
}

function reduce_setImpersonation(state, action) {
  const { admin, groups, roles, user, catalogNamespaces, serviceNamespaces, userNamespace } = action.payload;
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
  startWatchResourceClaims();
}

function reduce_setResourceClaims(state, action) {
  const { resourceClaims } = action.payload;
  state.resourceClaims = resourceClaims;
}

function reduce_setResourceClaimsForNamespace(state, action) {
  const { namespace, resourceClaims } = action.payload;
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
  startWatchResourceClaims();
}

function reduce_updateResourceClaim(state, action) {
  const { resourceClaim } = action.payload;
  if (state.resourceClaims?.[resourceClaim.metadata.namespace]) {
    const resourceClaims = state.resourceClaims[resourceClaim.metadata.namespace];
    if (resourceClaims) {
      for (let i = 0; i < resourceClaims.length; ++i) {
        if (resourceClaim.metadata.name === resourceClaims[i].metadata.name) {
          if (resourceClaim.metadata.resourceVersion > (resourceClaims[i].metadata.resourceVersion || 0)) {
            resourceClaims[i] = resourceClaim;
          }
          break;
        }
      }
    }
  }
}

// Action creators
export const actionClearImpersonation = createAction('clearImpersonation');
export const actionSetImpersonation = createAction<ActionSetImpersonation>('setImpersonation');
export const actionStartSession = createAction<ActionStartSession>('startSession');

// TODO: udpate types:: visibilty of types not available
// Actions reserved for api usage
export const apiActionDeleteResourceClaim = createAction<any>('deleteResourceClaim');
export const apiActionInsertResourceClaim = createAction<any>('insertResourceClaim');
export const apiActionUpdateResourceClaim = createAction<any>('updateResourceClaim');

// Private actions
export const __actionSetResourceClaims = createAction<ActionSetResourceClaims>('setResourceClaims');
export const __actionSetResourceClaimsForNamespace = createAction<ActionSetResourceClaimsForNamespace>(
  'setResourceClaimsForNamespace'
);

// Selectors
const selectSelf = (state: any) => state;
const selectAuth = (state: any) => (state.impersonate !== null ? state.impersonate : state.auth);

export const selectAuthIsAdmin = createSelector(selectSelf, (state: any): boolean => state.auth.admin);

export const selectAuthUser = createSelector(selectSelf, (state: any): string => state.auth.user);

export const selectConsoleURL = createSelector(selectSelf, (state: any): string => state.consoleURL);

export const selectInterface = createSelector(selectSelf, (state: any): string => state.interface);

export const selectUser = createSelector(selectAuth, (state: any): string => state.user);

export const selectUserGroups = createSelector(selectAuth, (state: any): string[] =>
  (state.groups || []).filter(Boolean).concat('system:authenticated')
);

export const selectUserIsAdmin = createSelector(selectAuth, (state: any): boolean => state.admin);

export const selectUserRoles = createSelector(selectAuth, (state: any): string[] =>
  (state.roles || []).filter(Boolean)
);

export const selectImpersonationUser = createSelector(selectSelf, (state: any): string => state.impersonate?.user);

export const selectCatalogNamespace = createSelector(
  [(state: any) => selectCatalogNamespaces(state), (state: any, namespace: string): string => namespace],
  (catalogNamespaces: any, namespace: string): CatalogNamespace =>
    (catalogNamespaces || []).filter(Boolean).find((catalogNamespace) => catalogNamespace.name === namespace)
);

export const selectCatalogNamespaces = createSelector(selectAuth, (state: any): CatalogNamespace[] =>
  (state.catalogNamespaces || []).filter(Boolean)
);

export const selectResourceClaim = createSelector(
  [(state: any) => state.resourceClaims, (state: any, namespace: string, name: string): string[] => [namespace, name]],
  (resourceClaims: any, args: string[]): ResourceClaim => {
    const [namespace, name] = args;
    return (resourceClaims?.[namespace] || []).find((resourceClaim) => resourceClaim.metadata.name === name);
  }
);

export const selectResourceClaims = createSelector(selectSelf, (state: any): ResourceClaim[] => {
  if (!state.resourceClaims) {
    return [];
  }
  const namespaceNames = Object.keys(state.resourceClaims);
  namespaceNames.sort();
  const resourceClaims = [];
  for (const ns of namespaceNames) {
    resourceClaims.push(...state.resourceClaims[ns]);
  }
  return resourceClaims;
});

export const selectResourceClaimsInNamespace = createSelector(
  [(state: any) => state.resourceClaims, (state: any, namespace: string): string => namespace],
  (resourceClaims: any, namespace: string): ResourceClaim[] => resourceClaims?.[namespace] || []
);

export const selectServiceNamespace = createSelector(
  [(state: any) => state.impersonate || state.auth, (state: any, namespace: string): string => namespace],
  (state: any, namespace: string) => (state.serviceNamespaces || []).filter(Boolean).find((ns) => ns.name == namespace)
);

export const selectServiceNamespaces = createSelector(
  (state: any) => state.impersonate || state.auth,
  (state: any) => (state.serviceNamespaces || []).filter(Boolean)
);

export const selectUserNamespace = createSelector(selectAuth, (state) => state.userNamespace);

export const selectWorkshopNamespaces = createSelector(
  (state: any) => state.impersonate || state.auth,
  (state: any) => (state.serviceNamespaces || []).filter(Boolean).filter((ns) => ns.workshopProvisionAccess)
);

// Store
export const store = configureStore({
  reducer: createReducer(
    {
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
    },
    {
      clearImpersonation: reduce_clearImpersonation,
      deleteResourceClaim: reduce_deleteResourceClaim,
      insertResourceClaim: reduce_insertResourceClaim,
      setImpersonation: reduce_setImpersonation,
      setResourceClaims: reduce_setResourceClaims,
      setResourceClaimsForNamespace: reduce_setResourceClaimsForNamespace,
      startSession: reduce_startSession,
      updateResourceClaim: reduce_updateResourceClaim,
    }
  ),
});
