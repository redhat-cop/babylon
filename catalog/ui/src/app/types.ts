export interface AnarchyAction extends K8sObject {
  spec: any;
  status?: any;
}

export interface AnarchyActionList {
  items: AnarchyAction[];
  metadata: K8sObjectListMeta;
}

export interface AnarchyGovernor extends K8sObject {
  spec: any;
  status?: any;
}

export interface AnarchyGovernorList {
  items: AnarchyGovernor[];
  metadata: K8sObjectListMeta;
}

export interface AnarchyRun extends K8sObject {
  spec: any;
  status?: any;
}

export interface AnarchyRunList {
  items: AnarchyRun[];
  metadata: K8sObjectListMeta;
}

export interface AnarchyRunner extends K8sObject {
  spec: any;
  status?: any;
}

export interface AnarchyRunnerList {
  items: AnarchyRunner[];
  metadata: K8sObjectListMeta;
}

export interface AnarchySubject extends K8sObject {
  spec: AnarchySubjectSpec;
  status?: AnarchySubjectStatus;
  data?: any;
}

export interface AnarchySubjectSpecActionSchedule {
  default_runtime?: string;
  maximum_runtime?: string;
  start?: string;
  stop?: string;
}
export interface AnarchySubjectSpec {
  governor?: string;
  varSecrets?: VarSecret[];
  vars?: {
    action_schedule?: AnarchySubjectSpecActionSchedule;
    current_state: string;
    desired_state: string;
    provision_data?: any;
    status_messages?: string[];
    status_data?: any;
    job_vars?: {
      guid: string;
      uuid: string;
    };
    healthy?: boolean;
    check_status_state?: string;
    provision_messages?: string[];
  };
}

export interface VarSecret {
  name: string;
  namespace?: string;
  var?: string;
}

export interface AnarchySubjectList {
  items: AnarchySubject[];
  metadata: K8sObjectListMeta;
}

export type AnarchySubjectSupportedActions = {
  start?: unknown;
  stop?: unknown;
  status?: unknown;
  destroy?: unknown;
  provision?: unknown;
};
export interface AnarchySubjectStatus {
  towerJobs?: { [jobName: string]: AnarchySubjectStatusTowerJob };
  supportedActions?: AnarchySubjectSupportedActions;
  diffBase?: string;
  pendingActions?: unknown[];
  runs?: unknown;
}

export interface AnarchySubjectStatusTowerJob {
  towerJobURL?: string;
  completeTimestamp?: string;
  startTimestamp?: string;
}

export interface CatalogItem extends K8sObject {
  spec: CatalogItemSpec;
  status?: {
    rating?: number;
    provisionHistory?: { result?: string }[];
  };
}

export interface CatalogItemList {
  items: CatalogItem[];
  metadata: K8sObjectListMeta;
}

export type AccessControl = {
  denyGroups: string[];
  allowGroups: string[];
  viewOnlyGroups: string[];
};
export interface CatalogItemSpec {
  accessControl?: AccessControl;
  bookbag?: any;
  messageTemplates?: any;
  multiuser?: boolean;
  workshopUiDisabled?: boolean;
  parameters?: CatalogItemSpecParameter[];
  provisionTimeEstimate?: string;
  resources?: any[];
  termsOfService?: string;
  userData?: any;
  lifespan?: CatalogItemSpecLifespan;
  lastUpdate?: CatalogItemSpecLastUpdate;
  runtime?: CatalogItemSpecRuntime;
}

export interface CatalogItemSpecParameter {
  annotation?: string;
  description?: string;
  formLabel?: string;
  formGroup?: string;
  formDisableCondition?: string;
  formHideCondition?: string;
  formRequireCondition?: string;
  name: string;
  openAPIV3Schema?: any;
  required?: boolean;
  resourceIndexes?: (number | '@')[];
  validation?: string;
  value?: string;
  variable?: string;
}

export interface CatalogNamespace {
  description: string;
  displayName: string;
  name: string;
}

export interface JSONPatch extends Array<JSONPatchOperation> {}
export interface JSONPatchOperation {
  op: 'add' | 'copy' | 'remove' | 'replace' | 'test';
  from?: string;
  path: string;
  value?: any;
}

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  data?: any;
}

