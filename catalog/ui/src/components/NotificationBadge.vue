<template>
  <button
    class="pf-c-app-launcher__toggle"
    type="button"
    @click="$emit('activated')"
  >
    <BellIcon />
  </button>
</template>


<script>
import BellIcon from '@/components/icons/BellIcon.vue'

export default {
  components: {
    BellIcon,
  },
  props: ['icon'],
  emits: ['activated'],
}
</script>
