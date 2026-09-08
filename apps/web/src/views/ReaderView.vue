<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocuments } from '../composables/useDocuments.js';
import { useTenant } from '../composables/useTenant.js';
import DocumentReader from '../components/DocumentReader.vue';
import { progressKey } from '../listeningProgress.js';
import UploadBook from '../components/UploadBook.vue';
import BookCover from '../components/BookCover.vue';
import AppIcon from '../components/AppIcon.vue';
import ListeningBuddy from '../components/ListeningBuddy.vue';

const player = ref(null);
const progressRevision = ref(0);
function savedProgress(doc) {
  void progressRevision.value;
  try { const value = JSON.parse(localStorage.getItem(progressKey(tenant.value?.id, doc.id))); return value?.length ? Math.min(100, Math.round(value.offset / value.length * 100)) : 0; } catch { return 0; }
}
async function uploaded(doc) { documents.value = [doc, ...documents.value.filter(item => item.id !== doc.id)]; await router.push({ name: 'reader-document', params: { documentId: doc.id } }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function dailyListen() { player.value?.startDaily(); document.querySelector('.reading-desk')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
const route = useRoute();
const router = useRouter();
const { documents, loading, error, load } = useDocuments();
const { isAdmin, tenant } = useTenant();
function recentRead() {
  let recent;
  for (const doc of documents.value) {
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey(tenant.value?.id, doc.id)));
      if (saved?.version === 1 && saved.offset > 0 && !saved.finished && Number.isFinite(saved.updatedAt) && (!recent || saved.updatedAt > recent.updatedAt)) recent = { doc, updatedAt: saved.updatedAt };
    } catch {}
  }
  return recent?.doc || documents.value[0];
}
const selected = computed(() => route.params.documentId
  ? documents.value.find(doc => doc.id === route.params.documentId)
  : recentRead());

onMounted(load);
</script>

<template>
  <div class="page reader-page">
    <header class="reader-heading">
      <div><p class="eyebrow">A LITTLE TIME, A LITTLE DISCOVERY</p><h1>Your reading list.<br /><span>Now, your listening list.</span></h1><p>Good books. Great ideas. A little more room for both.</p></div>
      <UploadBook v-if="isAdmin()" compact @uploaded="uploaded" />
    </header>
    <div v-if="loading" class="loading-library" role="status"><span class="loading-dot"></span> Finding your next listen…</div>
    <div v-else-if="error" class="error-banner" role="alert">{{ error }} <button @click="load">Try again</button></div>
    <template v-else>
      <div class="listening-layout">
        <div class="listening-main">
          <section v-if="selected" class="panel reading-desk">
            <div class="section-kicker"><span class="status-dot"></span>{{ savedProgress(selected) ? 'PICK UP WHERE YOU LEFT OFF' : 'YOUR NEXT LISTEN' }}<AppIcon name="headphones" :size="18" /></div>
            <header class="reading-title"><BookCover :title="selected.name" compact /><div><p class="book-kind">{{ selected.filename?.split('.').pop().toUpperCase() }} · FROM YOUR LIBRARY</p><h2>{{ selected.name }}</h2><p>Press play. Let the pages come to you.</p></div></header>
            <DocumentReader ref="player" :key="selected.id" :document="selected" @progress="progressRevision++" />
          </section>
          <section v-else-if="route.params.documentId" class="panel welcome-card"><h2>This read isn’t available</h2><p>It may have been removed from your library.</p><router-link to="/">Back to my listening list</router-link></section>
          <section v-else class="panel welcome-card"><ListeningBuddy /><p class="eyebrow">YOUR FIRST CHAPTER STARTS HERE</p><h2>That book can finally<br />leave your “someday” list.</h2><p>Upload a book or article, pick a voice, and listen while you walk, work, or simply take a break.</p><UploadBook v-if="isAdmin()" @uploaded="uploaded" /><p v-else>Ask your library admin to add your first book or article.</p></section>
          <section v-if="documents.length" class="listening-shelf">
            <header><div><h2>Your listening shelf</h2><p>{{ documents.length }} {{ documents.length === 1 ? 'read' : 'reads' }} waiting for a little of your time</p></div><router-link to="/documents">View all <AppIcon name="arrow" :size="16" /></router-link></header>
            <div class="shelf-grid"><button v-for="doc in documents.slice(0, 6)" :key="doc.id" class="shelf-book" :class="{ selected: doc.id === selected?.id }" @click="router.push({ name: 'reader-document', params: { documentId: doc.id } })" :aria-label="`Listen to ${doc.name}`" :aria-pressed="doc.id === selected?.id"><BookCover :title="doc.name" compact /><strong>{{ doc.name }}</strong><span>{{ savedProgress(doc) >= 100 ? 'Finished · Listen again' : savedProgress(doc) ? `${savedProgress(doc)}% complete` : 'Ready when you are' }}</span><progress :value="savedProgress(doc)" max="100" :aria-label="`Progress for ${doc.name}`"></progress></button></div>
          </section>
        </div>
        <aside class="listening-aside">
          <section class="daily-card"><div class="aside-kicker"><AppIcon name="spark" :size="18" /> YOUR NEXT SMALL WIN</div><ListeningBuddy /><h2>Just 10 minutes.<br />Something new.</h2><p>A chapter at your desk.<br />An idea on your next walk.<br />Small moments add up.</p><button v-if="selected" :disabled="!player?.readyForSession" @click="dailyListen">Listen for 10 minutes <AppIcon name="arrow" :size="17" /></button><p v-else class="small-note">Add your first read to get started.</p><span v-if="selected" class="small-note">We’ll set a sleep timer for you.</span></section>
          <section class="how-it-works"><h3>Your books, your rhythm.</h3><div><span>1</span><p><strong>Bring a book</strong>Upload a PDF or text file.</p></div><div><span>2</span><p><strong>Make it yours</strong>Choose a voice and a pace.</p></div><div><span>3</span><p><strong>Find your moment</strong>Press play. Pick up anytime.</p></div></section>
        </aside>
      </div>
    </template>
  </div>
