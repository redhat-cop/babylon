import { useMemo, useCallback } from 'react';
import { getApiSession } from '@app/api';
import {
  actionStartSession,
  selectAuthIsAdmin,
  selectAuthUser,
  selectCatalogNamespaces,
  selectConsoleURL,
  selectInterface,
  selectServiceNamespaces,
  selectUserGroups,
  selectUserNamespace,
} from '@app/store';
import { useDispatch, useSelector } from 'react-redux';
import { AnyAction, Dispatch } from 'redux';
import { CatalogNamespace, UserNamespace } from '@app/types';

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
    serviceNampesaces: UserNamespace[];
    userNamespace: UserNamespace;
  };
} {
  const dispatch = useDispatch();
  const email: string = useSelector(selectAuthUser);
  const isAdmin = useSelector(selectAuthIsAdmin);
  const groups = useSelector(selectUserGroups);
  const catalogNamespaces = useSelector(selectCatalogNamespaces);
  const consoleUrl = useSelector(selectConsoleURL);
  const userInterface = useSelector(selectInterface);
  const serviceNampesaces = useSelector(selectServiceNamespaces);
  const userNamespace = useSelector(selectUserNamespace);

  const promise = useMemo(() => {
    if (!email) {
      return getSessionFn(dispatch);
    }
    return Promise.resolve();
  }, [dispatch, email]);

  const getSession = useCallback(() => {
    if (!email) {
      throw promise;
    }

    return { email, isAdmin, groups, catalogNamespaces, consoleUrl, userInterface, serviceNampesaces, userNamespace };
  }, [email, isAdmin, promise, groups, catalogNamespaces, consoleUrl, userInterface, serviceNampesaces, userNamespace]);

  return { getSession };
}
