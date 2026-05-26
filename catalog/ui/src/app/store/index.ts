import { createAction, createReducer, configureStore, createSelector } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { CatalogNamespace, ServiceNamespace, UserNamespace } from '@app/types';

export interface ActionSetImpersonation {
  admin: boolean;
  user: string;
  groups: string[];
  catalogNamespaces: CatalogNamespace[];
  serviceNamespaces: ServiceNamespace[];
  userNamespace: UserNamespace;
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

// Action creators
export const actionClearImpersonation = createAction('clearImpersonation');
export const actionSetImpersonation = createAction<ActionSetImpersonation>('setImpersonation');
export const actionStartSession = createAction<ActionStartSession>('startSession');

// State type
interface AppState {
  auth: {
    admin: boolean | null;
    groups: string[];
    user: string | null;
    catalogNamespaces: CatalogNamespace[];
    serviceNamespaces: ServiceNamespace[];
    userNamespace: UserNamespace | null;
    roles?: string[];
  };
  catalogItems: unknown[] | null;
  impersonate: {
    admin: boolean;
    groups: string[];
    roles: string[];
    user: string;
    catalogNamespaces: CatalogNamespace[];
    serviceNamespaces: ServiceNamespace[];
    userNamespace: UserNamespace;
  } | null;
  interface: string | null;
  consoleURL?: string;
  resourceClaims?: unknown[] | null;
}

const initialState: AppState = {
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
};

const rootReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(actionClearImpersonation, (state) => {
      state.impersonate = null;
      state.catalogItems = null;
      sessionStorage.removeItem('impersonateUser');
    })
    .addCase(actionSetImpersonation, (state, action) => {
      const { admin, groups, user, catalogNamespaces, serviceNamespaces, userNamespace } = action.payload;
      state.impersonate = {
        admin: admin || false,
        groups: groups || [],
        roles: (action.payload as ActionSetImpersonation & { roles?: string[] }).roles || [],
        user,
        catalogNamespaces,
        serviceNamespaces,
        userNamespace,
      };
      state.catalogItems = null;
      state.resourceClaims = null;
    })
    .addCase(actionStartSession, (state, action) => {
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
    });
});

// Store
export const store = configureStore({
  reducer: rootReducer,
});

// Typed hooks and type exports
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

// Selectors
const selectSelf = (state: RootState) => state;
const selectAuth = (state: RootState) => (state.impersonate !== null ? state.impersonate : state.auth);

export const selectAuthIsAdmin = createSelector(selectSelf, (state): boolean => state.auth.admin);

export const selectAuthUser = createSelector(selectSelf, (state): string => state.auth.user);

export const selectConsoleURL = createSelector(selectSelf, (state): string => state.consoleURL);

export const selectInterface = createSelector(selectSelf, (state): string => state.interface);

export const selectUser = createSelector(selectAuth, (state): string => state.user);

export const selectUserGroups = createSelector(selectAuth, (state): string[] =>
  (state.groups || []).filter(Boolean).concat('system:authenticated'),
);

export const selectUserIsAdmin = createSelector(selectAuth, (state): boolean => state.admin);

export const selectUserRoles = createSelector(selectAuth, (state): string[] =>
  (state.roles || []).filter(Boolean),
);

export const selectImpersonationUser = createSelector(selectSelf, (state): string => state.impersonate?.user);

export const selectCatalogNamespace = createSelector(
  [(state: RootState) => selectCatalogNamespaces(state), (_state: RootState, namespace: string): string => namespace],
  (catalogNamespaces, namespace: string): CatalogNamespace =>
    (catalogNamespaces || []).filter(Boolean).find((catalogNamespace) => catalogNamespace.name === namespace),
);

export const selectCatalogNamespaces = createSelector(selectAuth, (state): CatalogNamespace[] =>
  (state.catalogNamespaces || []).filter(Boolean),
);

export const selectServiceNamespace = createSelector(
  [(state: RootState) => state.impersonate || state.auth, (_state: RootState, namespace: string): string => namespace],
  (state, namespace: string) =>
    ((state as AppState['auth']).serviceNamespaces || []).filter(Boolean).find((ns) => ns.name == namespace),
);

export const selectServiceNamespaces = createSelector(
  (state: RootState) => state.impersonate || state.auth,
  (state) => ((state as AppState['auth']).serviceNamespaces || []).filter(Boolean),
);

export const selectUserNamespace = createSelector(selectAuth, (state) => state.userNamespace);
