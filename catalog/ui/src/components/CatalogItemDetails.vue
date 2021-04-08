<template>
  <div id="modal-container" class="pf-c-backdrop__open">
    <div>
      <div class="pf-c-backdrop">
        <div class="pf-l-bullseye">
          <div id="pf-modal-part-4" class="pf-c-modal-box ocs-modal co-catalog-page__overlay co-catalog-page__overlay--right" style="width: 900px">
            <button class="pf-c-button pf-m-plain" type="button" @click="$emit('closed')">
              <TimesIcon/>
            </button>
            <header class="pf-c-modal-box__header">
              <header class="catalog-item-header-pf">
                <img v-if="iconName"
                  class="catalog-item-header-pf-icon"
                  :alt="iconName"
                  :src="publicPath + 'icons/' + iconName + '.png'"
                >
                <i v-else class="pf-icon pf-icon-package catalog-item-header-pf-icon"></i>
                <div class="catalog-item-header-pf-text">
                  <h1 class="catalog-item-header-pf-title">{{ title }}</h1>
                  <h5 class="catalog-item-header-pf-subtitle">{{ subtitle }}</h5>
                </div>
              </header>
              <div class="co-catalog-page__overlay-actions">
                <a
                  class="pf-c-button pf-m-primary co-catalog-page__overlay-action"
                  role="button"
                  title="Request"
                  @click="$router.push('/v/services/catalog/request/' + catalogItem.metadata.namespace + '/' + catalogItem.metadata.name)"
                >Request</a>
              </div>
            </header>
            <div id="pf-modal-part-4" class="pf-c-modal-box__body">
              <div class="modal-body modal-body-border">
                <div class="modal-body-content">
                  <div class="modal-body-inner-shadow-covers">
                    <div class="co-catalog-page__overlay-body">
                      <div class="properties-side-panel-pf">
                        <div class="properties-side-panel-pf-property">
                          <h5 data-pf-content="true" class="properties-side-panel-pf-property-label">Provider</h5>
                          <div class="properties-side-panel-pf-property-value">{{ provider }}</div>
                        </div>
                        <div class="properties-side-panel-pf-property">
                          <h5 data-pf-content="true" class="properties-side-panel-pf-property-label">Created At</h5>
                          <div class="properties-side-panel-pf-property-value">
                            <div class="co-timestamp co-icon-and-text">
                              <UTCIcon/>
                              <span aria-describedby="pf-tooltip-1138">{{ catalogItem.metadata.creationTimestamp }}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="co-catalog-page__overlay-description">
                        <h2 class="co-section-heading">
                          <span class="">Description</span>
                        </h2>
                        {{ description }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import TimesIcon from '@/components/icons/TimesIcon.vue'
import UTCIcon from '@/components/icons/UTCIcon.vue'

export default {
  name: 'CatalogItemDetails',
  props: ['catalogItem'],
  emits: ['closed'],
  components: {
    TimesIcon,
    UTCIcon,
  },
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
    provider() {
      if (this.catalogItem.metadata.annotations && this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/provider']) {
        return this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/provider'];
      }
      return 'GPTE';
    },
    subtitle() {
      return 'Provided by ' + this.provider;
    },
    title() {
      if (this.catalogItem.metadata.annotations) {
        return this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/displayName'] || this.catalogItem.metadata.name
      }
      return this.catalogItem.metadata.name
    },
  }
}
</script>

<style>
@media screen and (min-width: 992px)
.pf-c-modal-box.co-catalog-page__overlay {
    width: 900px;
}

.co-catalog-page__overlay--right {
    bottom: 0;
    padding: 0 !important;
    right: 0;
    top: 4.75rem;
}

.co-catalog-page__overlay {
  border: 0 !important;
}

.pf-c-modal-box, .pf-c-switch {
  --pf-global--FontSize--md: 1rem;
}

.ocs-modal {
    position: absolute !important;
}

.co-catalog-page__overlay-actions {
    display: flex;
    flex-wrap: wrap;
    padding: var(--pf-global--spacer--lg) var(--pf-global--spacer--md) var(--pf-global--spacer--md) 0;
    white-space: normal;
}

.co-catalog-page__overlay-action {
    align-items: baseline;
    display: inline-flex !important;
    margin: var(--pf-global--spacer--sm) var(--pf-global--spacer--sm) 0 0;
    overflow-x: hidden;
}

.co-catalog-page__overlay-body {
    margin: 0;
    display: flex;
    padding-left: var(--pf-global--spacer--lg);
    padding-right: var(--pf-global--spacer--lg);
    padding-top: var(--pf-global--spacer--md);
}

.co-catalog-page__overlay--right .modal-body-inner-shadow-covers {
    padding-left: 0 !important;
    padding-right: 0 !important;
}

.modal-body-inner-shadow-covers {
    min-height: 100%;
    padding: 0 var(--pf-global--spacer--xl) var(--pf-global--spacer--xl);
    background-attachment: local;
    background-image: linear-gradient(#fff 30%, rgba(255,255,255,0)),linear-gradient(rgba(255,255,255,0), #fff 70%);
    background-position: 0 0, 0 100%;
    background-repeat: no-repeat;
    background-size: 100% 12px;
    width: 100%;
}

.modal-body-border {
    border-top: 1px solid #d2d2d2;
}

.modal-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    padding: 0;
    background-attachment: scroll;
    background-image: radial-gradient(ellipse at top, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 90%),radial-gradient(ellipse at bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 90%);
    background-position: 0 0, 0 100%;
    background-repeat: no-repeat;
    background-size: 100% 5px;
    -webkit-overflow-scrolling: touch;
    position: relative;
}

.co-catalog-page__overlay--right .pf-c-modal-box__body {
    display: flex;
    flex-direction: column;
    margin: 0 !important;
    padding: 0;
}

.properties-side-panel-pf {
    width: 165px;
}

.co-catalog-page__overlay .properties-side-panel-pf {
    flex: 0 0 auto;
}

.properties-side-panel-pf-property:first-of-type {
    margin-top: 0;
}

.properties-side-panel-pf-property {
    margin-top: 24px;
}

.properties-side-panel-pf-property-label {
    font-weight: 700 !important;
    font-size: 14px !important;
    margin: 0 !important;
}

.pf-c-modal-box__header + .pf-c-modal-box__body {
    --pf-c-modal-box__body--PaddingTop: var(--pf-c-modal-box__header--body--PaddingTop);
}

.properties-side-panel-pf-property-value {
    font-size: 14px !important;
    margin-top: 8px;
    word-break: break-word;
}

@media (min-width: 768px) {
  .co-catalog-page__overlay-body {
    display: flex;
  }

  .pf-c-modal-box.co-catalog-page__overlay {
    width: 600px;
  }

  .co-catalog-page__overlay-description {
    flex: 1 1 auto;
    margin-left: 20px;
    margin-top: 0;
  }
}

.co-catalog-page__overlay-description {
    margin: 0;
    white-space: pre-wrap;
}

.co-catalog-page__overlay-description h2 {
    font-size: 20px;
}

.co-catalog-page__overlay-description h1, .co-catalog-page__overlay-description h2, .co-catalog-page__overlay-description h3 {
    color: #333;
}

.co-section-heading {
    font-weight: bold;
    display: flex;
    justify-content: space-between;
    margin: 0 0 20px 0;
}

.catalog-item-header-pf {
    display: flex;
    align-items: center;
}

.catalog-item-header-pf-icon {
    font-size: 60px;
    max-height: 60px;
    width: 60px;
}

.catalog-item-header-pf-text {
    margin-left: 20px;
}
</style>
