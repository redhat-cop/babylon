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
  spec: any;
  status?: AnarchySubjectStatus;
}

export interface AnarchySubjectList {
  items: AnarchySubject[];
  metadata: K8sObjectListMeta;
}

export interface AnarchySubjectStatus {
  towerJobs?: {[jobName:string]: AnarchySubjectStatusTowerJob};
}

export interface AnarchySubjectStatusTowerJob {
  towerJobURL?: string;
}

export interface CatalogItem extends K8sObject {
  spec: CatalogItemSpec;
  status?: any;
}

export interface CatalogItemList {
  items: CatalogItem[];
  metadata: K8sObjectListMeta;
}

export interface CatalogItemSpec {
  accessControl?: any;
  bookbag?: any;
  messageTemplates?: any;
  parameters?: CatalogItemSpecParameter[];
  resources?: any[];
  termsOfService?: string;
  userData?: any;
}

export interface CatalogItemSpecParameter {
  description?: string;
  formLabel?: string;
  formGroup?: string;
  formDisableCondition?: string;
  name: string;
  required?: boolean;
  resourceIndex?: number;
  value?: string;
  openAPIV3Schema?: any;
}

export interface CatalogNamespace {
  description: string;
  displayName: string;
  name: string;
}

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: K8sObjectMeta;
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
  finalizers?: string[];
  labels?: object;
  name: string;
  namespace?: string;
  resourceVersion?: number;
  uid?: string;
}

export interface K8sObjectReference {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
  uid?: string;
}

export interface Namespace extends K8sObject {
}

export interface NamespaceList {
  items: Namespace[];
  metadata: K8sObjectListMeta;
}

export interface ResourceClaim extends K8sObject {
  spec: any;
  status?: any;
}

export interface ResourceClaimList {
  items: ResourceClaim[];
  metadata: K8sObjectListMeta;
}

export interface ResourceHandle extends K8sObject{
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

export interface User extends K8sObject {
}

export interface UserList {
  items: User[];
  metadata: K8sObjectListMeta;
}
