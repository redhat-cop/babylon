const parseDuration = require('parse-duration');

import {
  store,
  apiActionDeleteResourceClaim,
  apiActionInsertResourceClaim,
  apiActionUpdateResourceClaim,
} from '@app/store';
import {
  selectImpersonationUser
} from '@app/store';

async function apiFetch(path:string, opt?:object): any {
  const session = await getApiSession();

  const options = opt ? JSON.parse(JSON.stringify(opt)) : {};
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.headers.Authentication = `Bearer ${session.token}`;

  const impersonateUser = selectImpersonationUser(store.getState());
  if (impersonateUser) {
    options.headers['Impersonate-User'] = impersonateUser;
  }

  const resp = await fetch(path, options);
  // FIXME - Check response code
  return resp;
}

function refreshApiSession(): void {
  window.apiSessionPromise = new Promise((resolve) => {
    fetch('/auth/session')
    .then(response => response.json())
    .then(session => {
      if (window.apiSessionInterval) { clearInterval(window.apiSessionInterval) }
      window.apiSessionInterval = setInterval(refreshApiSession, (session.lifetime - 60) * 1000);
      resolve(session);
    })
    .catch(error => {
      window.location.href = '/?n=' + new Date().getTime();
    })
  });
}

export async function getApiSession(): Promise {
  if (!window.apiSessionPromise) {
    refreshApiSession();
  }
  const session = await window.apiSessionPromise;
  if (window.apiSessionImpersonateUser) {
    session.impersonateUser = window.apiSessionImpersonateUser;
  }
  return session;
}

export async function getUserInfo(user): object {
  const session = await getApiSession();
  const resp = await fetch(
    `/auth/users/${user}`,
    {
      headers: {
        Authentication: `Bearer ${session.token}`,
      }
    }
  );
  return await resp.json();
}

export async function createResourceClaim(definition, opt = {}): object {
  const namespace = definition.metadata.namespace;
  const resourceClaim = await createNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims', definition
  );
  if (!opt.skipUpdateStore) {
    store.dispatch(
      apiActionInsertResourceClaim({
        resourceClaim: resourceClaim,
      })
    );
  }
  return resourceClaim;
}

export async function deleteResourceClaim(resourceClaim): void {
  await deleteNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1',
    resourceClaim.metadata.namespace,
    'resourceclaims',
    resourceClaim.metadata.name
  );
  store.dispatch(apiActionDeleteResourceClaim({
    namespace: resourceClaim.metadata.namespace,
    name: resourceClaim.metadata.name,
  }));
}

export async function patchResourceClaim(
  namespace: string,
  name: string,
  patch: object,
  opt= {},
): object {
  const resourceClaim = await patchNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1', namespace, 'resourceclaims', name, patch
  );
  if (!opt.skipUpdateStore) {
    store.dispatch(
      apiActionInsertResourceClaim({
        resourceClaim: resourceClaim,
      })
    );
  }
  return resourceClaim;
}

export async function scheduleStopForAllResourcesInResourceClaim(resourceClaim, time) {
  const stopDate = new Date(time);
  const patch = {
    spec: JSON.parse(JSON.stringify(resourceClaim.spec))
  }
  for (let i=0; i < patch.spec.resources.length; ++i) {
    patch.spec.resources[i].template.spec.vars.action_schedule.stop = stopDate.toISOString().split('.')[0] + "Z";
  }

  const resp = await patchNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1',
    resourceClaim.metadata.namespace,
    'resourceclaims',
    resourceClaim.metadata.name,
    patch,
  );
  store.dispatch(apiActionUpdateResourceClaim({
    resourceClaim: resp,
  }));
}

export async function setLifespanEndForResourceClaim(resourceClaim, time) {
  const end = new Date(time);
  const endTimestamp = end.toISOString().split('.')[0] + "Z";
  const data = {
    spec: JSON.parse(JSON.stringify(resourceClaim.spec))
  }

  if (data.spec.lifespan) {
    data.spec.lifespan.end = endTimestamp;
  } else {
    data.spec.lifespan = { end: endTimestamp };
  }

  const resp = await patchNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1',
    resourceClaim.metadata.namespace,
    'resourceclaims',
    resourceClaim.metadata.name,
    data,
  );
  store.dispatch(apiActionUpdateResourceClaim({
    resourceClaim: resp,
  }));
}

