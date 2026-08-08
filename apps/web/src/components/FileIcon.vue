<script setup>
import { computed } from 'vue';

/**
 * Flat file-type icon: a solid page with a folded corner and the extension
 * as a label. Pure inline SVG — no icon font, no external assets.
 */
const props = defineProps({
  filename: { type: String, required: true },
  size: { type: Number, default: 30 }
});

const TYPES = {
  pdf: { label: 'PDF', color: '#dc2626' },
  doc: { label: 'DOC', color: '#2563eb' },
  docx: { label: 'DOC', color: '#2563eb' },
  xls: { label: 'XLS', color: '#16a34a' },
  xlsx: { label: 'XLS', color: '#16a34a' },
  csv: { label: 'CSV', color: '#16a34a' },
  ppt: { label: 'PPT', color: '#ea580c' },
  pptx: { label: 'PPT', color: '#ea580c' },
  md: { label: 'MD', color: '#475569' },
  txt: { label: 'TXT', color: '#475569' },
  png: { label: 'IMG', color: '#9333ea' },
  jpg: { label: 'IMG', color: '#9333ea' },
  jpeg: { label: 'IMG', color: '#9333ea' },
  gif: { label: 'IMG', color: '#9333ea' },
  svg: { label: 'IMG', color: '#9333ea' }
};

const type = computed(() => {
  const ext = props.filename.split('.').pop()?.toLowerCase() || '';
  return TYPES[ext] || { label: ext.slice(0, 4).toUpperCase() || 'FILE', color: '#64748b' };
});
</script>

<template>
  <svg
    :width="size"
    :height="Math.round(size * 1.2)"
    viewBox="0 0 40 48"
    aria-hidden="true"
  >
    <path
      d="M4 6a6 6 0 0 1 6-6h16l14 14v28a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z"
      :fill="type.color"
    />
    <path d="M26 0l14 14h-10a4 4 0 0 1-4-4z" fill="#000" opacity="0.22" />
    <text
      x="20"
      y="39"
      text-anchor="middle"
      fill="#fff"
      font-size="11"
      font-weight="700"
      font-family="inherit"
    >{{ type.label }}</text>
  </svg>
</template>