export interface K8sObjectList {
  items: K8sObject[];
  metadata: K8sObjectListMeta;
}

export interface K8sObjectListMeta {
  continue?: string;
}

export interface K8sObjectMeta {
  annotations?: Record<string, string>;
  creationTimestamp?: string;
  deletionTimestamp?: string;
  finalizers?: string[];
  labels?: Record<string, string>;
  name: string;
  namespace?: string;
  ownerReferences?: K8sOwnerReference[];
  resourceVersion?: string;
  uid?: string;
}

export interface K8sObjectReference {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
  uid?: string;
}

export interface K8sOwnerReference {
  apiVersion: string;
  controller?: boolean;
  kind: string;
  name: string;
  uid: string;
}

export interface Namespace extends K8sObject {}

export interface UserNamespace {
  displayName: string;
  name: string;
  requester: string;
  workshopProvisionAccess: boolean;
}
export interface NamespaceList {
  items: Namespace[];
  metadata: K8sObjectListMeta;
}

export interface ResourceHandleResource {
  name: string;
  provider: K8sObjectReference;
  state: AnarchySubject;
}
export interface ResourceClaim extends K8sObject {
  spec: ResourceClaimSpec;
  status?: {
    lifespan: ResourceClaimStatusLifespan;
    resourceHandle: K8sObjectReference;
    resources: ResourceHandleResource[];
  };
}

export interface ResourceClaimList {
  items: ResourceClaim[];
  metadata: K8sObjectListMeta;
}

export interface ResourceClaimSpec {
  lifespan?: ResourceClaimSpecLifespan;
  resources: ResourceClaimSpecResource[];
}

export interface ResourceClaimSpecLifespan {
  end?: string;
  start?: string;
}

export type ResourceClaimSpecResourceActionSchedule = {
  start?: string;
  stop?: string;
};

export type ResourceClaimSpecResourceTemplate = {
  spec?: {
    vars?: {
      action_schedule?: ResourceClaimSpecResourceActionSchedule;
      check_status_request_timestamp?: string;
      desired_state?: string;
    };
  };
  metadata?: any;
  data?: any;
};

export interface ResourceClaimSpecResource {
  name?: string;
  provider?: K8sObjectReference;
  template: ResourceClaimSpecResourceTemplate;
}

export interface ResourceHandle extends K8sObject {
  spec: ResourceHandleSpec;
}

export interface ResourceHandleList {
  items: ResourceHandle[];
  metadata: K8sObjectListMeta;
}

export interface ResourceHandleSpec {
  lifespan?: ResourceHandleSpecLifespan;
  resourceClaim?: K8sObjectReference;
  resourcePool?: K8sObjectReference;
  resources: ResourceHandleSpecResource[];
}

export interface ResourceHandleSpecLifespan {
  default: string;
  end: string;
  maximum: string;
  relativeMaximum: string;
}

export interface ResourceHandleSpecResource {
  name?: string;
  provider: K8sObjectReference;
  reference?: K8sObjectReference;
  template?: any;
}

export interface ResourcePool extends K8sObject {
  spec: ResourcePoolSpec;
}

export interface ResourcePoolList {
  metadata: K8sObjectListMeta;
  items: ResourcePool[];
}

export interface ResourcePoolSpec {
  lifespan?: ResourcePoolSpecLifespan;
  minAvailable: number;
  resources: ResourcePoolSpecResource[];
}

export interface ResourcePoolSpecLifespan {
  default: string;
  maximum: string;
  relativeMaximum: string;
  unclaimed: string;
}

export interface ResourcePoolSpecResource {
  name?: string;
  provider: K8sObjectReference;
  template?: any;
}

export interface ResourceProvider extends K8sObject {
  spec: ResourceProviderSpec;
}

export interface ResourceProviderList {
  items: ResourceProvider[];
  metadata: K8sObjectListMeta;
}

