const mockApiSession = {
  admin: true,
  catalogNamespaces: [
    {
      description: 'Red Hat Summit development catalog',
      displayName: 'Red Hat Summit Development',
      name: 'babylon-catalog-summit-dev',
    },
    {
      description: 'Red Hat Summit infrastructure catalog',
      displayName: 'Red Hat Summit Infra',
      name: 'babylon-catalog-summit-infra',
    },
    {
      description: 'Red Hat Summit service catalog',
      displayName: 'Red Hat Summit',
      name: 'babylon-catalog-summit-prod',
    },
    {
      description: 'Red Hat Summit test catalog',
      displayName: 'Red Hat Summit Test',
      name: 'babylon-catalog-summit-test',
    },
  ],
  groups: ['babylon-admins'],
  interface: 'summit',
  lifetime: 600,
  serviceNamespaces: [
    {
      displayName: 'User ankay-redhat.com',
      name: 'user-ankay-redhat-com',
      requester: 'ankay-redhat.com',
    },
    {
      displayName: 'User cbomman-redhat.com',
      name: 'user-cbomman-redhat-com',
      requester: 'cbomman-redhat.com',
    },
    {
      displayName: 'User cshinde-redhat.com',
      name: 'user-cshinde-redhat-com',
      requester: 'cshinde-redhat.com',
    },
    {
      displayName: 'user-dave-dekker-atlanticbt-com',
      name: 'user-dave-dekker-atlanticbt-com',
      requester: 'dave.dekker-atlanticbt.com',
    },
    {
      displayName: 'User demouser',
      name: 'user-demouser',
      requester: 'demouser',
    },
    {
      displayName: 'user-djana-redhat-com',
      name: 'user-djana-redhat-com',
      requester: 'djana-redhat.com',
    },
    {
      displayName: 'user-gucore-redhat-com',
      name: 'user-gucore-redhat-com',
      requester: 'gucore-redhat.com',
    },
    {
      displayName: 'user-jappleii-redhat-com',
      name: 'user-jappleii-redhat-com',
      requester: 'jappleii-redhat.com',
    },
    {
      displayName: 'User jdisrael-redhat.com',
      name: 'user-jdisrael-redhat-com',
      requester: 'jdisrael-redhat.com',
    },
    {
      displayName: 'User jholt-redhat.com',
      name: 'user-jholt-redhat-com',
      requester: 'jholt-redhat.com',
    },
    {
      displayName: 'User jkupfere-redhat.com',
      name: 'user-jkupfere-redhat-com',
      requester: 'jkupfere-redhat.com',
    },
    {
      displayName: 'user-jkupfere-redhat-com-1',
      name: 'user-jkupfere-redhat-com-1',
      requester: 'jkupfere@redhat.com',
    },
    {
      displayName: 'User klewis-redhat.com',
      name: 'user-klewis-redhat-com',
      requester: 'klewis-redhat.com',
    },
    {
      displayName: 'User mamorim-redhat.com',
      name: 'user-mamorim-redhat-com',
      requester: 'mamorim-redhat.com',
    },
    {
      displayName: 'user-mmills-redhat-com',
      name: 'user-mmills-redhat-com',
      requester: 'mmills-redhat.com',
    },
    {
      displayName: 'User nstephan-redhat.com',
      name: 'user-nstephan-redhat-com',
      requester: 'nstephan-redhat.com',
    },
    {
      displayName: 'User oczernin-redhat.com',
      name: 'user-oczernin-redhat-com',
      requester: 'oczernin-redhat.com',
    },
    {
      displayName: 'user-pattest',
      name: 'user-pattest',
      requester: 'pattest',
    },
    {
      displayName: 'user-prabal-raghav-atlanticbt-com',
      name: 'user-prabal-raghav-atlanticbt-com',
      requester: 'prabal.raghav-atlanticbt.com',
    },
    {
      displayName: 'User prutledg',
      name: 'user-prutledg',
      requester: 'prutledg',
    },
    {
      displayName: 'User shacharb-redhat.com',
      name: 'user-shacharb-redhat-com',
      requester: 'shacharb-redhat.com',
    },
    {
      displayName: 'user-summituser1',
      name: 'user-summituser1',
      requester: 'summituser1',
    },
    {
      displayName: 'user-summituser2',
      name: 'user-summituser2',
      requester: 'summituser2',
    },
    {
      displayName: 'user-summituser3',
      name: 'user-summituser3',
      requester: 'summituser3',
    },
    {
      displayName: 'user-summituser4',
      name: 'user-summituser4',
      requester: 'summituser4',
    },
    {
      displayName: 'user-summituser5',
      name: 'user-summituser5',
      requester: 'summituser5',
    },
    {
      displayName: 'user-summituser6',
      name: 'user-summituser6',
      requester: 'summituser6',
    },
    {
      displayName: 'User tcrowe-redhat.com',
      name: 'user-tcrowe-redhat-com',
      requester: 'tcrowe-redhat.com',
    },
    {
      displayName: 'user-varodrig-redhat-com',
      name: 'user-varodrig-redhat-com',
      requester: 'varodrig-redhat.com',
    },
    {
      displayName: 'user-vipul-patil-atlanticbt-com',
      name: 'user-vipul-patil-atlanticbt-com',
      requester: 'vipul.patil-atlanticbt.com',
    },
    {
      displayName: 'User wkulhane-redhat.com',
      name: 'user-wkulhane-redhat-com',
      requester: 'wkulhane-redhat.com',
    },
    {
      displayName: 'User yvarbev-redhat.com',
      name: 'user-yvarbev-redhat-com',
      requester: 'yvarbev-redhat.com',
    },
  ],
  token: 'tCoMA0e8RJf9tScKlqKAZuAhLl720FmL',
  user: 'test.user-redhat.com',
  userNamespace: {
    displayName: 'user-prabal-raghav-atlanticbt-com',
    name: 'user-prabal-raghav-atlanticbt-com',
    requester: 'prabal.raghav-atlanticbt.com',
  },
};

