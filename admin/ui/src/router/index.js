import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },{
    path: '/r/anarchygovernors',
    name: 'AnarchyGovernors',
    component: () => import('../views/AnarchyGovernors.vue')
  },{
    path: '/r/anarchygovernor/:namespace/:name',
    name: 'AnarchyGovernor',
    component: () => import('../views/AnarchyGovernor.vue')
  },{
    path: '/r/anarchysubjects',
    name: 'AnarchySubjects',
    component: () => import('../views/AnarchySubjects.vue')
  },{
    path: '/r/anarchysubject/:namespace/:name',
    name: 'AnarchySubject',
    component: () => import('../views/AnarchySubject.vue')
  },{
    path: '/r/anarchyactions',
    name: 'AnarchyActions',
    component: () => import('../views/AnarchyActions.vue')
  },{
    path: '/r/anarchyaction/:namespace/:name',
    name: 'AnarchyAction',
    component: () => import('../views/AnarchyAction.vue')
  },{
    path: '/r/anarchyruns',
    name: 'AnarchyRuns',
    component: () => import('../views/AnarchyRuns.vue')
  },{
    path: '/r/anarchyrun/:namespace/:name',
    name: 'AnarchyRun',
    component: () => import('../views/AnarchyRun.vue')
  },{
    path: '/r/resourcepools',
    name: 'ResourcePools',
    component: () => import('../views/ResourcePools.vue')
  },{
    path: '/r/resourcepool/:namespace/:name',
    name: 'ResourcePool',
    component: () => import('../views/ResourcePool.vue')
  },{
    path: '/r/resourcepool/createfrom/handle/:namespace/:name',
    name: 'ResourcePoolFromHandle',
    component: () => import('../views/ResourcePoolCreateFromHandle.vue')
  },{
    path: '/r/resourceclaims',
    name: 'ResourceClaims',
    component: () => import('../views/ResourceClaims.vue')
  },{
    path: '/r/resourceclaim/:namespace/:name',
    name: 'ResourceClaim',
    component: () => import('../views/ResourceClaim.vue')
  },{
    path: '/r/resourcehandles',
    name: 'ResourceHandles',
    component: () => import('../views/ResourceHandles.vue')
  },{
    path: '/r/resourcehandle/:namespace/:name',
    name: 'ResourceHandle',
    component: () => import('../views/ResourceHandle.vue')
  },{
    path: '/r/resourceprovider/:namespace/:name',
    name: 'ResourceProvider',
    component: () => import('../views/ResourceProvider.vue')
  },{
    path: '/r/resourceproviders',
    name: 'ResourceProviders',
    component: () => import('../views/ResourceProviders.vue')
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
