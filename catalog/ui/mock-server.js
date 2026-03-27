const express = require('express');
const app = express();
const port = 8001;

// Mock authentication session
app.get('/auth/session', (req, res) => {
  res.json({
    admin: true,
    user: 'jdisrael@redhat.com',
    email: 'jdisrael@redhat.com',
    groups: ['babylon-admins', 'rhpds-admins'],
    consoleURL: 'https://console-openshift-console.apps.babydev.dev.open.redhat.com',
    catalogNamespaces: [
      { name: 'test-namespace', displayName: 'Test Namespace' },
      { name: 'demo-namespace', displayName: 'Demo Namespace' }
    ],
    serviceNamespaces: [
      { name: 'user-jdisrael-redhat-com-1', displayName: 'User jdisrael@redhat.com' }
    ],
    userNamespace: { name: 'user-jdisrael-redhat-com-1', displayName: 'User jdisrael@redhat.com' },
    interface: 'rhpds'
  });
});

// Mock operation history
app.get('/api/ops/history', (req, res) => {
  res.json({
    entries: [
      {
        id: 'op-001',
        operationType: 'lock',
        performedBy: {
          username: 'jdisrael',
          email: 'jdisrael@redhat.com',
          displayName: 'Josh Israel'
        },
        timestamp: new Date(Date.now() - 60*60*1000).toISOString(),
        targetScope: {
          workshopCount: 3,
          namespaces: ['test-namespace'],
          filters: { stages: [], namespaces: [], statuses: [] }
        },
        parameters: {},
        results: {
          totalTargets: 3,
          successful: 3,
          failed: 0,
          executionTimeMs: 1200
        },
        status: 'completed'
      },
      {
        id: 'op-002',
        operationType: 'unlock',
        performedBy: {
          username: 'jdisrael',
          email: 'jdisrael@redhat.com',
          displayName: 'Josh Israel'
        },
        timestamp: new Date(Date.now() - 2*60*60*1000).toISOString(),
        targetScope: {
          workshopCount: 2,
          namespaces: ['demo-namespace'],
          filters: { stages: [], namespaces: [], statuses: [] }
        },
        parameters: {},
        results: {
          totalTargets: 2,
          successful: 1,
          failed: 1,
          executionTimeMs: 800
        },
        status: 'failed'
      }
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      totalCount: 2,
      totalPages: 1
    }
  });
});

// Mock workshops
app.get('/api/workshops', (req, res) => {
  res.json({
    items: [
      {
        metadata: {
          name: 'demo-workshop-001',
          namespace: 'test-namespace',
          creationTimestamp: new Date(Date.now() - 30*60*1000).toISOString(),
          labels: { 'babel.sh/workshop-user-count': '3' }
        },
        spec: {
          parameters: {
            destroy_after: new Date(Date.now() + 24*60*60*1000).toISOString()
          }
        },
        status: { phase: 'Running' }
      },
      {
        metadata: {
          name: 'demo-workshop-002',
          namespace: 'test-namespace',
          creationTimestamp: new Date(Date.now() - 60*60*1000).toISOString(),
          labels: { 'babel.sh/workshop-user-count': '5' }
        },
        spec: {
          parameters: {
            destroy_after: new Date(Date.now() + 48*60*60*1000).toISOString()
          }
        },
        status: { phase: 'Provisioning' }
      },
      {
        metadata: {
          name: 'demo-workshop-003',
          namespace: 'demo-namespace',
          creationTimestamp: new Date(Date.now() - 120*60*1000).toISOString(),
          labels: { 'babel.sh/workshop-user-count': '2' }
        },
        spec: {
          parameters: {
            destroy_after: new Date(Date.now() + 72*60*60*1000).toISOString()
          }
        },
        status: { phase: 'Failed' }
      }
    ]
  });
});

// Default fallback
app.use('*', (req, res) => {
  console.log(`Mock server received: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.listen(port, () => {
  console.log(`Mock server running on port ${port}`);
});