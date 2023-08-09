import { createAction, createReducer, configureStore } from '@reduxjs/toolkit';
import { createSelector } from 'reselect';
import { CatalogNamespace, ServiceNamespace } from '@app/types';

export interface ActionSetImpersonation {
  admin: string;
  user: string;
  groups: string[];
  catalogNamespaces: [];
  serviceNamespaces: [];
  userNamespace: [];
}

export interface ActionStartSession {
  admin: boolean;
  consoleURL: string;
  user: string;
  groups: string[];
  roles: string[];
  interface: string;
  catalogNamespaces: CatalogNamespace[];
  serviceNamespaces: ServiceNamespace[];
  userNamespace: ServiceNamespace;
}

// Reducer functions
function reduce_clearImpersonation(state) {
  state.impersonate = null;
  state.catalogItems = null;
  sessionStorage.removeItem('impersonateUser');
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
}

// Action creators
export const actionClearImpersonation = createAction('clearImpersonation');
export const actionSetImpersonation = createAction<ActionSetImpersonation>('setImpersonation');
export const actionStartSession = createAction<ActionStartSession>('startSession');

// Selectors
const selectSelf = (state: any) => state;
const selectAuth = (state: any) => (state.impersonate !== null ? state.impersonate : state.auth);

export const selectAuthIsAdmin = createSelector(selectSelf, (state: any): boolean => state.auth.admin);

export const selectAuthUser = createSelector(selectSelf, (state: any): string => state.auth.user);

export const selectConsoleURL = createSelector(selectSelf, (state: any): string => state.consoleURL);

export const selectInterface = createSelector(selectSelf, (state: any): string => state.interface);

export const selectUser = createSelector(selectAuth, (state: any): string => state.user);

export const selectUserGroups = createSelector(selectAuth, (state: any): string[] =>
  (state.groups || []).filter(Boolean).concat('system:authenticated'),
);

export const selectUserIsAdmin = createSelector(selectAuth, (state: any): boolean => state.admin);

export const selectUserRoles = createSelector(selectAuth, (state: any): string[] =>
  (state.roles || []).filter(Boolean),
);

export const selectImpersonationUser = createSelector(selectSelf, (state: any): string => state.impersonate?.user);

export const selectCatalogNamespace = createSelector(
  [(state: any) => selectCatalogNamespaces(state), (state: any, namespace: string): string => namespace],
  (catalogNamespaces: any, namespace: string): CatalogNamespace =>
    (catalogNamespaces || []).filter(Boolean).find((catalogNamespace) => catalogNamespace.name === namespace),
);

export const selectCatalogNamespaces = createSelector(selectAuth, (state: any): CatalogNamespace[] =>
  (state.catalogNamespaces || []).filter(Boolean),
);

export const selectServiceNamespace = createSelector(
  [(state: any) => state.impersonate || state.auth, (state: any, namespace: string): string => namespace],
  (state: any, namespace: string) => (state.serviceNamespaces || []).filter(Boolean).find((ns) => ns.name == namespace),
);

export const selectServiceNamespaces = createSelector(
  (state: any) => state.impersonate || state.auth,
  (state: any) => (state.serviceNamespaces || []).filter(Boolean),
);

export const selectUserNamespace = createSelector(selectAuth, (state) => state.userNamespace);

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
    },
    {
      clearImpersonation: reduce_clearImpersonation,
      setImpersonation: reduce_setImpersonation,
      startSession: reduce_startSession,
    },
  ),
});
