import { useMemo, useCallback } from 'react';
import { getApiSession } from '@app/api';
import {
  actionStartSession,
  selectCatalogNamespaces,
  selectConsoleURL,
  selectInterface,
  selectServiceNamespaces,
  selectUser,
  selectUserGroups,
  selectUserIsAdmin,
  selectUserNamespace,
} from '@app/store';
import { useDispatch, useSelector } from 'react-redux';
import { AnyAction, Dispatch } from 'redux';
import { CatalogNamespace, UserNamespace } from '@app/types';
import useImpersonateUser from './useImpersonateUser';

async function getSessionFn(dispatch: Dispatch<AnyAction>) {
  const session = await getApiSession();

  dispatch(
    actionStartSession({
      admin: session.admin || false,
      consoleURL: session.consoleURL,
      groups: session.groups || [],
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
    email: string;
    isAdmin: boolean;
    groups: string[];
    catalogNamespaces: CatalogNamespace[];
    consoleUrl: string;
    userInterface: string;
    serviceNamespaces: UserNamespace[];
    userNamespace: UserNamespace;
  };
} {
  const dispatch = useDispatch();
  const email = useSelector(selectUser);
  const isAdmin = useSelector(selectUserIsAdmin);
  const groups = useSelector(selectUserGroups);
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const consoleUrl = useSelector(selectConsoleURL);
  const userInterface = useSelector(selectInterface);
  const serviceNamespaces = useSelector(selectServiceNamespaces);
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

    return { email, isAdmin, groups, catalogNamespaces, consoleUrl, userInterface, serviceNamespaces, userNamespace };
  }, [email, isAdmin, promise, groups, catalogNamespaces, consoleUrl, userInterface, serviceNamespaces, userNamespace]);

  return { getSession };
}
