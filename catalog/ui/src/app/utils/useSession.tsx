import { useMemo, useCallback } from 'react';
import { getApiSession } from '@app/api';
import {
  actionStartSession,
  selectAuthUser,
  selectCatalogNamespaces,
  selectConsoleURL,
  selectInterface,
  selectServiceNamespaces,
  selectUser,
  selectUserGroups,
  selectUserIsAdmin,
  selectUserNamespace,
  selectUserRoles,
  useAppDispatch,
  useAppSelector,
  AppDispatch,
} from '@app/store';
import { CatalogNamespace, ServiceNamespace, UserNamespace } from '@app/types';
import useImpersonateUser from './useImpersonateUser';

async function getSessionFn(dispatch: AppDispatch) {
  const session = await getApiSession();

  dispatch(
    actionStartSession({
      admin: session.admin || false,
      consoleURL: session.consoleURL,
      groups: session.groups || [],
      roles: session.roles || [],
      interface: session.interface,
      user: session.user,
      catalogNamespaces: session.catalogNamespaces,
      serviceNamespaces: session.serviceNamespaces,
      userNamespace: session.userNamespace,
    }),
  );
}

export default function useSession(): {
  getSession: () => {
    authUser: string;
    email: string;
    isAdmin: boolean;
    groups: string[];
    roles: string[];
    catalogNamespaces: CatalogNamespace[];
    consoleUrl: string;
    userInterface: string;
    serviceNamespaces: ServiceNamespace[];
    userNamespace: UserNamespace;
  };
} {
  const dispatch = useAppDispatch();
  const authUser = useAppSelector(selectAuthUser);
  const email = useAppSelector(selectUser);
  const isAdmin = useAppSelector(selectUserIsAdmin);
  const groups = useAppSelector(selectUserGroups);
  const roles = useAppSelector(selectUserRoles);
  const catalogNamespaces = useAppSelector(selectCatalogNamespaces);
  const consoleUrl = useAppSelector(selectConsoleURL);
  const userInterface = useAppSelector(selectInterface);
  const serviceNamespaces = useAppSelector(selectServiceNamespaces);
  const userNamespace = useAppSelector(selectUserNamespace);
  const { userImpersonated, setImpersonation } = useImpersonateUser();

  const promise = useMemo(async () => {
    if (userImpersonated && !email) {
      const session = getSessionFn(dispatch);
      await setImpersonation(userImpersonated);
      return session;
    } else if (!email) {
      return getSessionFn(dispatch);
    }
    return Promise.resolve();
  }, [dispatch, email]);

  const getSession = useCallback(() => {
    if (!email) {
      throw promise;
    }

    return {
      authUser,
      email: userImpersonated ? userImpersonated : email,
      isAdmin,
      groups,
      roles,
      catalogNamespaces,
      consoleUrl,
      userInterface,
      serviceNamespaces,
      userNamespace,
    };
  }, [
    authUser,
    email,
    isAdmin,
    promise,
    groups,
    roles,
    catalogNamespaces,
    consoleUrl,
    userInterface,
    serviceNamespaces,
    userNamespace,
  ]);

  return { getSession };
}
