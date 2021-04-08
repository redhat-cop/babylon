<template>
  <span class="pf-c-nav__toggle" @click="$emit('activated')">
    <span class="pf-c-nav__toggle-icon">
      <AngleDownIcon/>
    </span>
  </span>
</template>

<script>
import AngleDownIcon from '@/components/icons/AngleDownIcon.vue'

export default {
  components: {
    AngleDownIcon
  },
  emits: ['activated']
}
</script>
