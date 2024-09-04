import { CSSProperties } from 'react';

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

export type MessageTemplate = {
  outputFormat: 'html';
  template: string;
  templateFormat: 'asciidoc' | 'html';
};
export interface CatalogItemSpec {
  accessControl?: AccessControl;
  bookbag?: any;
  messageTemplates?: {
    user?: MessageTemplate;
    info?: MessageTemplate;
    serviceReady?: MessageTemplate;
    serviceDeleted?: MessageTemplate;
    startComplete?: MessageTemplate;
    stopComplete?: MessageTemplate;
  };
  multiuser?: boolean;
  workshopUiDisabled?: boolean;
  workshopUiMaxInstances?: number;
  parameters?: CatalogItemSpecParameter[];
  provisionTimeEstimate?: string;
  resources?: any[];
  termsOfService?: string;
  userData?: any;
  lifespan?: CatalogItemSpecLifespan;
  lastUpdate?: CatalogItemSpecLastUpdate;
  runtime?: CatalogItemSpecRuntime;
  externalUrl?: string;
  category?: string;
  description?: {
    content: string;
    format: 'html' | 'asciidoc';
    safe?: string;
  };
  displayName?: string;
  keywords?: string[];
  icon?: {
    alt: string;
    url: string;
    style?: CSSProperties;
  };
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
}
export interface NamespaceList {
  items: Namespace[];
  metadata: K8sObjectListMeta;
}

export interface ResourceHandleResource {
  name: string;
  provider: K8sObjectReference;
  state?: AnarchySubject;
}
export interface ResourceClaim extends K8sObject {
  spec: ResourceClaimSpec;
  status?: {
    lifespan: ResourceClaimStatusLifespan;
    resourceHandle: K8sObjectReference;
    resources: ResourceHandleResource[];
    summary?: ResrouceClaimSummary;
  };
}

export interface ResrouceClaimSummary {
  provision_data?: any;
  runtime_default?: string;
  runtime_maximum?: string;
  state: string;
}
export interface ResourceClaimList {
  items: ResourceClaim[];
  metadata: K8sObjectListMeta;
}

export interface ResourceClaimSpec {
  lifespan?: ResourceClaimSpecLifespan;
  resources?: ResourceClaimSpecResource[];
  provider?: ResourceClaimProvider;
  autoDetach?: {
    when: string;
  };
}

export interface ResourceClaimProvider {
  name: string;
  parameterValues: {
    purpose: string;
    start_timestamp?: string;
    stop_timestamp?: string;
  };
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
  resources?: ResourceHandleSpecResource[];
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
  status?: ResourcePoolStatus;
}

export interface ResourcePoolList {
  metadata: K8sObjectListMeta;
  items: ResourcePool[];
}

export interface ResourcePoolSpec {
  lifespan?: ResourcePoolSpecLifespan;
  minAvailable: number;
  provider: ResourcePoolProvider;
  deleteUnhealthyResourceHandles?: boolean;
  maxUnready?: number;
}

export interface ResourcePoolStatus {
  resourceHandleCount: {
    available: number;
    ready: number;
  };
  resourceHandles: {
    healthy: boolean;
    name: string;
    ready:boolean;
  }[];
}

export interface ResourcePoolSpecLifespan {
  default: string;
  maximum: string;
  relativeMaximum: string;
  unclaimed: string;
}

export interface ResourcePoolProvider {
  name: string;
  parameterValues: ParameterValues;
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
  requester?: string;
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
  enableResourcePools: boolean;
  lifespan?: {
    start?: string;
    end?: string;
  };
  autoDetach?: {
    when: string;
  };
}

export interface WorkshopSpec {
  accessPassword?: string;
  description?: string;
  displayName?: string;
  multiuserServices?: boolean;
  openRegistration?: boolean;
  provisionDisabled?: boolean;
  labUserInterface?: { redirect?: boolean };
  actionSchedule?: {
    stop?: string;
    start?: string;
  };
  lifespan?: {
    end?: string;
    start?: string;
  };
}

