<template>
  <button
    class="pf-c-app-launcher__toggle"
    type="button"
    @click="$emit('activated')"
  >
    <DropdownToggle v-if="labelText" :icon="icon" :labelText="labelText" />
    <template v-else>
      <QuestionCircleIcon />
    </template>
  </button>
</template>


<script>
import DropdownToggle from '@/components/DropdownToggle.vue'
import QuestionCircleIcon from '@/components/icons/QuestionCircleIcon.vue'

export default {
  components: {
    DropdownToggle,
    QuestionCircleIcon,
  },
  props: ['icon', 'labelText'],
  emits: ['activated'],
}
</script>
