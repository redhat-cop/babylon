import { publicFetcher } from "@app/api";
import useSWRImmutable from "swr/immutable";
import useSession from "./useSession";

type TInterface = {
    incidents_enabled: boolean,
    ratings_enabled: boolean,
    status_page_id: string,
    help_link: string,
    internal_help_link: string
}
export default function useInterfaceConfig() {
    const { userInterface } = useSession().getSession();
    const { data, error } = useSWRImmutable<TInterface>(`./public/interfaces/${userInterface}.json`, publicFetcher);
    if (error) {
        return {
            incidents_enabled: false,
            ratings_enabled: false,
            status_page_id: null,
            help_link: '',
            internal_help_link: ''
        };
    }
    return data;
  
}
