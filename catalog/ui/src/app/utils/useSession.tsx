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
  selectWorkshopNamespaces,
} from '@app/store';
import { useDispatch, useSelector } from 'react-redux';
import { AnyAction, Dispatch } from 'redux';
import { CatalogNamespace, ServiceNamespace, UserNamespace } from '@app/types';
import useImpersonateUser from './useImpersonateUser';

async function getSessionFn(dispatch: Dispatch<AnyAction>) {
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
    })
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
    workshopNamespaces: ServiceNamespace[];
    userNamespace: UserNamespace;
  };
} {
  const dispatch = useDispatch();
  const authUser = useSelector(selectAuthUser);
  const email = useSelector(selectUser);
  const isAdmin = useSelector(selectUserIsAdmin);
  const groups = useSelector(selectUserGroups);
  const roles = useSelector(selectUserRoles);
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const consoleUrl = useSelector(selectConsoleURL);
  const userInterface = useSelector(selectInterface);
  const serviceNamespaces = useSelector(selectServiceNamespaces);
  const workshopNamespaces = useSelector(selectWorkshopNamespaces);
  const userNamespace = useSelector(selectUserNamespace);
  const { userImpersonated } = useImpersonateUser();

  const promise = useMemo(() => {
    if (!email && !userImpersonated) {
      return getSessionFn(dispatch);
    }
    if (email) {
      return Promise.resolve();
    }
    return new Promise(() => null);
  }, [dispatch, email, userImpersonated]);

  const getSession = useCallback(() => {
    if (!email) {
      throw promise;
    }

    return {
      authUser,
      email,
      isAdmin,
      groups,
      roles,
      catalogNamespaces,
      consoleUrl,
      userInterface,
      serviceNamespaces,
      workshopNamespaces,
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
    workshopNamespaces,
    userNamespace,
  ]);

  return { getSession };
}
