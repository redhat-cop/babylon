<template>
  <div class="co-namespace-bar">
    <div class="co-namespace-bar__items">
      <div class="co-namespace-selector">
        <div class="pf-c-dropdown">
          <DropdownToggle labelText="Catalog: all catalogs" isPlain="True" />
          <!-- FIXME -->
        </div>
      </div>
    </div>
  </div>
  <div id="content-scrollable" tabindex="-1">
    <div class="co-m-page__body">
      <div class="co-catalog">
        <div class="co-m-nav-title">
          <h1 class="co-m-pane__heading">
            <div class="co-m-pane__name co-resource-item">
              <span class="co-resource-item__resource-name">Catalog</span>
            </div>
          </h1>
        </div>
        <p class="co-catalog-page__description">Catalog description text...</p>
        <div class="co-catalog__body">
          <div class="loading-box loading-box__loaded">
            <div class="co-catalog-page">
              <div class="co-catalog-page__tabs">
                <CategorySelector
                  :categories="categories"
                  :selectedCategory="selectedCategory"
                  @categorySelected="onSelectCategory"
                />
              </div>
              <div class="co-catalog-page__content">
                <div class="co-catalog-page__header">
                  <div class="co-catalog-page__heading text-capitalize">{{ selectedCategory ? selectedCategory : 'All Items' }}</div>
                  <div class="co-catalog-page__filter">
                    <div>
                     <input placeholder="Filter by keyword..." class="pf-c-form-control co-catalog-page__input" type="text">
                    </div>
                    <div class="co-catalog-page__num-items">
                      {{ filteredCatalogItems.length }} items
                    </div>
                  </div>
                </div>
                <CatalogPageGrid>
                  <CatalogItemSelectorCard
                    v-for="catalogItem in filteredCatalogItems"
                    :key="catalogItem.metadata.uid"
                    :catalogItem="catalogItem"
                    @selected="$emit('selectCatalogItem', catalogItem)"
                  />
                </CatalogPageGrid>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import CatalogPageGrid from '@/components/CatalogPageGrid.vue'
import CategorySelector from '@/components/CategorySelector.vue'
import CatalogItemSelectorCard from '@/components/CatalogItemSelectorCard.vue'
import DropdownToggle from '@/components/DropdownToggle.vue'

export default {
  name: 'CatalogItemSelector',
  components: {
    CategorySelector,
    CatalogItemSelectorCard,
    CatalogPageGrid,
    DropdownToggle,
  },
  emits: ['selectCatalogItem', 'selectCategory'],
  props: ['selectedCategory'],
  data () {
    return {
      error: null,
      catalogItemsByNamespace: {},
    }
  },
  created () {
    window.consoleUrl.then(url => {
      this.consoleUrl = url
    });
    this.refresh();
  },
  computed: {
    filteredCatalogItems() {
      let catalogItems = [];
      for (const namespace in this.catalogItemsByNamespace) {
        const catalogItemsInNamespace = this.catalogItemsByNamespace[namespace];
        for (const uuid in catalogItemsInNamespace) {
          const catalogItem = catalogItemsInNamespace[uuid];
          if (!this.selectedCategory || (
            catalogItem.metadata.labels &&
            this.selectedCategory == catalogItem.metadata.labels['babylon.gpte.redhat.com/category'].replace('_', ' ')
          )) {
            catalogItems.push(catalogItem)
          }
        }
      }
      return catalogItems;
    },
    categories() {
      let categories = [];
      for (const namespace in this.catalogItemsByNamespace) {
        const catalogItemsInNamespace = this.catalogItemsByNamespace[namespace];
        for (const uuid in catalogItemsInNamespace) {
          const catalogItem = catalogItemsInNamespace[uuid];
          if (catalogItem.metadata.labels) {
            const category = catalogItem.metadata.labels['babylon.gpte.redhat.com/category'];
            if (category) {
              const categoryText = category.replace('_', ' ')
              if (!categories.includes(categoryText)) {
                categories.push(categoryText);
              }
            }
          }
        }
      }
      categories.sort();
      return categories;
    }
  },
  methods: {
    onSelectCategory (category) {
      this.$emit('selectCategory', category)
    },
    refresh () {
      window.apiSession
      .then(session => {
        for (let i = 0; i < session.catalogNamespaces.length; ++i) {
          this.refreshFromNamespace(session.catalogNamespaces[i]);
        }
      })
    },
    refreshFromNamespace (catalogNamespace) {
      window.apiSession
      .then(session =>
        fetch('/apis/babylon.gpte.redhat.com/v1/namespaces/' + catalogNamespace.name + '/catalogitems', {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        })
      ).then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.refreshCatalogItems(data.items);
          })
        } else if(response.status === 401) {
          this.error = 'Session expired, please refresh.'
        } else if(response.status === 403) {
          this.error = 'Sorry, it seems you do not have access.'
        } else {
          this.error = response.status
        }
      })
      .catch(error => {
        this.error = error
      });
    },
    refreshCatalogItems (catalogItems) {
      for (let i = 0; i < catalogItems.length; ++i) {
        this.refreshCatalogItem(catalogItems[i])
      }
    },
    refreshCatalogItem (catalogItem) {
      if (!this.catalogItemsByNamespace[catalogItem.metadata.namespace]) {
        this.catalogItemsByNamespace[catalogItem.metadata.namespace] = {}
      }
      this.catalogItemsByNamespace[catalogItem.metadata.namespace][catalogItem.metadata.uid] = catalogItem
    },
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

