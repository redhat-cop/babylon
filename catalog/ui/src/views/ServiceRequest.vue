<template>
  <MainPage
    sectionName='Services'
    pageName='Requests'
  >
    <div v-if="resourceClaim" class="co-resourceclaim">
      <h1 class="co-resourceclaim__title">{{ resourceClaim.metadata.name }}</h1>
      <div class="co-resourceclaim__controls">
        <button class="pf-c-button pf-m-primary" @click="deleteResourceClaim">Delete</button>
      </div>
      <div class="co-resourceclaim__property">
        <div class="co-resourceclaim__property-label">
          Creation
        </div>
        <div class="co-resourceclaim__property-value">
          {{ resourceClaim.metadata.creationTimestamp }}
        </div>
        <template v-if="catalogItemName">
          <div class="co-resourceclaim__property-label">
            Catalog Item
          </div>
          <div class="co-resourceclaim__property-value">
            {{ catalogItemDisplayName || catalogItemName }}
          </div>
        </template>
      </div>
      <h2 class="co-resourceclaim__resources-header">Resources</h2>
      <ResourceClaimResource
        v-for="(resource, index) in resourceClaim.spec.resources"
        :key="index"
        :resourceClaim="resourceClaim"
        :resource="resource"
        :resourceIndex="index"
        :resourceStatus="(resourceClaim.status && resourceClaim.status.resources) ? resourceClaim.status.resources[index] : null"
      />
    </div>
  </MainPage>
</template>

<script>
import MainPage from '@/components/MainPage.vue'
import ResourceClaimResource from '@/components/ResourceClaimResource.vue'

export default {
  name: 'ServiceRequest',
  components: {
    MainPage,
    ResourceClaimResource,
  },
  data () {
    return {
      catalogItem: null,
      catalogItemDisplayName: null,
      catalogItemName: null,
      catalogItemNamespace: null,
      refreshInterval: null,
      resourceClaim: null,
    }
  },
  methods: {
    deleteResourceClaim() {
      window.apiSession
      .then(session =>
        fetch(
          '/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourceclaims/' + this.$route.params.name,
          {
            method: 'DELETE',
            headers: {
              'Authentication': 'Bearer ' + session.token
            }
          }
        )
      ).then(response => {
        if (response.status === 200) {
          this.$router.push('/v/services/requests');
        }
      });
    },
    refresh() {
      if (!this.$route.params.namespace || !this.$route.params.name) {
        return;
      }
      window.apiSession
      .then(session =>
        fetch(
          '/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.$route.params.namespace + '/resourceclaims/' + this.$route.params.name,
          {
            headers: {
              'Authentication': 'Bearer ' + session.token
            }
          }
        )
      ).then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.resourceClaim = data;
            this.refreshCatalogItem();
          })
        }
      });
    },
    refreshCatalogItem() {
      if (!this.resourceClaim.metadata.labels) {
        return;
      }
      this.catalogItemName = this.resourceClaim.metadata.labels['babylon.gpte.redhat.com/catalogitem-name'];
      this.catalogItemNamespace = this.resourceClaim.metadata.labels['babylon.gpte.redhat.com/catalogitem-namespace'];
      if (!this.catalogItemName || !this.catalogItemNamespace) {
        return;
      }
      window.apiSession
      .then(session =>
        fetch(
          '/apis/babylon.gpte.redhat.com/v1/namespaces/' + this.catalogItemNamespace + '/catalogitems/' + this.catalogItemName,
          {
            headers: {
              'Authentication': 'Bearer ' + session.token
            }
          }
        )
      ).then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.catalogItem = data;
            if (this.catalogItem.metadata.annotations) {
              this.catalogItemDisplayName = this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/displayName'];
            }
          })
        }
      });
    }
  },
  mounted () {
    this.refresh();
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(this.refresh, 5000);
    }
  },
  unmounted () {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}
</script>

<style>
.co-resourceclaim {
  margin: 15px;
}
.co-resourceclaim__title {
  font-size: var(--pf-global--FontSize--3xl);
}
.co-resourceclaim__resources-header {
  font-size: var(--pf-global--FontSize--2xl);
}

.co-resourceclaim__property {
  display: grid;
  grid-template-columns: 1fr 4fr;
  margin: 10px 0 10px 0;
}

.co-resourceclaim__property-label {
  font-weight: bold;
}

.co-resourceclaim__property-value {
}
</style>