const mockClusterCustomObject = {
  kind: 'UserList',
  apiVersion: 'user.openshift.io/v1',
  metadata: {
    selfLink: '/apis/user.openshift.io/v1/users',
    resourceVersion: '221046256',
  },
  items: [
    {
      metadata: {
        name: 'ankay-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/ankay-redhat.com',
        uid: '3edfeec2-598d-4e4d-9629-4ed8cf372914',
        resourceVersion: '109501673',
        creationTimestamp: '2021-05-05T18:33:27Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-05-05T18:33:27Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'antony kay',
      identities: ['ldapidp:dWlkPWFua2F5LXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'cbomman-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/cbomman-redhat.com',
        uid: '2657597b-b447-4929-989d-cc99e0c5d043',
        resourceVersion: '53366849',
        creationTimestamp: '2021-02-04T11:02:30Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-02-04T11:02:30Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'bose b chandra',
      identities: ['ldapidp:dWlkPWNib21tYW4tcmVkaGF0LmNvbSxjbj11c2Vycyxjbj1hY2NvdW50cyxkYz1vcGVudGxjLGRjPWNvbQ'],
      groups: null,
    },
    {
      metadata: {
        name: 'cshinde-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/cshinde-redhat.com',
        uid: 'ecde8fa5-1eef-4c9a-89cf-84a20d920576',
        resourceVersion: '53911557',
        creationTimestamp: '2021-02-05T11:12:27Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-02-05T11:12:27Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'chetan shinde',
      identities: ['ldapidp:dWlkPWNzaGluZGUtcmVkaGF0LmNvbSxjbj11c2Vycyxjbj1hY2NvdW50cyxkYz1vcGVudGxjLGRjPWNvbQ'],
      groups: null,
    },
    {
      metadata: {
        name: 'dave.dekker-atlanticbt.com',
        selfLink: '/apis/user.openshift.io/v1/users/dave.dekker-atlanticbt.com',
        uid: 'b5ea3f32-5983-4ef1-8dc0-55bb296a589f',
        resourceVersion: '209077107',
        creationTimestamp: '2021-09-02T14:14:19Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-09-02T14:14:19Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Dave Dekker',
      identities: [
        'ldapidp:dWlkPWRhdmUuZGVra2VyLWF0bGFudGljYnQuY29tLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t',
      ],
      groups: null,
    },
    {
      metadata: {
        name: 'demouser',
        selfLink: '/apis/user.openshift.io/v1/users/demouser',
        uid: 'e414c7e3-154c-44bb-86d1-1588b9a0e9b4',
        resourceVersion: '100993641',
        creationTimestamp: '2021-04-23T15:59:36Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-04-23T15:59:36Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Demo User',
      identities: ['ldapidp:dWlkPWRlbW91c2VyLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t'],
      groups: null,
    },
    {
      metadata: {
        name: 'djana-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/djana-redhat.com',
        uid: 'befd0c0f-5478-4de4-b9c1-d4ab2ac54ecf',
        resourceVersion: '53314043',
        creationTimestamp: '2021-02-04T08:42:27Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-02-04T08:42:27Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'dibyendu jana',
      identities: ['ldapidp:dWlkPWRqYW5hLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'gucore-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/gucore-redhat.com',
        uid: '72b49ebd-c878-4de2-a1ab-a4e7a001c148',
        resourceVersion: '1884664',
        creationTimestamp: '2020-11-12T21:51:30Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2020-11-12T21:51:30Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Guillaume Core',
      identities: ['ldapidp:dWlkPWd1Y29yZS1yZWRoYXQuY29tLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t'],
      groups: null,
    },
    {
      metadata: {
        name: 'jappleii-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/jappleii-redhat.com',
        uid: '0ab702d6-ea31-4055-93bc-ebcedb47d7d3',
        resourceVersion: '104293038',
        creationTimestamp: '2021-04-28T08:43:35Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-04-28T08:43:35Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'John Phillip Apple II',
      identities: ['ldapidp:dWlkPWphcHBsZWlpLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'jdisrael-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/jdisrael-redhat.com',
        uid: '9412fb34-0840-4bda-ba7d-efc6ba1c1153',
        resourceVersion: '79271421',
        creationTimestamp: '2021-03-22T21:37:32Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-03-22T21:37:32Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Josh Disraeli',
      identities: ['ldapidp:dWlkPWpkaXNyYWVsLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'jholt-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/jholt-redhat.com',
        uid: 'f32dfdf5-2b54-4971-9159-392501561993',
        resourceVersion: '109503431',
        creationTimestamp: '2021-05-05T18:36:45Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-05-05T18:36:45Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'jason g holt',
      identities: ['ldapidp:dWlkPWpob2x0LXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'jkupfere-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/jkupfere-redhat.com',
        uid: '2ba7c4d9-ce63-4f59-9fbe-9f4203f63204',
        resourceVersion: '6474547',
        creationTimestamp: '2020-11-19T22:02:16Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2020-11-19T22:02:16Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'johnathan kupferer',
      identities: ['ldapidp:dWlkPWprdXBmZXJlLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'jkupfere@redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/jkupfere%40redhat.com',
        uid: '9fe5f9ca-9e0e-466d-b41a-1ba467452f63',
        resourceVersion: '202995796',
        creationTimestamp: '2021-08-26T13:31:05Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-26T13:31:05Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:jkupfere@redhat.com'],
      groups: null,
    },
    {
      metadata: {
        name: 'klewis-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/klewis-redhat.com',
        uid: '592d64d1-4050-44fa-8188-e5ff791054e0',
        resourceVersion: '48074215',
        creationTimestamp: '2021-01-25T16:37:28Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-01-25T16:37:28Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'kadeem lewis',
      identities: ['ldapidp:dWlkPWtsZXdpcy1yZWRoYXQuY29tLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t'],
      groups: null,
    },
    {
      metadata: {
        name: 'mamorim-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/mamorim-redhat.com',
        uid: 'e4681380-04dd-455a-b8ab-8477c78d1068',
        resourceVersion: '66927845',
        creationTimestamp: '2021-03-01T14:58:52Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-03-01T14:58:52Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'marcos amorim',
      identities: ['ldapidp:dWlkPW1hbW9yaW0tcmVkaGF0LmNvbSxjbj11c2Vycyxjbj1hY2NvdW50cyxkYz1vcGVudGxjLGRjPWNvbQ'],
      groups: null,
    },
    {
      metadata: {
        name: 'mmills-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/mmills-redhat.com',
        uid: '132f763b-de5e-4f75-a7ec-e2b2c97183cd',
        resourceVersion: '142978001',
        creationTimestamp: '2021-06-14T15:05:08Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-06-14T15:05:08Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'michelle mills',
      identities: ['ldapidp:dWlkPW1taWxscy1yZWRoYXQuY29tLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t'],
      groups: null,
    },
    {
      metadata: {
        name: 'nstephan-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/nstephan-redhat.com',
        uid: '6533307f-4bab-45ad-a4b4-6c7d0d1f713a',
        resourceVersion: '20052065',
        creationTimestamp: '2020-12-11T18:06:50Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2020-12-11T18:06:50Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Nate Stephany',
      identities: ['ldapidp:dWlkPW5zdGVwaGFuLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'oczernin-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/oczernin-redhat.com',
        uid: 'c7ac9015-dc0e-40f0-97da-27b26bb0ca6a',
        resourceVersion: '103067607',
        creationTimestamp: '2021-04-26T14:53:23Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-04-26T14:53:23Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'or czerninski',
      identities: ['ldapidp:dWlkPW9jemVybmluLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'pattest',
        selfLink: '/apis/user.openshift.io/v1/users/pattest',
        uid: 'a46b29e9-87de-45b7-9c9d-6e1ae5692109',
        resourceVersion: '195517407',
        creationTimestamp: '2021-08-17T15:19:02Z',
        managedFields: [
          {
            manager: 'OpenAPI-Generator',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-17T15:19:02Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:pattest'],
      groups: null,
    },
    {
      metadata: {
        name: 'prabal.raghav-atlanticbt.com',
        selfLink: '/apis/user.openshift.io/v1/users/prabal.raghav-atlanticbt.com',
        uid: '427af328-9853-484c-b522-225702c40c26',
        resourceVersion: '216011346',
        creationTimestamp: '2021-09-10T15:58:51Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-09-10T15:58:51Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Prabal Raghav',
      identities: [
        'ldapidp:dWlkPXByYWJhbC5yYWdoYXYtYXRsYW50aWNidC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20',
      ],
      groups: null,
    },
    {
      metadata: {
        name: 'prutledg',
        selfLink: '/apis/user.openshift.io/v1/users/prutledg',
        uid: '0da81fcc-3a00-49b3-abe3-4c5285bcce6c',
        resourceVersion: '94843259',
        creationTimestamp: '2021-04-14T22:57:47Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-04-14T22:57:47Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Patrick Rutledge',
      identities: ['ldapidp:dWlkPXBydXRsZWRnLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t'],
      groups: null,
    },
    {
      metadata: {
        name: 'shacharb-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/shacharb-redhat.com',
        uid: '97ef47e4-2562-4b7d-8449-eda84d37772d',
        resourceVersion: '100966099',
        creationTimestamp: '2021-04-23T15:03:23Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-04-23T15:03:23Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Shachar Borenstein',
      identities: ['ldapidp:dWlkPXNoYWNoYXJiLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'summituser1',
        selfLink: '/apis/user.openshift.io/v1/users/summituser1',
        uid: 'fe6240e8-dd12-48ac-80cb-f5ea9eb9aaeb',
        resourceVersion: '190561834',
        creationTimestamp: '2021-08-11T16:32:41Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-11T16:32:41Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:summituser1'],
      groups: null,
    },
    {
      metadata: {
        name: 'summituser2',
        selfLink: '/apis/user.openshift.io/v1/users/summituser2',
        uid: '2213352b-30c4-4cf3-87c3-8054f801199a',
        resourceVersion: '190616704',
        creationTimestamp: '2021-08-11T18:07:45Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-11T18:07:45Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:summituser2'],
      groups: null,
    },
    {
      metadata: {
        name: 'summituser3',
        selfLink: '/apis/user.openshift.io/v1/users/summituser3',
        uid: 'cd7f93c0-0779-4a5a-b434-7a8139959f81',
        resourceVersion: '189659996',
        creationTimestamp: '2021-08-10T14:42:39Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-10T14:42:39Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:summituser3'],
      groups: null,
    },
    {
      metadata: {
        name: 'summituser4',
        selfLink: '/apis/user.openshift.io/v1/users/summituser4',
        uid: 'de8c9715-dfee-4456-abfb-a9406c282f7e',
        resourceVersion: '190778339',
        creationTimestamp: '2021-08-11T22:46:09Z',
        managedFields: [
          {
            manager: 'OpenAPI-Generator',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-11T22:46:09Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:summituser4'],
      groups: null,
    },
    {
      metadata: {
        name: 'summituser5',
        selfLink: '/apis/user.openshift.io/v1/users/summituser5',
        uid: 'e3543b9b-d1ef-478d-8c2a-8cd1c9f9a342',
        resourceVersion: '190778343',
        creationTimestamp: '2021-08-11T22:46:09Z',
        managedFields: [
          {
            manager: 'OpenAPI-Generator',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-11T22:46:09Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:summituser5'],
      groups: null,
    },
    {
      metadata: {
        name: 'summituser6',
        selfLink: '/apis/user.openshift.io/v1/users/summituser6',
        uid: '86a92857-bd3a-4263-b423-2527113b9fd9',
        resourceVersion: '190779203',
        creationTimestamp: '2021-08-11T22:47:21Z',
        managedFields: [
          {
            manager: 'OpenAPI-Generator',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-11T22:47:21Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:identities': {},
            },
          },
        ],
      },
      identities: ['summit:summituser6'],
      groups: null,
    },
    {
      metadata: {
        name: 'tcrowe-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/tcrowe-redhat.com',
        uid: 'fd8eabb1-d571-44a4-8674-fefd9d2d05ff',
        resourceVersion: '95470072',
        creationTimestamp: '2021-04-15T20:00:42Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-04-15T20:00:42Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Thomas Crowe',
      identities: ['ldapidp:dWlkPXRjcm93ZS1yZWRoYXQuY29tLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t'],
      groups: null,
    },
    {
      metadata: {
        name: 'varodrig-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/varodrig-redhat.com',
        uid: '2d605348-5f0e-42e9-ae56-20c1e87702b3',
        resourceVersion: '197128171',
        creationTimestamp: '2021-08-19T13:37:22Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-08-19T13:37:22Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'ana valentina rodriguez sosa',
      identities: ['ldapidp:dWlkPXZhcm9kcmlnLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'vipul.patil-atlanticbt.com',
        selfLink: '/apis/user.openshift.io/v1/users/vipul.patil-atlanticbt.com',
        uid: '189a3845-ac23-435a-b6d1-c6a7a5b4fbf9',
        resourceVersion: '218541369',
        creationTimestamp: '2021-09-13T14:38:22Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-09-13T14:38:22Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'Vipul Patil',
      identities: [
        'ldapidp:dWlkPXZpcHVsLnBhdGlsLWF0bGFudGljYnQuY29tLGNuPXVzZXJzLGNuPWFjY291bnRzLGRjPW9wZW50bGMsZGM9Y29t',
      ],
      groups: null,
    },
    {
      metadata: {
        name: 'wkulhane-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/wkulhane-redhat.com',
        uid: '54b6cb0e-c07f-42ce-b764-90d27f1e58b3',
        resourceVersion: '90955172',
        creationTimestamp: '2021-04-09T12:10:25Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-04-09T12:10:25Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'wolfgang kulhanek',
      identities: ['ldapidp:dWlkPXdrdWxoYW5lLXJlZGhhdC5jb20sY249dXNlcnMsY249YWNjb3VudHMsZGM9b3BlbnRsYyxkYz1jb20'],
      groups: null,
    },
    {
      metadata: {
        name: 'yvarbev-redhat.com',
        selfLink: '/apis/user.openshift.io/v1/users/yvarbev-redhat.com',
        uid: '04f98ed8-5975-4057-aae1-75a643405c28',
        resourceVersion: '75510011',
        creationTimestamp: '2021-03-16T11:52:56Z',
        managedFields: [
          {
            manager: 'oauth-server',
            operation: 'Update',
            apiVersion: 'user.openshift.io/v1',
            time: '2021-03-16T11:52:56Z',
            fieldsType: 'FieldsV1',
            fieldsV1: {
              'f:fullName': {},
              'f:identities': {},
            },
          },
        ],
      },
      fullName: 'yordan varbev',
      identities: ['ldapidp:dWlkPXl2YXJiZXYtcmVkaGF0LmNvbSxjbj11c2Vycyxjbj1hY2NvdW50cyxkYz1vcGVudGxjLGRjPWNvbQ'],
      groups: null,
    },
  ],
};
const mockListUsers = {
  apiVersion: 'user.openshift.io/v1',
  items: [],
  kind: 'UserList',
  metadata: {
    resourceVersion: '260709915',
  },
};

export async function getApiSession() {
  return Promise.resolve(mockApiSession);
}

export async function listClusterCustomObject() {
  return Promise.resolve(mockClusterCustomObject);
}

export async function listUsers() {
  return Promise.resolve(mockListUsers);
}