h1, .h1 {
    font-size: var(--pf-global--FontSize--2xl);
}

.co-catalog__body {
    min-width: 575px;
}

.co-catalog-page {
    background: #fff;
    border: 1px solid var(--pf-global--BorderColor--300);
    display: flex;
    flex: 1;
    margin: 0 15px;
    padding: 15px 0 0;
}

.co-catalog-page__description {
    margin-top: -10px;
    padding: 0 15px 10px;
}

.co-catalog-page {
    background: #fff;
    border: 1px solid var(--pf-global--BorderColor--300);
    display: flex;
    flex: 1;
    margin: 0 15px;
    padding: 15px 0 0;
}

.co-catalog-page__tabs {
    flex: 0 0 220px;
    margin: 0 15px 0 0;
}

.co-catalog-page__content {
    flex: 1 1 auto;
    overflow: hidden;
}

.vertical-tabs-pf {
    list-style: none;
    margin: 0 0 30px;
    padding: 0;
}

.vertical-tabs-pf.restrict-tabs.active-tab > .vertical-tabs-pf-tab {
    display: block;
}

.vertical-tabs-pf.restrict-tabs .vertical-tabs-pf-tab.active, .vertical-tabs-pf.restrict-tabs .vertical-tabs-pf-tab.active-descendant, .vertical-tabs-pf.restrict-tabs .vertical-tabs-pf-tab.shown {
    display: block;
}

.vertical-tabs-pf.restrict-tabs .vertical-tabs-pf-tab {
    display: none;
}

.vertical-tabs-pf-tab:first-of-type {
    margin-top: 0;
}

.vertical-tabs-pf-tab {
    margin-top: 4px;
    position: relative;
}

.vertical-tabs-pf-tab.active a {
    color: var(--pf-global--link--Color) !important;
}

.vertical-tabs-pf-tab.active > a {
    color: #0088ce;
}

.vertical-tabs-pf-tab > a {
    color: initial;
    display: inline-block;
    font-size: 13px;
    padding: 3px 6px 3px 15px;
    vertical-align: top;
    width: 100%;
    word-break: break-word;
}

.vertical-tabs-pf-tab.active a::before {
    background: var(--pf-global--link--Color);
}

.vertical-tabs-pf-tab.active>a::before {
    background: #0088ce;
    content: "\A0";
    left: 0;
    position: absolute;
    width: 3px;
}

.co-catalog-page__header {
    margin: 0 30px 0 0;
}

.co-catalog-page__heading {
    font-size: 16px;
    margin: 0 0 20px 30px;
}

.co-catalog-page__filter {
    display: flex;
    justify-content: space-between;
}

.co-catalog-page__num-items {
    font-weight: var(--pf-global--FontWeight--bold);
    padding: 0 0 20px;
}

.ocs-grid .ReactVirtualized__Grid__innerScrollContainer {
    width: 100% !important;
    max-width: 100% !important;
}

@media (min-width: 768px) {
  .co-catalog__body {
    min-width: 590px;
  }

  .co-namespace-bar {
    padding-left: 30px;
    padding-right: 30px;
  }

  .co-catalog-page__description {
    padding-left: 30px;
    padding-right: 30px;
  }
}
</style>
