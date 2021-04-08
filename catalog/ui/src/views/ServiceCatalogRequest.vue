<template>
  <Drawer>
    <MainPage
      sectionName='Services'
      pageName='Catalog'
    >
      <div id="content">
        <div id="content-scrollable" tabindex="-1">
          <div class="loading-box loading-box__loaded" v-if="catalogItem">
            <div class="co-create-operand__header">
              <div class="co-m-nav-title olm-create-operand__page-heading">
                <h1 class="co-m-pane__heading">
                  <div class="co-m-pane__name co-resource-item"> 
                    <span data-test-id="resource-title" class="co-resource-item__resource-name">Request {{ title }}</span>
                  </div>
                </h1>
                <span class="help-block">Request by completing the form. Default values may be provided by the catalog authors.</span>
              </div>
            </div>
            <div class="co-m-pane__body">
              <form class="co-dynamic_form">
                <label class="form-label">Name</label>
                <input type="text"
                  class="pf-c-form-control"
                  pattern="[a-z0-9.\-]+"
                  max="50"
                  :placeholder="catalogItem.metadata.name + '-*'"
                >
                <div v-if="errorMessage" class="pf-c-alert pf-m-inline pf-m-danger co-alert co-break-word co-alert--scrollable" aria-label="Danger Alert" data-ouia-component-type="PF4/Alert" data-ouia-safe="true" data-ouia-component-id="317">
                  <div class="pf-c-alert__icon"><svg fill="currentColor" height="1em" width="1em" viewBox="0 0 512 512" aria-hidden="true" role="img" style="vertical-align: -0.125em;"><path d="M504 256c0 136.997-111.043 248-248 248S8 392.997 8 256C8 119.083 119.043 8 256 8s248 111.083 248 248zm-248 50c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z" transform=""></path></svg></div>
                  <h4 class="pf-c-alert__title"><span class="pf-u-screen-reader">Danger alert:</span>Error</h4>
                  <div class="pf-c-alert__description">{{ errorMessage }}</div>
                </div>
                <div class="pf-c-form__group pf-m-action pf-c-form">
                  <div class="pf-c-form__group-control">
                    <div class="pf-c-form__actions">
                      <button
                        class="pf-c-button pf-m-primary"
                        type="submit"
                        @click="onRequest($event)"
                      >Request</button>
                      <button
                        class="pf-c-button pf-m-secondary"
                        type="button"
                        @click="onCancel"
                      >Cancel</button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </MainPage>
  </Drawer>
</template>

<script>
import Drawer from '@/components/Drawer.vue'
import MainPage from '@/components/MainPage.vue'
/*
import { applyOperation } from 'fast-json-patch';
applyOperation(data, { op: 'add', path: '/metadata/name', value: data.metadata.name });
*/

export default {
  name: 'ServiceCatalogRequest',
  components: {
    Drawer,
    MainPage,
  },
  data () {
    return {
      catalogItem: null,
      errorMessage: null,
      userNamespace: null,
    }
  },
  computed: {
    title() {
      if (this.catalogItem.metadata.annotations) {
        return this.catalogItem.metadata.annotations['babylon.gpte.redhat.com/displayName'] || this.catalogItem.metadata.name
      }
      return this.catalogItem.metadata.name
    },
  },
  methods: {
    onCancel() {
      this.$router.push('/v/services/catalog');
    },
    loadCatalogItem(namespace, name) {
      window.apiSession
      .then(session => {
        this.userNamespace = session.userNamespace;
        return fetch(
          '/apis/babylon.gpte.redhat.com/v1/namespaces/' + namespace + '/catalogitems/' + name,
          {
            headers: {
              'Authentication': 'Bearer ' + session.token
            }
          }
        )}
      ).then(response => {
        if (response.status === 200) {
          response.json().then(data => {
            this.catalogItem = data;
          })
        }
      });
    },
    onRequest(event) {
      event.preventDefault();
      let requestResourceClaim = {
        apiVersion: 'poolboy.gpte.redhat.com/v1',
        kind: 'ResourceClaim',
        metadata: {
          labels: {
            'babylon.gpte.redhat.com/catalogitem-namespace': this.catalogItem.metadata.namespace,
            'babylon.gpte.redhat.com/catalogitem-name': this.catalogItem.metadata.name,
          }
        },
        spec: {
          resources: JSON.parse(JSON.stringify(this.catalogItem.spec.resources)),
        }
      };
      // FIXME - use name field
      requestResourceClaim.metadata.generateName = this.catalogItem.metadata.name + '-';
      // FIXME - get form parameters
      window.apiSession.then(session => {
        fetch(
          '/apis/poolboy.gpte.redhat.com/v1/namespaces/' + this.userNamespace + '/resourceclaims',
          {
            method: 'POST',
            body: JSON.stringify(requestResourceClaim),
            headers: {
              'Authentication': 'Bearer ' + session.token,
              'Content-Type': 'application/json'
            }
          }
        ).then(response => {
          if (response.status === 201) {
            response.json().then(resourceClaim =>
              this.$router.push('/v/services/requests/' + resourceClaim.metadata.namespace + '/' + resourceClaim.metadata.name)
            )
          } else {
            response.json().then(errorBody => {
              this.errorMessage = errorBody.message;
            })
          }
        }).catch(error => {
          this.errorMessage = error
        });
      })
    }
  },
  mounted () {
    this.loadCatalogItem(
      this.$route.params.namespace, this.$route.params.name
    );
  }
}
</script>

<style>

#content-scrollable {
    display: flex;
    flex-direction: column;
    overflow-x: auto;
    overflow-y: auto;
    position: relative;
    -webkit-overflow-scrolling: touch;
    height: 100%;
}

.loading-box {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
}

.olm-create-operand__page-heading {
    padding: 0;
    margin: 0;
}

.co-create-operand__header {
  border-bottom: 1px solid #ccc;
}

.olm-create-operand__page-heading .co-m-pane__heading {
    margin: 0;
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
    font-size: var(--pf-global--FontSize--2xl);
    font-weight: bold;
}

.help-block {
    display: block;
    margin-top: 5px;
    margin-bottom: 10px;
    color: #767676;
}

.co-m-pane__body {
    margin: 30px 0 0;
    padding: 0 15px 30px;
}

.form-label {
    font-weight: 600;
    display: inline-block;
    max-width: 100%;
    margin-bottom: 5px;
    font-weight: bold;
}

.co-required {
  position: relative;
}

.co-required:after {
    color: #a30000;
    content: '*';
    font-size: 14px;
    padding-left: 3px;
    position: absolute;
    top: 0;
}

@media (min-width: 768px) {
  .co-create-operand__header {
    padding: 10px 30px 0px;
  }
  .co-m-pane__body {
    padding-left: 30px;
    padding-right: 30px;
  }
}

</style>
