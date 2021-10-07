interface IFAnnotations {
    ".": {},
    "f:babylon.gpte.redhat.com/description": {},
    "f:babylon.gpte.redhat.com/descriptionFormat": {},
    "f:babylon.gpte.redhat.com/displayName": {},
    "f:babylon.gpte.redhat.com/icon": {},
    "f:babylon.gpte.redhat.com/keywords": {}
}

interface ITLabels {
    "f:babylon.gpte.redhat.com/catalogItem": string,
}

interface IFSpec {
    ".": {},
    "f:resources": {}
}

interface IFMetadata {
    "f:annotations": IFAnnotations,
    "f:labels": ILabels,
}

interface IFieldsV1 {
    "f:metadata": IFMetadata,
    "f:spec": IFSpec,
}

interface IManagedFields {
    "apiVersion": string,
    "fieldsType": string,
    "fieldsV1": IFieldsV1,
    "manager": string,
    "operation": string,
    "time": string
}

export interface IItems {
    "apiVersion": string,
    "kind": string,
    "metadata": IItemsMetadata
}

interface ILabels {
    "babylon.gpte.redhat.com/Event": string,
    "babylon.gpte.redhat.com/Product": string,
    "babylon.gpte.redhat.com/Provider": string,
    "babylon.gpte.redhat.com/category": string,
    "babylon.gpte.redhat.com/stage": string,
    "generated_by": string,
    // "managedFields": [IManagedFields]
}

interface IAnnotations {
    "babylon.gpte.redhat.com/description": string,
    "babylon.gpte.redhat.com/descriptionFormat": string,
    "babylon.gpte.redhat.com/displayName": string,
    "babylon.gpte.redhat.com/icon": string,
    "babylon.gpte.redhat.com/keywords": string
}

interface IItemsMetadata {
    "annotations": IAnnotations,
    "creationTimestamp": "string",
    "generation": number,
    "labels": ILabels,
    "managedFields": [IManagedFields],
    "name": string,
    "namespace": string,
    "resourceVersion": string,
    "selfLink": string,
    "uid": string
}

interface IProvider {
    "apiVersion": string,
    "kind": string,
    "name": string,
    "namespace": string
}

interface IMetadata {
    "labels": ITLabels
}

interface IResource {
    "provider": IProvider,
    "template": IMetadata
}

interface ISpec {
    "resources": [IResource],
}

export interface IListCustomerCustomObjectResp {
    "apiVersion": string,
    "kind": string,
    "metadata": IItemsMetadata,
    "spec": ISpec
}

export interface ICatalogItem {
    'babylon-catalog-summit-dev': [IListCustomerCustomObjectResp],
    'babylon-catalog-summit-infra': [IListCustomerCustomObjectResp],
    'babylon-catalog-summit-prod': [IListCustomerCustomObjectResp],
    'babylon-catalog-summit-test': [IListCustomerCustomObjectResp]
}

export interface ICatalogItemsObj {
    "catalogItems": ICatalogItem;
}

export interface ICatalogItemsNamespaceObj {
    "catalogItems": ICatalogItem[];
    "namespace": string
}