export interface WorkshopUserAssignmentList {
  metadata: K8sObjectListMeta;
  items: WorkshopUserAssignment[];
}

export interface WorkshopUserAssignment extends K8sObject {
  spec: WorkshopSpecUserAssignment;
  status?: any;
}

export interface WorkshopSpecUserAssignment {
  data?: any;
  messages?: string;
  resourceClaimName?: string;
  userName?: string;
  workshopName: string;
  labUserInterface?: {
    data?: object;
    method?: string;
    url: string;
    redirect?: boolean;
  };
  assignment?: {
    email: string;
  };
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
  | 'ASSET_METRICS'
  | 'CATALOG_ITEMS'
  | 'RESOURCE_CLAIMS'
  | 'RESOURCE_CLAIM'
  | 'NAMESPACES'
  | 'WORKSHOP'
  | 'WORKSHOPS'
  | 'WORKSHOP_PROVISIONS'
  | 'RESOURCE_HANDLE'
  | 'RESOURCE_HANDLES'
  | 'RESOURCE_POOL'
  | 'RESOURCE_POOLS'
  | 'RESOURCE_PROVIDERS'
  | 'RESOURCE_PROVIDER'
  | 'ANARCHY_ACTION'
  | 'ANARCHY_ACTIONS'
  | 'ANARCHY_SUBJECT'
  | 'ANARCHY_SUBJECTS'
  | 'ANARCHY_RUN'
  | 'ANARCHY_RUNS'
  | 'ANARCHY_GOVERNORS'
  | 'ANARCHY_GOVERNOR'
  | 'INCIDENTS'
  | 'INCIDENT'
  | 'RATING'
  | 'RATINGS_HISTORY'
  | 'USER_RATING'
  | 'WORKSHOP_SUPPORT'
  | 'WORKSHOP_USER_ASSIGNMENTS'
  | 'SFDC_ACCOUNTS'
  | 'SFDC_BY_ACCOUNT';

export type ServiceActionActions = 'start' | 'stop' | 'delete' | 'rate' | 'retirement';

export type WorkshopWithResourceClaims = Workshop & {
  resourceClaims?: ResourceClaim[];
};
export type Service = ResourceClaim | WorkshopWithResourceClaims;

export type Incident = {
  id: number;
  incident_type: 'general';
  interface: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  status: 'active' | 'resolved';
  created_at: string;
  updated_at: string;
};

export type TPurposeOpts = {
  name: string;
  description: string;
  activity: string;
  sfdcRequired: boolean;
  requireUserInput?: boolean;
  requiredRoles?: string[];
}[];

export type AssetMetrics = {
  assetName: string;
  assetUuid: string;
  averageCostPerProvision: number;
  averageLifetimeCostByHour: number;
  averageLifetimeCostPerHourPerExperience: number;
  averageLifetimeHour: number;
  averageProvisionHour: number;
  averageRating: number;
  averageRuntimeCostByHour: number;
  averageRuntimeCostPerHourPerExperience: number;
  averageRuntimeHour: number;
  lifetimeHoursTotal: number;
  medianCostPerProvision: number;
  medianCostPerProvisionPerHour: number;
  medianLifetimeCostByHour: number;
  medianProvisionHour: number;
  medianRuntimeCostByHour: number;
  provisionHoursTotal: number;
  provisionsTotal: number;
  ratingsTotal: number;
  runtimeHoursTotal: number;
  stddevCostPerProvision: number;
  stddevCostPerProvisionPerHour: number;
  stddevLifetimeCostByHour: number;
  stddevProvisionHour: number;
  stddevRuntimeCostByHour: number;
  usageAmountTotal: number;
  userExperiencesTotal: number;
};

export type Opportunity = {
  id: string;
  close_date: string;
  is_closed: boolean;
  is_valid: boolean;
  name: string;
};

export type SalesforceAccount = {
  id: string;
  name: string;
  is_valid: boolean;
};

export type SfdcType = 'campaign' | 'cdh' | 'project' | 'opportunity';

export type ParameterValues = {
  [name: string]: boolean | number | string;
};