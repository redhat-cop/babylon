<template>
  <div class="co-catalog-page__grid-item">
    <a class="pf-c-card pf-m-hoverable catalog-tile-pf co-catalog-tile" @click="$emit('selected')">
      <div class="pf-c-card__header">
        <img v-if="iconName"
          class="catalog-tile-pf-icon"
          :alt="iconName"
          :src="publicPath + 'icons/' + iconName + '.png'"
        >
        <i v-else class="pf-icon pf-icon-package catalog-tile-pf-icon"></i>
        <div class="pf-c-card__actions">
          <div class="catalog-tile-pf-badge-container">
            <span>
              <span class="catalog-tile-pf-badge">
                <span class="pf-c-badge pf-m-read">{{ typeDisplay }}</span>
              </span>
            </span>
          </div>
        </div>
      </div>
      <div class="pf-c-card__title catalog-tile-pf-header">
        <div class="catalog-tile-pf-title">{{ title }}</div>
        <div class="catalog-tile-pf-subtitle">{{ subtitle }}</div>
      </div>
      <div class="pf-c-card__body catalog-tile-pf-body">
        <div class="catalog-tile-pf-description"><span>{{ description }}</span></div>
      </div>
    </a>
  </div>
</template>

<script>

export default {
  name: 'CatalogItemSelectorCard',
  components: {
  },
  props: ['catalogItem'],
  computed: {
    description() {
      let description = null;
      if (this.catalogItem.metadata.annotations) {
        description = this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/description'];
      }
      if (description) {
        return description;
      } else {
        return 'No description available.'
      }
    },
    iconName() {
      if (this.catalogItem.metadata.annotations) {
        return this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/icon'];
      } else {
        return null;
      }
    },
    title() {
      if (this.catalogItem.metadata.annotations) {
        return this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/displayName'] || this.catalogItem.metadata.name
      }
      return this.catalogItem.metadata.name
    },
    subtitle() {
      if (this.catalogItem.metadata.annotations && this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/provider']) {
        return 'provided by ' + this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/provider'];
      }
      return 'provided by GPTE';
    },
    typeDisplay() {
      let ret = null;
      if (this.catalogItem.metadata.labels) {
        ret = this.catalogItem.metadata.labels['babylon.gpte.redhat.com/type'];
      }
      if (ret) {
        return ret;
      } else {
        return 'config';
      }
    }
  },
  data () {
    return {
      publicPath: process.env.BASE_URL,
    }
  },
  emits: ['selected']
}
</script>

<style>
.co-catalog-page__grid-item {
  height: 260px;
  margin: 0px;
}

.catalog-tile-pf-icon {
    font-size: 40px;
    height: 40px;
    max-width: 60px;
    min-width: 40px;
}

a.pf-c-card.pf-m-hoverable.catalog-tile-pf.co-catalog-tile {
  color: black;
}

a.pf-c-card.pf-m-hoverable.catalog-tile-pf.co-catalog-tile:hover {
  text-decoration: none
}

.catalog-tile-pf-badge-container {
    display: flex;
    flex: 1;
    justify-content: flex-end;
}

.catalog-tile-pf-header .catalog-tile-pf-title {
    font-size: 15px;
    font-weight: 400;
}

.catalog-tile-pf-title {
    min-width: 0;
    overflow-wrap: break-word;
    word-break: break-word;
}

.catalog-tile-pf-header .catalog-tile-pf-subtitle {
    color: #8b8d8f;
    font-size: 13px;
    font-weight: initial;
}

.catalog-tile-pf-description {
    margin-top: 0;
}

.catalog-tile-pf-description span {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
}
</style>
