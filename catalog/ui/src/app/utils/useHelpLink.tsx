import useImpersonateUser from './useImpersonateUser';
import useInterfaceConfig from './useInterfaceConfig';
import useSession from './useSession';

export default function useHelpLink() {
  const { email } = useSession().getSession();
  const { userImpersonated } = useImpersonateUser();
  const { help_link, internal_help_link } = useInterfaceConfig();
  let userEmail = email;
  if (userImpersonated) {
    userEmail = userImpersonated;
  }
  if (userEmail.includes('@redhat.com')) {
    return internal_help_link;
  }
  return help_link;
}
