import { useCallback } from 'react';
import { getUserInfo } from '@app/api';
import { actionClearImpersonation, actionSetImpersonation, selectImpersonationUser } from '@app/store';
import { useDispatch, useSelector } from 'react-redux';
import { AnyAction, Dispatch } from 'redux';

async function setImpersonateUserFn(dispatch: Dispatch<AnyAction>, impersonateUserName: string) {
  sessionStorage.setItem('impersonateUser', impersonateUserName);
  const userInfo = await getUserInfo(impersonateUserName);
  dispatch(
    actionSetImpersonation({
      admin: userInfo.admin,
      user: impersonateUserName,
      groups: userInfo.groups || [],
      catalogNamespaces: userInfo.catalogNamespaces,
      serviceNamespaces: userInfo.serviceNamespaces,
      userNamespace: userInfo.userNamespace,
    })
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
    [dispatch]
  );
  const clearImpersonation = useCallback(() => {
    dispatch(actionClearImpersonation());
  }, [dispatch]);

  return {
    setImpersonation,
    userImpersonated: sessionStorage.getItem('impersonateUser') || userImpersonated,
    clearImpersonation,
  };
};

export default useImpersonateUser;
