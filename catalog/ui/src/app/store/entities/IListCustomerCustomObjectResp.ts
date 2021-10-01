interface IMetadata {
    "continue": string,
    "remainingItemCount": string,
    "resourceVersion": string,
    "selfLink": string,
}

interface IAnnotations {
    "babylon.gpte.redhat.com/description": string,
    "babylon.gpte.redhat.com/descriptionFormat": string,
    "babylon.gpte.redhat.com/displayName": string,
    "babylon.gpte.redhat.com/icon": string,
    "babylon.gpte.redhat.com/keywords": string
}

interface IFAnnotations {
    ".": {},
    "f:babylon.gpte.redhat.com/description": {},
    "f:babylon.gpte.redhat.com/descriptionFormat": {},
    "f:babylon.gpte.redhat.com/displayName": {},
    "f:babylon.gpte.redhat.com/icon": {},
    "f:babylon.gpte.redhat.com/keywords": {}
}

interface IFLabels {
    ".": {},
    "f:babylon.gpte.redhat.com/OpenShift_Version": {},
    "f:babylon.gpte.redhat.com/Product": {},
    "f:babylon.gpte.redhat.com/Provider": {},
    "f:babylon.gpte.redhat.com/category": {},
    "f:babylon.gpte.redhat.com/stage": {},
    "f:generated_by": {}
}

interface IFSpec {
    ".": {},
    "f:resources": {}
}

interface IFMetadata {
    "f:annotations": IFAnnotations,
    "f:labels": IFLabels,
}

interface IFieldsV1 {
    "f:metadata": IFMetadata,
    "f:spec": IFSpec,
} 

interface IManagedFields {
    "apiVersion": string,
    "fieldsType": string,
    "fieldsV1": {
        "f:metadata": {
            "f:annotations": {
                ".": {},
                "f:babylon.gpte.redhat.com/description": {},
                "f:babylon.gpte.redhat.com/descriptionFormat": {},
                "f:babylon.gpte.redhat.com/displayName": {},
                "f:babylon.gpte.redhat.com/icon": {},
                "f:babylon.gpte.redhat.com/keywords": {}
            },
            "f:labels": {
                ".": {},
                "f:babylon.gpte.redhat.com/OpenShift_Version": {},
                "f:babylon.gpte.redhat.com/Product": {},
                "f:babylon.gpte.redhat.com/Provider": {},
                "f:babylon.gpte.redhat.com/category": {},
                "f:babylon.gpte.redhat.com/stage": {},
                "f:generated_by": {}
            }
        },
        "f:spec": {
            ".": {},
            "f:resources": {}
        }
    },
    "manager": string,
    "operation": string,
    "time": string
}

interface ILabels {
    "babylon.gpte.redhat.com/OpenShift_Version": string,
    "babylon.gpte.redhat.com/Product": string,
    "babylon.gpte.redhat.com/Provider": string,
    "babylon.gpte.redhat.com/category": string,
    "babylon.gpte.redhat.com/stage": string,
    "generated_by": string,
    "managedFields": [IManagedFields]
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

export interface IItems {
    "apiVersion": string,
    "kind": string,
    "metadata": IItemsMetadata,
    
}

interface IProvider {
    "apiVersion": string,
    "kind": string,
    "name": string,
    "namespace": string
}

interface IResource {
    "name": string,
    "provider": IProvider,
}

interface ISpec {
    "resources": [IResource],
}

export default interface IListCustomerCustomObjectResp {
    "apiVersion": string,
    "items": [IItems],
    "kind": string,
    "metadata": IMetadata,
    "spec": ISpec,
}