import { publicFetcher } from '@app/api';
import useSWRImmutable from 'swr/immutable';
import useSession from './useSession';

type TInterface = {
  incidents_enabled: boolean;
  ratings_enabled: boolean;
  status_page_id: string;
  status_page_url: string;
  help_text: string;
  help_link: string;
  internal_help_link: string;
  feedback_link: string;
  learn_more_link: string;
  workshop_support_link: string;
  workshop_support_text: string;
  sfdc_enabled: string;
};
export function useInterface(userInterface: string) {
  const { data, error } = useSWRImmutable<TInterface>(`./public/interfaces/${userInterface}.json`, publicFetcher);
  return { data, error };
}

export default function useInterfaceConfig() {
  const { userInterface } = useSession().getSession();
  const { data, error } = useInterface(userInterface || 'rhpds');
  if (error) {
    return {
      incidents_enabled: false,
      ratings_enabled: false,
      status_page_id: null,
      status_page_url: '',
      help_link: '',
      help_text: '',
      internal_help_link: '',
      feedback_link: '',
      learn_more_link: '',
      workshop_support_link: '',
      workshop_support_text: '',
      sfdc_enabled: true,
    };
  }
  return data;
}
