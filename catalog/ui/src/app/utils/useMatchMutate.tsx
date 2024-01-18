import { apiPaths } from '@app/api';
import { ResourceType } from '@app/types';
import { escapeRegex } from '@app/util';
import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

/**
 * matchMutate can receive a resource type, and apply the bussiness logic to update the affected cache item.
 * Usage:
   const matchMutate = useMatchMutate();
   <button onClick={() => matchMutate([name: 'RESOURCE_CLAIM', arguments: {name: NAME}, data: newObj])}>Revalidate RESOURCE_CLAIM</button>
 */
function useMatchMutate(): (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resources: { name: ResourceType; arguments: any; data: any }[],
) => Promise<any[]> {
  const { cache, mutate } = useSWRConfig();
  return useCallback(
    (resources) => {
      if (!(cache instanceof Map)) {
        throw new Error('matchMutate requires the cache provider to be a Map instance');
      }

      const keys = [];
      for (const resource of resources) {
        const matcher = new RegExp(escapeRegex(apiPaths[resource.name](resource.arguments)));
        for (const key of cache.keys()) {
          if (matcher.test(key)) {
            keys.push({ key, data: resource.data });
          }
        }
      }
      const mutations = keys.map(({ key, data }) => mutate(key, data));
      return Promise.all(mutations);
    },
    [cache, mutate],
  );
}

export default useMatchMutate;
