<template>
  <Drawer>
    <CatalogItemDetails
      v-if="selectedCatalogItem"
      :catalogItem="selectedCatalogItem"
      @closed="onSelectedClosed"
    />
    <MainPage sectionName='Services' pageName='Catalog'>
      <CatalogItemSelector
        :selectedCategory="selectedCategory"
        @selectCatalogItem="onSelectCatalogItem"
        @selectCategory="onSelectCategory"
      />
    </MainPage>
  </Drawer>
</template>

<script>
import MainPage from '@/components/MainPage.vue'
import CatalogItemSelector from '@/components/CatalogItemSelector.vue'
import CatalogItemDetails from '@/components/CatalogItemDetails.vue'
import Drawer from '@/components/Drawer.vue'

export default {
  name: 'ServicesCatalog',
  components: {
    CatalogItemSelector,
    CatalogItemDetails,
    Drawer,
    MainPage,
  },
  data () {
    return {
      selectedCatalogItem: null,
      selectedCategory: null,
    }
  },
  methods: {
    loadSelectedCatalogItem(namespace, name) {
      window.apiSession
      .then(session =>
        fetch('/apis/babylon.gpte.redhat.com/v1/namespaces/' + namespace + '/catalogitems/' + name, {
          headers: {
            'Authentication': 'Bearer ' + session.token
          }
        })
      ).then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.selectedCatalogItem = data
          })
        }
      });
    },
    onSelectCatalogItem(catalogItem) {
      this.selectedCatalogItem = catalogItem;
      let path = (
        '/v/services/catalog?' +
        'namespace=' + catalogItem.metadata.namespace + '&' +
        'name=' + catalogItem.metadata.name
      );
      if (this.selectedCategory) {
        path += '&category=' + encodeURI(this.selectedCategory);
      }
      this.$router.push(path);
    },
    onSelectCategory(category) {
      this.selectedCategory = category;
      this.$router.push('/v/services/catalog?category=' + encodeURI(category));
    },
    onSelectedClosed() {
      let path = '/v/services/catalog';
      if (this.selectedCategory) {
        path += '?category=' + encodeURI(this.selectedCategory);
      }
      this.$router.push(path);
      this.selectedCatalogItem = null;
    }
  },
  mounted () {
    this.selectedCategory = this.$route.query.category;
    if (this.$route.query.namespace && this.$route.query.name) {
      this.loadSelectedCatalogItem(this.$route.query.namespace, this.$route.query.name);
    }
  }
}
</script>
