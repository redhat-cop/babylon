<template>
  <div class="pf-c-page__sidebar-body">
    <nav class="pf-c-nav">
      <ul class="pf-c-nav__list">
        <CatalogSidebarSection
          v-for="section in sections"
          :key="section.name"
          :name="section.name"
          :title="section.title"
          :isCurrent="currentSection == section.name"
          :pages="section.pages"
          :currentPage="currentPage"
        />
      </ul>
    </nav>
  </div>
</template>

<script>
import CatalogSidebarSection from '@/components/CatalogSidebarSection.vue'

export default {
  components: {
    CatalogSidebarSection
  },
  props: ['currentSection', 'currentPage'],
  data () {
    return {
      sections: [{
        name: 'Services',
        title: 'Services',
        pages: [{
          name: 'Overview',
          title: 'Overview',
          path: '/v/services/overview'
        },{
          name: 'Catalog',
          title: 'Catalog',
          path: '/v/services/catalog'
        },{
          name: 'Requests',
          title: 'Requests',
          path: '/v/services/requests'
        }]
      }]
    }
  }
}
</script>
