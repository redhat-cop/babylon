function refreshApiSession(): void {
  window.apiSessionPromise = new Promise((resolve) => {
    fetch('/session')
    .then(response => response.json())
    .then(session => {
      if (window.apiSessionInterval) { clearInterval(window.apiSessionInterval) }
      window.apiSessionInterval = setInterval(refreshApiSession, (session.lifetime - 60) * 1000);
      resolve(session);
    })
  });
}

export function getApiSession(): Promise {
  if (window.apiSessionPromise) { return window.apiSessionPromise }
  refreshApiSession();
  return window.apiSessionPromise;
}

export async function createNamespacedCustomObject(group, version, namespace, plural, obj): any {
  const session = await getApiSession();
  const resp = await fetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
    {
      method: 'POST',
      body: JSON.stringify(obj),
      headers: {
        'Authentication': `Bearer ${session.token}`,
	'Content-Type': 'application/json',
      }
    }
  );
  // FIXME - Check response code
  return await resp.json();
}

export async function deleteNamespacedCustomObject(group, version, namespace, plural, name): any {
  const session = await getApiSession();
  const resp = await fetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
    {
      method: 'DELETE',
      headers: {
        'Authentication': `Bearer ${session.token}`
      }
    }
  );
  // FIXME - Check response code
  return await resp.json();
}

export async function getNamespacedCustomObject(group, version, namespace, plural, name): any {
  const session = await getApiSession();
  const resp = await fetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
    {
      headers: {
        'Authentication': `Bearer ${session.token}`
      }
    }
  );
  // FIXME - Check response code
  return await resp.json();
}

export async function listNamespacedCustomObject(group, version, namespace, plural): any {
  const session = await getApiSession();
  const resp = await fetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}`,
    {
      headers: {
        'Authentication': `Bearer ${session.token}`
      }
    }
  );
  // FIXME - Check response code
  return await resp.json();
}
