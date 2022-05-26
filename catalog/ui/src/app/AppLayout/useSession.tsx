import { useMemo, useCallback } from 'react';
import { getApiSession } from '@app/api';
import { actionStartSession, selectAuthIsAdmin, selectAuthUser } from '@app/store';
import { useDispatch, useSelector } from 'react-redux';
import { AnyAction, Dispatch } from 'redux';

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

export default function useSession(): { getSession: () => { email: string; isAdmin: boolean } } {
  const dispatch = useDispatch();
  const email: string = useSelector(selectAuthUser);
  const isAdmin = useSelector(selectAuthIsAdmin);
  const promise = useMemo(() => getSessionFn(dispatch), [dispatch]);

  const getSession = useCallback(() => {
    if (!email) {
      throw promise;
    }

    return { email, isAdmin };
  }, [email, isAdmin, promise]);

  return { getSession };
}