export async function startAllResourcesInResourceClaim(resourceClaim) {
  const defaultRuntime = Math.min(...resourceClaim.status.resources.map(r =>
    parseDuration(r.state.spec.vars.action_schedule?.default_runtime || '4h')
  ))
  const startDate = new Date();
  const stopDate = new Date(Date.now() + defaultRuntime);
  const data = {
    spec: JSON.parse(JSON.stringify(resourceClaim.spec))
  }
  for (let i=0; i < data.spec.resources.length; ++i) {
    data.spec.resources[i].template.spec.vars.action_schedule.start = startDate.toISOString().split('.')[0] + "Z";
    data.spec.resources[i].template.spec.vars.action_schedule.stop = stopDate.toISOString().split('.')[0] + "Z";
  }

  const resp = await patchNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1',
    resourceClaim.metadata.namespace,
    'resourceclaims',
    resourceClaim.metadata.name,
    data,
  );
  store.dispatch(apiActionUpdateResourceClaim({
    resourceClaim: resp,
  }));
}

export async function stopAllResourcesInResourceClaim(resourceClaim) {
  const stopDate = new Date();
  const data = {
    spec: JSON.parse(JSON.stringify(resourceClaim.spec))
  }
  for (let i=0; i < data.spec.resources.length; ++i) {
    data.spec.resources[i].template.spec.vars.action_schedule.stop = stopDate.toISOString().split('.')[0] + "Z";
  }

  const resp = await patchNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1',
    resourceClaim.metadata.namespace,
    'resourceclaims',
    resourceClaim.metadata.name,
    data,
  );
  store.dispatch(apiActionUpdateResourceClaim({
    resourceClaim: resp,
  }));
}

export async function createNamespacedCustomObject(group, version, namespace, plural, obj): any {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
    {
      method: 'POST',
      body: JSON.stringify(obj),
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );
  return await resp.json();
}

export async function deleteNamespacedCustomObject(group, version, namespace, plural, name): any {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
    {
      method: 'DELETE',
    }
  );
  return await resp.json();
}

export async function getNamespacedCustomObject(group, version, namespace, plural, name): any {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
  );
  return await resp.json();
}

export async function listClusterCustomObject(
  group: string,
  version: string,
  plural: string,
  opt: object,
): object {
  const session = await getApiSession();
  const query_params = {};
  if (opt?.continue) {
    query_params['continue'] = opt.continue;
  }
  if (opt?.limit) {
    query_params['limit'] = opt.limit;
  }
  const query_string = Object.keys(query_params).map(k => `${k}=${encodeURI(query_params[k])}`).join('&');
  const base_url = `/apis/${group}/${version}/${plural}`;
  const url = query_string ? `${base_url}?${query_string}` : base_url;
  const resp = await apiFetch(url);
  return await resp.json();
}

export async function listNamespacedCustomObject(
  group: string,
  version: string,
  namespace: string,
  plural: string,
  opt: object,
): object {
  const session = await getApiSession();
  const query_params = {};
  if (opt?.continue) {
    query_params['continue'] = opt.continue;
  }
  if (opt?.limit) {
    query_params['limit'] = opt.limit;
  }
  const query_string = Object.keys(query_params).map(k => `${k}=${encodeURI(query_params[k])}`).join('&');
  const base_url = `/apis/${group}/${version}/namespaces/${namespace}/${plural}`;
  const url = query_string ? `${base_url}?${query_string}` : base_url;
  const resp = await apiFetch(url);
  return await resp.json();
}

export async function patchNamespacedCustomObject(group, version, namespace, plural, name, patch, patchType='merge'): any {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
      headers: {
        'Content-Type': 'application/' + patchType + '-patch+json',
      }
    }
  );
  return await resp.json();
}
