export interface AnarchyAction {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
  status?: any;
}

export interface AnarchyActionList {
  items: AnarchyAction[];
  metadata: K8sObjectListMeta;
}

export interface AnarchyGovernor {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
  status?: any;
}

export interface AnarchyGovernorList {
  items: AnarchyGovernor[];
  metadata: K8sObjectListMeta;
}

export interface AnarchyRun {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
  status?: any;
}

export interface AnarchyRunList {
  items: AnarchyRun[];
  metadata: K8sObjectListMeta;
}

export interface AnarchyRunner {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
  status?: any;
}

export interface AnarchyRunnerList {
  items: AnarchyRunner[];
  metadata: K8sObjectListMeta;
}

export interface AnarchySubject {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
  status?: any;
}

export interface AnarchySubjectList {
  items: AnarchySubject[];
  metadata: K8sObjectListMeta;
}

export interface CatalogItem {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
}

export interface CatalogItemList {
  items: CatalogItem[];
  metadata: K8sObjectListMeta;
}

export interface CatalogNamespace {
  description: string;
  displayName: string;
  name: string;
}

export interface FetchState {
  canceled?: boolean;
  continue?: string;
  fetchedUids?: string[];
  finished?: boolean;
  isRefresh?: boolean;
  refreshTimeout?: any;
}

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
  status?: any;
}

export interface K8sObjectList {
  items: K8sObject[];
  metadata: K8sObjectListMeta;
}

export interface K8sObjectListMeta {
  continue?: string;
}

export interface K8sObjectMeta {
  annotations?: object;
  creationTimestamp?: string;
  deletionTimestamp?: string;
  labels?: object;
  name: string;
  namespace?: string;
  uid?: string;
}

export interface K8sObjectReference {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
  uid?: string;
}

export interface Namespace {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
}

export interface NamespaceList {
  items: Namespace[];
  metadata: K8sObjectListMeta;
}

export interface ResourceClaim {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
  spec: any;
  status?: any;
}

export interface ResourceClaimList {
  items: ResourceClaim[];
  metadata: K8sObjectListMeta;
}

export interface ResourceHandle {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
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

export interface ResourcePool {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
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

export interface ResourceProvider {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
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
}

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

export interface User {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
}

export interface UserList {
  items: User[];
  metadata: K8sObjectListMeta;
}
