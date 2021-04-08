import { createRouter, createWebHistory } from 'vue-router'
import ServicesOverview from '../views/ServicesOverview.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: ServicesOverview
  },{
    path: '/v/services/overview',
    name: 'ServicesOverview',
    component: ServicesOverview
  },{
    path: '/v/services/catalog',
    name: 'ServicesCatalog',
    component: () => import('@/views/ServicesCatalog.vue')
  },{
    path: '/v/services/catalog/request/:namespace/:name',
    name: 'ServiceCatalogRequest',
    component: () => import('@/views/ServiceCatalogRequest.vue')
  },{
    path: '/v/services/requests',
    name: 'ServicesRequests',
    component: () => import('@/views/ServicesRequests.vue')
  },{
    path: '/v/services/requests/:namespace/:name',
    name: 'ServiceRequest',
    component: () => import('@/views/ServiceRequest.vue')
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
