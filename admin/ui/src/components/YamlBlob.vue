<template>
  <div class="yaml-blob">{{yaml}}</div>
</template>

<script>
import * as jsYaml from 'js-yaml'

export default {
  name: 'YamlBlob',
  props: ['obj'],
  computed: {
    yaml () {
      return jsYaml.dump(this.obj, {noArrayIndent: true})
    }
  }
}
</script>

<style>
.yaml-blob {
  color: #dddddd;
  background-color: #111111;
  text-align: left;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-left: 5px;
  padding-right: 5px;
  white-space: pre;
}
</style>
