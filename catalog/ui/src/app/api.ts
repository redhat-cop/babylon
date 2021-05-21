import {
  store,
  apiActionDeleteResourceClaim,
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

export async function deleteResourceClaim(namespace, name): void {
  await deleteNamespacedCustomObject(
    'poolboy.gpte.redhat.com', 'v1',
    namespace,
    'resourceclaims',
    name
  );
  store.dispatch(apiActionDeleteResourceClaim({
    namespace: namespace,
    name: name,
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

export async function listClusterCustomObject(group, version, plural): any {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/apis/${group}/${version}/${plural}`,
  );
  return await resp.json();
}

export async function listNamespacedCustomObject(group, version, namespace, plural): any {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}`,
  );
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
