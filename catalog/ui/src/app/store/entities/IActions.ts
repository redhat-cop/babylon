export interface IActionSetImpersonation {
    admin: string,
    user: string,
    groups: [string],
    catalogNamespaces: [],
    serviceNamespaces: [],
    userNamespace: [],
}
interface ICatalogNamespaces {
    description: string,
    displayName: string,
    name: string,
}
interface INamespaces {
    displayName: string,
    name: string,
    requester: string
}
export interface IActionStartSession {
    admin: boolean,
    user: string,
    groups: [string],
    interface: string,
    catalogNamespaces: [ICatalogNamespaces],
    serviceNamespaces: [INamespaces],
    userNamespace: [INamespaces],
}