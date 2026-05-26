import { useCallback } from 'react';
import { getUserInfo } from '@app/api';
import {
  actionClearImpersonation,
  actionSetImpersonation,
  selectImpersonationUser,
  useAppDispatch,
  useAppSelector,
  AppDispatch,
} from '@app/store';

const KEY = 'impersonateUser';

async function setImpersonateUserFn(dispatch: AppDispatch, impersonateUserName: string) {
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
  const dispatch = useAppDispatch();
  const userImpersonated = useAppSelector(selectImpersonationUser);
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
