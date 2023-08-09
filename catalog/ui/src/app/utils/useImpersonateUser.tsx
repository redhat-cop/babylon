import { useCallback } from 'react';
import { getUserInfo } from '@app/api';
import { actionClearImpersonation, actionSetImpersonation, selectImpersonationUser } from '@app/store';
import { useDispatch, useSelector } from 'react-redux';
import { AnyAction, Dispatch } from 'redux';

const KEY = 'impersonateUser';

async function setImpersonateUserFn(dispatch: Dispatch<AnyAction>, impersonateUserName: string) {
  if (sessionStorage.getItem(KEY) !== impersonateUserName) {
    sessionStorage.setItem(KEY, impersonateUserName);
    window.location.reload(); // Reload full page to refresh caches
  }
  const userInfo = await getUserInfo(impersonateUserName);
  dispatch(
    actionSetImpersonation({
      admin: userInfo.admin,
      user: impersonateUserName,
      groups: userInfo.groups || [],
      catalogNamespaces: userInfo.catalogNamespaces,
      serviceNamespaces: userInfo.serviceNamespaces,
      userNamespace: userInfo.userNamespace,
    }),
  );
}
const useImpersonateUser = (): {
  setImpersonation: (impersonateUser: string) => Promise<void>;
  userImpersonated: string | null;
  clearImpersonation: () => void;
} => {
  const dispatch = useDispatch();
  const userImpersonated = useSelector(selectImpersonationUser);
  const setImpersonation = useCallback(
    (impersonateUser: string) => setImpersonateUserFn(dispatch, impersonateUser),
    [dispatch],
  );
  const clearImpersonation = useCallback(() => {
    dispatch(actionClearImpersonation());
    window.location.reload(); // Reload full page to refresh caches
  }, [dispatch]);

  return {
    setImpersonation,
    userImpersonated: sessionStorage.getItem(KEY) || userImpersonated,
    clearImpersonation,
  };
};

export default useImpersonateUser;
