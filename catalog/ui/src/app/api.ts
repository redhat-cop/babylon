const parseDuration = require('parse-duration');

import {
  store,
  apiActionDeleteResourceClaim,
  apiActionInsertResourceClaim,
  apiActionUpdateResourceClaim,
} from '@app/store';

import {
  selectImpersonationUser,
  selectUserGroups,
  selectUserNamespace,
} from '@app/store';

import {
  checkAccessControl,
  displayName,
  recursiveAssign,
} from '@app/util';

declare var window: Window &
   typeof globalThis & {
    apiSessionPromise?: any,
    apiSessionInterval?: any,
    apiSessionImpersonateUser?: any,
   }

async function apiFetch(path:string, opt?:object): Promise<any> {
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
  if (resp.status >= 400 && resp.status < 600) {
    throw resp;
  }

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

export async function getApiSession(): Promise<any> {
  if (!window.apiSessionPromise) {
    refreshApiSession();
  }
  const session = await window.apiSessionPromise;
  if (window.apiSessionImpersonateUser) {
    session.impersonateUser = window.apiSessionImpersonateUser;
  }
  return session;
}

export async function getUserInfo(user): Promise<any> {
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

export async function createResourceClaim(definition, opt: any = {}): Promise<any> {
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

export interface ServiceRequestParameters {
  catalogItem: any;
  catalogNamespace: any;
  parameters?: Array<any>;
}

export async function createServiceRequest({
  catalogItem,
  catalogNamespace,
  parameters,
}: ServiceRequestParameters): Promise<any> {
  const baseUrl = window.location.href.replace(/^([^/]+\/\/[^\/]+)\/.*/, "$1");
  const session = await getApiSession();
  const userGroups = selectUserGroups(store.getState());
  const userNamespace = selectUserNamespace(store.getState());
  const access = checkAccessControl(catalogItem.spec.accessControl, userGroups);

  const requestResourceClaim = {
    apiVersion: 'poolboy.gpte.redhat.com/v1',
    kind: 'ResourceClaim',
    metadata: {
      annotations: {
        'babylon.gpte.redhat.com/catalogDisplayName': catalogNamespace?.displayName || catalogItem.metadata.namespace,
        'babylon.gpte.redhat.com/catalogItemDisplayName': displayName(catalogItem),
        'babylon.gpte.redhat.com/requester': session.user,
        'babylon.gpte.redhat.com/url': `${baseUrl}/services/item/${userNamespace.name}/${catalogItem.metadata.name}`,
      },
      labels: {
        'babylon.gpte.redhat.com/catalogItemName': catalogItem.metadata.name,
        'babylon.gpte.redhat.com/catalogItemNamespace': catalogItem.metadata.namespace,
      },
      name: catalogItem.metadata.name,
      namespace: userNamespace.name,
    },
    spec: {
      resources: []
    }
  };

  if (catalogItem.spec.userData) {
    requestResourceClaim.metadata.annotations['babylon.gpte.redhat.com/userData'] = JSON.stringify(catalogItem.spec.userData);
  }

  if (access === 'allow') {
    // Once created the ResourceClaim is completely independent of the catalog item.
    // This allows the catalog item to be changed or removed without impacting provisioned
    // services. All relevant configuration from the CatalogItem needs to be copied into
    // the ResourceClaim.

    // Copy resources from catalog item to ResourceClaim
    requestResourceClaim.spec.resources = JSON.parse(JSON.stringify(catalogItem.spec.resources));

    // Add display name annotations for components
    for (const [key, value] of Object.entries(catalogItem.metadata.annotations || {})) {
      if (key.startsWith('babylon.gpte.redhat.com/displayNameComponent')) {
        requestResourceClaim.metadata.annotations[key] = value;
      }
    }

    // Set user catalog item labels if this is a user catalog item
    if (catalogItem.metadata.labels?.['babylon.gpte.redhat.com/userCatalogItem']) {
      requestResourceClaim.metadata.labels['babylon.gpte.redhat.com/userCatalogItem'] = catalogItem.metadata.labels['babylon.gpte.redhat.com/userCatalogItem'];
    }

    // Add bookbag label and annotation if catalog item includes bookbag
    if (catalogItem.spec.bookbag) {
      requestResourceClaim.metadata.labels['babylon.gpte.redhat.com/labUserInterface'] = 'bookbag';
      requestResourceClaim.metadata.annotations['babylon.gpte.redhat.com/bookbag'] = JSON.stringify(catalogItem.spec.bookbag);
    }

    // Add message templates for notifications
    if (catalogItem.spec.messageTemplates) {
      for (const [key, value] of Object.entries(catalogItem.spec.messageTemplates)) {
        // Save CatalogItem message templates in ResourceClaim annotation so
        // that the provisioned service does not depend upon the continued
        // existence of the CatalogItem.
        const annotation = `babylon.gpte.redhat.com/${key}MessageTemplate`;
        requestResourceClaim.metadata.annotations[annotation] = JSON.stringify(value);
      }
    }

    // Copy all parameter values into the ResourceClaim
    if (parameters) {
      for (const parameter of parameters) {
        const varName = parameter.variable || parameter.name;
        for (const resourceIndex in requestResourceClaim.spec.resources) {
          const resource = requestResourceClaim.spec.resources[resourceIndex];
          // Only set parameter if resource index is not set or matches
          if (parameter.resourceIndex == null || resourceIndex == parameter.resourceIndex) {
            recursiveAssign(
              resource,
              {
                template: {
                  spec: {
                    vars: {
                      job_vars: {
                        [varName]: parameter.value,
                      }
                    }
                  }
                }
              }
            )
          }
        }
      }
    }
  } else {
    // No direct access to catalog item. Create the service-request to record
    // the user interest in the catalog item.
    requestResourceClaim.spec.resources[0] = {
      provider: {
        apiVersion: "poolboy.gpte.redhat.com/v1",
        kind: "ResourceProvider",
        name: "babylon-service-request-configmap",
        namespace: "poolboy",
      },
      template: {
        data: {
          catalogItemName: catalogItem.metadata.name,
          catalogItemNamespace: catalogItem.metadata.namespace,
          parameters: JSON.stringify(parameters),
        },
        metadata: {
          labels: {
            "babylon.gpte.redhat.com/catalogItem": catalogItem.metadata.name,
          }
        }
      }
    }
  }

  let n = 0;
  let resourceClaim = null;
  while (!resourceClaim) {
    try {
      return await createResourceClaim(requestResourceClaim);
    } catch(error: any) {
      if (error.status === 409) {
	n++;
        requestResourceClaim.metadata.name = `${catalogItem.metadata.name}-${n}`;
        requestResourceClaim.metadata.annotations['babylon.gpte.redhat.com/url'] = `${baseUrl}/services/item/${userNamespace.name}/${catalogItem.metadata.name}-${n}`;
      } else {
	throw error;
      }
    }
  }
}

export async function deleteResourceClaim(resourceClaim): Promise<void> {
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
  opt: any= {},
): Promise<object> {
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

export async function createNamespacedCustomObject(group, version, namespace, plural, obj): Promise<any> {
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

export async function deleteNamespacedCustomObject(group, version, namespace, plural, name): Promise<any> {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/apis/${group}/${version}/namespaces/${namespace}/${plural}/${name}`,
    {
      method: 'DELETE',
    }
  );
  return await resp.json();
}

export async function getNamespacedCustomObject(group, version, namespace, plural, name): Promise<any> {
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
  opt: any,
): Promise<any> {
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
  opt: any,
): Promise<any> {
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

export async function patchNamespacedCustomObject(group, version, namespace, plural, name, patch, patchType='merge'): Promise<any> {
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

export async function getOpenStackServersForResourceClaim(resourceClaim): Promise<any> {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/api/service/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}/openstack/servers`,
  );
  return await resp.json();
}

export async function rebootOpenStackServer(resourceClaim, projectId, serverId): Promise<any> {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/api/service/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}/openstack/server/${projectId}/${serverId}/reboot`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );
  return await resp.json();
}

export async function startOpenStackServer(resourceClaim, projectId, serverId): Promise<any> {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/api/service/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}/openstack/server/${projectId}/${serverId}/start`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );
  return await resp.json();
}

export async function stopOpenStackServer(resourceClaim, projectId, serverId): Promise<any> {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/api/service/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}/openstack/server/${projectId}/${serverId}/stop`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );
  return await resp.json();
}

export async function startOpenStackServerConsoleSession(resourceClaim, projectId, serverId): Promise<any> {
  const session = await getApiSession();
  const resp = await apiFetch(
    `/api/service/${resourceClaim.metadata.namespace}/${resourceClaim.metadata.name}/openstack/server/${projectId}/${serverId}/console`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
      }
    }
  );
  return await resp.json();
}
