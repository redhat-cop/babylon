import useSWR from 'swr';
import { apiPaths, fetcher } from '@app/api';

export type WhatsNewPage = {
  id: string;
  title: string;
  body: string;
  version: number | null;
  lastUpdated: string | null;
  createdAt: string | null;
};

export type WhatsNewData = WhatsNewPage & { children: WhatsNewPage[] };

export default function useWhatsNew(enabled = true) {
  return useSWR<WhatsNewData>(enabled ? apiPaths.WHATS_NEW() : null, fetcher, {
    suspense: false,
    refreshInterval: 5 * 60 * 1000,
  });
}