</template>
<style scoped>
.reader-page { max-width: 1300px; padding-top: 42px; }.reader-heading { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 34px; }.reader-heading h1 { font-size: clamp(30px, 3.1vw, 43px); line-height: 1.14; letter-spacing: -1.8px; margin: 0 0 13px; }.reader-heading h1 span { color: #718261; }.reader-heading > div > p:last-child { color: var(--muted); font-size: 14px; margin: 0; }.listening-layout { display: grid; grid-template-columns: minmax(0, 1fr) 248px; gap: 26px; align-items: start; }.listening-main { min-width: 0; }.reading-desk { padding: 25px 28px; box-shadow: 0 4px 0 #e4e8dd80; scroll-margin-top: 90px; }.section-kicker { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 10px; letter-spacing: 1.4px; font-weight: 800; margin-bottom: 25px; }.section-kicker svg { margin-left: auto; }.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #84ad50; }.reading-title { display: flex; gap: 24px; align-items: center; margin-bottom: 22px; }.reading-title .book-cover { width: 112px; flex-shrink: 0; }.reading-title h2 { font-size: 26px; line-height: 1.2; letter-spacing: -.8px; overflow-wrap: anywhere; margin: 10px 0; }.reading-title p { color: var(--muted); font-size: 12px; line-height: 1.6; margin: 0; }.reading-title .book-kind { font-size: 9px; letter-spacing: 1.4px; font-weight: 700; }.daily-card { background: #f0f5e5; border: 1px solid #dfe8cd; border-radius: 22px; padding: 24px; text-align: center; }.aside-kicker { display: flex; gap: 6px; align-items: center; justify-content: center; font-size: 9px; letter-spacing: 1px; font-weight: 800; color: #688448; }.daily-card > svg { width: 148px; margin: 20px auto 3px; }.daily-card h2 { font-size: 23px; line-height: 1.25; letter-spacing: -.7px; margin: 10px 0; }.daily-card p { font-size: 13px; line-height: 1.85; color: var(--muted); }.daily-card button { width: 100%; font-size: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; border-color: #c9d9ae; box-shadow: 0 2px 0 #d6e2c4; color: var(--accent); padding: 11px 7px; }.small-note { display: block; font-size: 10px !important; margin-top: 11px; color: var(--muted); }.how-it-works { padding: 20px 12px; }.how-it-works h3 { font-size: 14px; margin: 7px 0 20px; }.how-it-works > div { display: flex; gap: 12px; margin-bottom: 19px; align-items: center; }.how-it-works > div > span { display: grid; place-items: center; width: 27px; height: 27px; flex-shrink: 0; border: 1px solid var(--border); border-radius: 9px; font-size: 11px; color: var(--accent); }.how-it-works p { margin: 0; font-size: 11px; line-height: 1.8; color: var(--muted); }.how-it-works strong { display: block; font-size: 12px; color: var(--text); }.listening-shelf { margin-top: 34px; }.listening-shelf header { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 20px; }.listening-shelf h2 { margin: 0 0 6px; font-size: 20px; letter-spacing: -.5px; }.listening-shelf header p { margin: 0; font-size: 12px; color: var(--muted); }.listening-shelf header a { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--accent); text-decoration: none; white-space: nowrap; }.shelf-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }.shelf-book { padding: 10px; text-align: left; min-width: 0; border-color: transparent; background: transparent; }.shelf-book.selected { background: #f0f5e8; border-color: #dce7cb; }.shelf-book:hover { background: #f0f5e8; }.shelf-book > strong { display: block; font-size: 13px; margin-top: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.shelf-book > span { display: block; font-size: 10px; color: var(--muted); margin-top: 6px; }.shelf-book progress { width: 100%; height: 4px; accent-color: var(--accent); }.welcome-card { padding: 26px; text-align: center; }.welcome-card > svg { width: 180px; }.welcome-card > h2 { font-size: 31px; line-height: 1.15; letter-spacing: -1px; margin: 0; }.welcome-card > p:not(.eyebrow) { color: var(--muted); font-size: 14px; line-height: 1.8; margin: 16px auto 26px; max-width: 340px; }.loading-library { padding: 50px; text-align: center; color: var(--muted); }.loading-dot { display: inline-block; width: 9px; height: 9px; background: #84ad50; border-radius: 50%; margin-right: 10px; }
@media(max-width: 1150px) { .listening-layout { grid-template-columns: minmax(0, 1fr) 210px; gap: 18px; }.daily-card { padding: 20px 14px; }.reader-heading { align-items: flex-start; }.reading-desk { padding: 22px; } }
@media(max-width: 980px) { .listening-layout { grid-template-columns: minmax(0, 1fr); }.listening-aside { display: none; }.reader-heading h1 { font-size: 34px; } }
@media(max-width: 600px) { .reader-heading { flex-direction: column; gap: 20px; margin-bottom: 26px; }.reader-heading h1 { font-size: 34px; }.reader-heading .eyebrow { font-size: 9px; }.reading-desk { padding: 20px 17px; }.reading-title { gap: 17px; }.reading-title .book-cover { width: 88px; }.reading-title h2 { font-size: 22px; }.shelf-grid { gap: 7px; grid-template-columns: repeat(2,minmax(0,1fr)); }.reading-title p { font-size: 11px; }.welcome-card { padding: 20px 15px; }.welcome-card > h2 { font-size: 26px; }.section-kicker { font-size: 8px; letter-spacing: 1px; } }
</style>
