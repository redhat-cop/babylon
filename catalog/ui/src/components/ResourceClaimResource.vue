<template>
  <div class="co-resource">
    <h3 class="co-resource__name">{{ resource.provider.name }}</h3>
    <div v-if="resourceStatus && resourceStatus.state">
      <div class="co-resource__property">
        <div class="co-resource__property-label">
          Provider
        </div>
        <div class="co-resource__property-value">
          {{ resource.provider.name }}
        </div>
      </div>
      <div class="co-resource__property">
        <div class="co-resource__property-label">
          Current State
        </div>
        <div class="co-resource__property-value">
          {{ resourceStatus.state.spec.vars.current_state ? resourceStatus.state.spec.vars.current_state : '...' }}
        </div>
      </div>
      <div class="co-resource__property">
        <div class="co-resource__property-label">
          Desired State
        </div>
        <div class="co-resource__property-value">
          {{ resourceStatus.state.spec.vars.desired_state ? resourceStatus.state.spec.vars.desired_state : '...' }}
        </div>
      </div>
      <div class="co-resource__property" v-if="resourceStatus.state.spec.vars.provision_messages">
        <div class="co-resource__property-label">
          Provision Messages
        </div>
        <div class="co-resource__property-value">
          <div class="co-provisionmessage"
            v-for="(msg, index) in resourceStatus.state.spec.vars.provision_messages"
            :key="index"
          >{{ msg }}</div>
        </div>
      </div>
      <div class="co-resource__property" v-if="resourceStatus.state.spec.vars.provision_data">
        <div class="co-resource__property-label">
          Provision Data
        </div>
        <div class="co-resource__property-values">
          <template
            v-for="(value, key) in resourceStatus.state.spec.vars.provision_data"
            :key="key"
          >
            <div class="co-property-value-key">{{ key }}</div>
            <div class="co-property-value-value">{{ value }}</div>
          </template>
        </div>
      </div>
    </div>
    <div v-else>pending...</div>
  </div>
</template>

<script>
export default {
  name: 'ResourceClaimResource',
  props: ['resourceIndex', 'resourceClaim', 'resource', 'resourceStatus']
}
</script>

<style>
.co-resource__name {
  font-size: var(--pf-global--FontSize--xl);
}

.co-resource__property {
  display: grid;
  grid-template-columns: 1fr 4fr;
  margin: 10px 0 10px 0;
}

.co-resource__property-label {
  font-weight: bold;
}

.co-resource__property-value {
}

.co-resource__property-values {
  display: grid;
  grid-template-columns: 1fr 3fr;
}

.co-provisionmessage {
  font-family: var(--pf-global--FontFamily--monospace);
  white-space: pre;
}

.co-property-value-key {
  font-family: var(--pf-global--FontFamily--monospace);
  white-space: pre;
}

.co-property-value-value {
  font-family: var(--pf-global--FontFamily--monospace);
  white-space: pre;
}
</style>
