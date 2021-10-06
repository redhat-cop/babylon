interface IFieldsV1 {
    "f:fullName": {},
    "f:identities": {}
};

interface IManagedFields {
    "manager": string,
    "operation": string,
    "apiVersion": string,
    "time": string,
    "fieldsType": string,
    "fieldsV1": IFieldsV1,
};

interface IMetaData {
    "name": string,
    "selfLink": string,
    "uid": string,
    "resourceVersion": string,
    "creationTimestamp": string,
    "managedFields": [IManagedFields]
};

interface IListClusterCustomObjectRespItems {
    "metadata": IMetaData,
    "fullName": string,
    "identities": [string]
    "groups": null
};

export default interface IListClusterCustomObjectResp {
    "items": [IListClusterCustomObjectRespItems]
}

// interface IResponseItems {
//     "metadata": {
//         "name": "ankay-redhat.com",
//         "selfLink": "/apis/user.openshift.io/v1/users/ankay-redhat.com",
//         "uid": "3edfeec2-598d-4e4d-9629-4ed8cf372914",
//         "resourceVersion": "109501673",
//         "creationTimestamp": "2021-05-05T18:33:27Z",
//         "managedFields": [
//             {
//                 "manager": "oauth-server",
//                 "operation": "Update",
//                 "apiVersion": "user.openshift.io/v1",
//                 "time": "2021-05-05T18:33:27Z",
//                 "fieldsType": "FieldsV1",
//                 "fieldsV1": {
//                     "f:fullName": {},
//                     "f:identities": {}
//                 }
//             }
//         ]
//     },
//     "fullName": "antony kay",
//     "identities": [
//         "ldapidp:dWlkPWFua2F5LXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20"
//     ],
//     "groups": null
// }