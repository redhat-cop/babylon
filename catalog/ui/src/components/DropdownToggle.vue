<template>
  <span class="pf-c-dropdown__toggle" :class="isPlain ? ['pf-m-plain'] : []">
    <span class="pf-c-dropdown__toggle-text" v-if='labelText'>{{ labelText }}</span>&nbsp;
    <span class="pf-c-dropdown__toggle-icon">
      <CaretDownIcon />
    </span>
  </span>
</template>

<script>
import CaretDownIcon from '@/components/icons/CaretDownIcon.vue'

export default {
  components: {
    CaretDownIcon,
  },
  props: ['isPlain', 'labelText']
}
</script>
