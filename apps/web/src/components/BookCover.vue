<script setup>
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
const props = defineProps({ title: String, compact: Boolean });
const color = computed(() => ['sage', 'peach', 'lilac', 'blue'][Array.from(props.title || '').reduce((total, char) => total + char.charCodeAt(0), 0) % 4]);
</script>
<template>
  <div class="book-cover" :class="[color, { compact }]" aria-hidden="true">
    <span class="cover-edition">YOUR NEXT DISCOVERY</span>
    <strong>{{ title }}</strong>
    <div class="cover-art"><i></i><i></i><i></i><AppIcon name="headphones" :size="compact ? 24 : 40" /></div>
    <span class="cover-footer">read2listen <span>✦</span></span>
  </div>
</template>
<style scoped>
.book-cover { --cover: #d9e8c9; --ink: #36573d; position: relative; overflow: hidden; background: var(--cover); color: var(--ink); border-radius: 7px 15px 15px 7px; box-shadow: inset 7px 0 #00000009, 5px 7px 0 #2136210b; aspect-ratio: 3/4; display: flex; flex-direction: column; padding: 22px; width: 100%; }
.peach { --cover: #f6d4bc; --ink: #825239; }.lilac { --cover: #e1d7ef; --ink: #665581; }.blue { --cover: #d5e5f1; --ink: #3f657e; }
.cover-edition { font-size: 8px; letter-spacing: 2px; font-weight: 800; }
strong { font: 600 24px/1.18 Georgia, serif; margin-top: 18px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; z-index: 1; }
.cover-art { position: relative; display: grid; place-items: center; flex: 1; min-height: 50px; margin: 8px 0; }
.cover-art i { position: absolute; width: 60%; aspect-ratio: 1; border: 1px solid currentColor; border-radius: 50%; opacity: .25; }.cover-art i:nth-child(2) { transform: translateX(-18%); }.cover-art i:nth-child(3) { transform: translateX(18%); }
.cover-footer { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; }
.compact { padding: 12px; }.compact strong { font-size: 18px; margin-top: 12px; }.compact .cover-edition { font-size: 6px; letter-spacing: 1px; }.compact .cover-footer { font-size: 8px; }
</style>
