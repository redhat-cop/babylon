<template>
  <div class="pf-c-drawer pf-m-inline">
    <div class="pf-c-drawer__main">
      <div class="pf-c-drawer__content">
        <div class="pf-c-drawer__body">
          <div class="pf-c-page">
            <header class="pf-c-page__header">
              <CatalogHeader @toggleSidebarOpen="onToggleSidebarOpen()" />
            </header>
            <div id="page-sidebar"
              class="pf-c-page__sidebar"
              :class="sidebarOpen ? ['pf-m-expanded'] : ['pf-m-collapsed']"
            >
              <CatalogSidebar :currentSection="sectionName" :currentPage="pageName" />
            </div>
            <main
              class="pf-c-page__main"
              :class="sidebarOpen ? ['pf-m-sidebar-open'] : []"
              tabindex="-1"
            >
              <div class="pf-c-drawer pf-m-expanded">
                <div class="pf-c-drawer__main">
                  <div class="pf-c-drawer__content">
                    <section class="pf-c-page__main-section pf-m-light">
                      <div id="content">
                        <slot></slot>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import CatalogHeader from '@/components/CatalogHeader.vue'
import CatalogSidebar from '@/components/CatalogSidebar.vue'

export default {
  components: {
    CatalogHeader,
    CatalogSidebar
  },
  props: ['sectionName', 'pageName', 'content'],
  data () {
    return {
      sidebarOpen: true,
    }
  },
  mounted() {
    window.addEventListener('resize', this.onWindowResize);
    this.onWindowResize();
  },
  methods: {
    onToggleSidebarOpen() {
      this.sidebarOpen = !this.sidebarOpen;
    },
    onWindowResize() {
      if (window.innerWidth < 1200) {
        this.sidebarOpen = false;
      } else {
        this.sidebarOpen = true;
      }
    },
  }
}
</script>

<style>
.pf-c-page .pf-c-page__main-section {
    overflow: hidden;
    --pf-c-page__main-section--PaddingBottom: 0;
    --pf-c-page__main-section--PaddingLeft: 0;
    --pf-c-page__main-section--PaddingRight: 0;
    --pf-c-page__main-section--PaddingTop: 0;
}
</style>
