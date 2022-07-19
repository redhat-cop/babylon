import { useSWRConfig } from 'swr';
import { ScopedMutator } from 'swr/dist/types';

/**
 * matchMutate can receive a regex expression as key, and be used to mutate the ones who matched this pattern.
 * Usage:
   const matchMutate = useMatchMutate();
   <button onClick={() => matchMutate(/^\/api\//)}>Revalidate all keys start with "/api/"</button>
 */
function useMatchMutate(): (matcher: RegExp) => Promise<ScopedMutator[]> {
  const { cache, mutate } = useSWRConfig();
  return (matcher, ...args) => {
    if (!(cache instanceof Map)) {
      throw new Error('matchMutate requires the cache provider to be a Map instance');
    }

    const keys = [];

    for (const key of cache.keys()) {
      if (matcher.test(key)) {
        keys.push(key);
      }
    }

    const mutations = keys.map((key) => mutate(key, ...args));
    return Promise.all(mutations);
  };
}

export default useMatchMutate;
