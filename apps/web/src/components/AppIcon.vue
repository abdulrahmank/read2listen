<script setup>
defineProps({ name: String, size: { type: Number, default: 22 } });
const paths = {
  headphones: 'M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v7h4v-7H4Zm16 0h1v7h-4v-7h3ZM17 20c-1 2-3 2-5 2',
  book: 'M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2m0-16c4-3 8-2 10-1v15c-3-1-7-1-10 2V5Z',
  ask: 'M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM8 10h.01M12 10h.01M16 10h.01',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  check: 'm5 12 4 4L19 6',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  play: 'm8 4 12 8-12 8V4Z'
};
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.book" /></svg></template>