export interface ResourceProviderSpec {
  default?: any;
  lifespan?: ResourceProviderSpecLifespan;
  matchIgnore?: string[];
  override?: any;
  resourceRequiresClaim?: boolean;
  template?: ResourceProviderSpecTemplate;
  updateFilters?: ResourceProviderSpecUpdateFilter[];
  validation?: ResourceProviderSpecValidation;
}

export interface ResourceProviderSpecLifespan {
  default: string;
  maximum: string;
  relativeMaximum: string;
  end?: string;
  start?: string;
}

export type ResourceClaimStatusLifespan = ResourceProviderSpecLifespan;

export type CatalogItemSpecLifespan = ResourceProviderSpecLifespan;

export type CatalogItemSpecLastUpdate = {
  git: {
    author: string;
    committer: string;
    hash: string;
    message: string;
    when_author: string;
    when_committer: string;
  };
};

export type CatalogItemSpecRuntime = {
  default: string;
  maximum: string;
};

export interface ResourceProviderSpecTemplate {
  enable?: boolean;
}

export interface ResourceProviderSpecUpdateFilter {
  allowedOps?: string[];
  pathMatch: string;
}

export interface ResourceProviderSpecValidation {
  openAPIV3Schema?: any;
}

export interface ServiceNamespace {
  displayName: string;
  name: string;
}

export interface User extends K8sObject {}

export interface UserList {
  items: User[];
  metadata: K8sObjectListMeta;
}

export interface Workshop extends K8sObject {
  spec: WorkshopSpec;
  status?: any;
}

export interface WorkshopList {
  items: Workshop[];
  metadata: K8sObjectListMeta;
}

export interface WorkshopProvision extends K8sObject {
  spec: WorkshopProvisionSpec;
  status?: any;
}

export interface WorkshopProvisionList {
  items: WorkshopProvision[];
  metadata: K8sObjectListMeta;
}

export interface WorkshopProvisionSpec {
  catalogItem: {
    name: string;
    namespace: string;
  };
  concurrency: number;
  count: number;
  parameters: any;
  startDelay?: number;
  workshopName: string;
  lifespan?: {
    start?: string;
    end?: string;
  };
}

export interface WorkshopSpec {
  accessPassword?: string;
  description?: string;
  displayName?: string;
  multiuserServices?: boolean;
  openRegistration?: boolean;
  provisionDisabled?: boolean;
  userAssignments: WorkshopSpecUserAssignment[];
  lifespan?: {
    end?: string;
  };
}

export interface WorkshopSpecUserAssignment {
  assignment?: {
    email: string;
  };
  data?: any;
  labUserInterface?: {
    data?: object;
    method?: string;
    url: string;
  };
  messages?: string;
  resourceClaimName?: string;
  userName?: string;
}

export type Session = {
  lifetime: number;
  token: string;
  impersonateUser: string;
  admin: boolean;
  consoleURL: string;
  groups: string[];
  roles: string[];
  interface: string;
  user: string;
  catalogNamespaces: CatalogNamespace[];
  serviceNamespaces: ServiceNamespace[];
  workshopNamespaces: ServiceNamespace[];
  userNamespace: UserNamespace;
};
export type CostTracker = {
  lastRequest: string;
  estimatedCost?: number;
  lastUpdate?: string;
};

export type Nullable<T> = T | null;

export type IAppRouteAccessControl = 'admin';
export type IAppRoute = {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  component: React.LazyExoticComponent<React.FC<any>>;
  path: string;
  title: string;
  accessControl?: IAppRouteAccessControl;
};

export type ResourceType =
  | 'CATALOG_ITEM'
  | 'CATALOG_ITEMS'
  | 'RESOURCE_CLAIMS'
  | 'RESOURCE_CLAIM'
  | 'NAMESPACES'
  | 'WORKSHOP'
  | 'WORKSHOPS'
  | 'ANARCHY_SUBJECT'
  | 'WORKSHOP_PROVISIONS'
  | 'RESOURCE_HANDLE'
  | 'RESOURCE_HANDLES'
  | 'RESOURCE_POOL'
  | 'RESOURCE_POOLS'
  | 'RESOURCE_PROVIDERS'
  | 'RESOURCE_PROVIDER';

export type ServiceActionActions = 'start' | 'stop' | 'delete' | 'rate' | 'retirement';
