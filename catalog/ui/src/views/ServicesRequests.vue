<template>
  <MainPage
    sectionName='Services'
    pageName='Requests'
  >
    <div id="content">
      <div id="content-scrollable" tabindex="-1">
        <div class="co-m-page__body">
          <div class="co-catalog">
            <div class="co-m-nav-title">
              <h1 class="co-m-pane__heading">
                <div class="co-m-pane__name co-resource-item">
                  <span class="co-resource-item__resource-name">Service Requests</span>
                </div>
              </h1>
            </div>
            <div class="co-catalog__body">
              <div class="loading-box loading-box__loaded">
                <div class="co-catalog-page">
                  <div class="co-catalog-page__content">
                    <div class="co-catalog-page__header">
                      <div class="co-catalog-page__filter">
                        <div class="co-catalog-page__num-items">
                          {{ resourceClaims.length }} items
                        </div>
                      </div>
                    </div>
                    <CatalogPageGrid>
                      <ResourceClaimSelectorCard
                        v-for="resourceClaim in resourceClaims"
                        :key="resourceClaim.metadata.uid"
                        :resourceClaim="resourceClaim"
                      />
                    </CatalogPageGrid>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </MainPage>
</template>

<script>
import CatalogPageGrid from '@/components/CatalogPageGrid.vue'
import MainPage from '@/components/MainPage.vue'
import ResourceClaimSelectorCard from '@/components/ResourceClaimSelectorCard.vue'

export default {
  name: 'ServiceRequests',
  components: {
    CatalogPageGrid,
    MainPage,
    ResourceClaimSelectorCard,
  },
  data () {
    return {
      resourceClaims: [],
    }
  },
  methods: {
    refresh() {
      window.apiSession
      .then(session =>
        fetch(
          '/apis/poolboy.gpte.redhat.com/v1/namespaces/' + session.userNamespace + '/resourceclaims',
          {
            headers: {
              'Authentication': 'Bearer ' + session.token
            }
          }
        )
      ).then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.resourceClaims = data.items
          })
        }
      });

    }
  },
  created () {
    this.refresh()
  }
}
</script>

<style>
.co-namespace-bar {
    border-bottom: 1px solid #ccc;
    padding: 0 15px;
    white-space: nowrap;
}

.co-namespace-bar__items {
    align-items: center;
    display: flex;
}

.co-namespace-selector {
    margin-right: 20px;
    max-width: 60%;
}

.co-namespace-selector .pf-c-dropdown__toggle.pf-m-plain:not(:disabled) {
    color: inherit;
}

.co-m-page__body {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
}

.co-catalog {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    min-width: 515px;
    padding: 0 0 15px;
}

.co-m-nav-title {
    margin-top: 30px;
    padding: 0 15px 0;
}

.co-m-pane__heading {
    display: flex;
    justify-content: space-between;
    margin: 0 0 30px;
}

.co-resource-item {
    align-items: baseline;
    display: flex;
    min-width: 0;
    min-width: 0;
    overflow-wrap: break-word;
    word-break: break-word;
}

.co-resource-item__resource-name {
    min-width: 0;
}

.co-resource-item {
    align-items: baseline;
    display: flex;
    min-width: 0;
    min-width: 0;
    overflow-wrap: break-word;
    word-break: break-word;
}

.co-resource-item__resource-name {
    min-width: 0;
}

.co-catalog-page__num-items {
    font-weight: var(--pf-global--FontWeight--bold);
    padding: 0 0 20px;
}

.co-catalog-page {
    background: #fff;
    border: 1px solid var(--pf-global--BorderColor--300);
    flex: 1;
    margin: 0 15px;
    padding: 15px 0 0;
}
</style>
