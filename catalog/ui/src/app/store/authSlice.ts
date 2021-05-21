import {
  createAction,
  createReducer,
} from '@reduxjs/toolkit';

import {
  createSelector,
} from 'reselect'

// reducer logic

function reduce_clearImpersonateUser(authState, action) {
  authState.impersonateUser = null;
  authState.catalogNamespaces = authState.authCatalogNamespaces;
  authState.userNamespace = authState.authUserNamespace;
}

function reduce_setImpersonateUser(authState, action) {
  const {user, catalogNamespaces, userNamespace} = action.payload;
  authState.impersonateUser = user;
  authState.catalogNamespaces = catalogNamespaces;
  authState.userNamespace = userNamespace;
}

function reduce_startSession(authState, action) {
  const {admin, user, userNamespace, catalogNamespaces} = action.payload;
  authState.admin = admin;
  authState.authUser = user;
  authState.authUserNamespace = userNamespace;
  authState.authCatalogNamespaces = catalogNamespaces;
  authState.userNamespace = userNamespace;
  authState.catalogNamespaces = catalogNamespaces;
}

export const authReducer = createReducer({}, {
  "auth/clearImpersonateUser": reduce_clearImpersonateUser,
  "auth/setImpersonateUser": reduce_setImpersonateUser,
  "auth/startSession": reduce_startSession,
});


// Action creators
export const actionClearImpersonateUser = createAction("auth/clearImpersonateUser");
export const actionSetImpersonateUser = createAction("auth/setImpersonateUser");
export const actionStartSession = createAction("auth/startSession");


// Selectors
export const selectActiveUser = createSelector(
  state => state.auth,
  auth => auth.impersonateUser || auth.authUser,
)

export const selectAuthUser = createSelector(
  state => state.auth,
  auth => auth.authUser,
)

export const selectImpersonateUser = createSelector(
  state => state.auth,
  auth => auth.impersonateUser,
)

export const selectUserNamespace = createSelector(
  state => state.auth,
  auth => auth.userNamespace,
)

export const selectCatalogNamespaces = createSelector(
  state => state.auth,
  auth => auth.catalogNamespaces,
)
