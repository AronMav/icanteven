<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { copy, wordLabel } from './lib/copy';
  import { countWords } from './lib/words';
  import { applyTheme, readTheme, saveTheme, type ThemePreference } from './lib/theme';
  import { capturePaper } from './lib/snapshot';
  import { openAboutOnFirstVisit } from './lib/first-visit';
  import { createStatistics, type Statistics } from './lib/statistics';
  import type { BurnHandle } from './lib/burn';
  import PaperSurface from './PaperSurface.svelte';
  import AshIcon from './AshIcon.svelte';

  type Stage = 'writing' | 'burning' | 'done';
  let totals = $state<Statistics | null>(null);
  const statistics = createStatistics(undefined, undefined, undefined, (next) => {
    // Concurrent responses can arrive in a different order from increments.
    totals = { dispersed: Math.max(totals?.dispersed ?? 0, next.dispersed) };
  });
  let stage = $state<Stage>('writing');
  let note = $state('');
  let wordCount = $state(0);
  let theme = $state<ThemePreference>('system');
  let editor = $state<HTMLTextAreaElement>();
  let paper = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  let sceneHost = $state<HTMLDivElement>();
  let sceneReady = $state(false);
  let aboutDialog = $state<HTMLDialogElement>();
  let aboutDetailsOpen = $state(false);
  let viewportHeight = $state<number>();
  let viewportTop = $state(0);
  let firstVisitAbout = false;
  let aboutBackdropPressed = false;

  function showAbout() {
    aboutDetailsOpen = false;
    aboutDialog?.showModal();
    if (aboutDialog) aboutDialog.scrollTop = 0;
  }

  async function startWriting() {
    aboutDialog?.close();
    if (stage === 'done') await newNote();
    else if (stage === 'writing') {
      await tick();
      editor?.focus({ preventScroll: true });
    }
  }

  function syncViewport() {
    const viewport = window.visualViewport;
    // Pinch zoom must keep the writing layout intact and allow normal panning.
    // Keep the captured paper's dimensions stable while the keyboard closes.
    if (stage === 'burning' || (viewport && Math.abs(viewport.scale - 1) > 0.01)) return;
    viewportHeight = viewport?.height ?? window.innerHeight;
    viewportTop = viewport?.offsetTop ?? 0;
  }

  function isAboutBackdrop(event: MouseEvent): boolean {
    if (!aboutDialog || event.target !== aboutDialog) return false;
    const bounds = aboutDialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  let activeTooltip = $state<'privacy' | 'dispersed' | null>(null);
  let anotherButton = $state<HTMLButtonElement>();
  let editorVersion = $state(0);
  let countTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let scene: BurnHandle | undefined;
  let snapshot: HTMLCanvasElement | null = null;
  let generation = 0;
  let sceneModule: Promise<typeof import('./lib/disintegration') | null> | undefined;

  function loadScene() {
    return sceneModule ??= import('./lib/disintegration').catch(() => null);
  }

  function updateNote(event: Event) {
    note = (event.currentTarget as HTMLTextAreaElement).value;
    if (note && !matchMedia('(prefers-reduced-motion: reduce)').matches) void loadScene();
    clearTimeout(countTimer);
    if (note.length < 10000) wordCount = countWords(note);
    else countTimer = setTimeout(() => { wordCount = countWords(note); }, 120);
  }

  function changeTheme(event: Event) {
    theme = (event.currentTarget as HTMLInputElement).value as ThemePreference;
    saveTheme(theme);
    if (stage !== 'burning') applyTheme(theme);
  }

  function clearText() {
    clearTimeout(countTimer);
    note = '';
    wordCount = 0;
    if (editor) editor.value = '';
    editorVersion++;
  }

  function disposeScene() {
    clearTimeout(fallbackTimer);
    scene?.cancel();
    scene = undefined;
    if (snapshot) snapshot.width = snapshot.height = 0;
    snapshot = null;
    if (canvas) canvas.width = canvas.height = 0;
  }

  async function completeScene(token: number) {
    if (token !== generation || stage !== 'burning') return;
    disposeScene();
    stage = 'done';
    syncViewport();
    applyTheme(theme);
    await tick();
    anotherButton?.focus({ preventScroll: true });
  }

  async function destroyNote() {
    if (stage !== 'writing' || !note.trim()) return;
    const token = ++generation;
    // Capture first, then remove the textarea itself to drop its undo history.
    try {
      snapshot = paper && editor ? capturePaper(paper, editor) : null;
    } catch { snapshot = null; }
    clearText();
    sceneReady = false;
    stage = 'burning';
    statistics.disperse();
    fallbackTimer = setTimeout(() => { void completeScene(token); }, 14000);
    await tick();
    if (token !== generation || stage !== 'burning') return;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (snapshot && canvas) {
      canvas.width = snapshot.width;
      canvas.height = snapshot.height;
      canvas.getContext('2d')?.drawImage(snapshot, 0, 0);
    }
    if (!snapshot || reducedMotion) {
      // No animation library or graphics support is required to delete a note.
      if (snapshot && canvas) {
        canvas.classList.add('fade-paper');
      }
      clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => { void completeScene(token); }, 260);
      return;
    }
    const module = await loadScene();
    if (token !== generation || stage !== 'burning') return;
    if (!module || !sceneHost || !snapshot) { await completeScene(token); return; }
    try {
      scene = module.disintegratePaper(sceneHost, snapshot, () => {
        if (token === generation && stage === 'burning') sceneReady = true;
      });
      await scene.finished;
    } catch { /* The note is already gone; graphics must never block completion. */ }
    await completeScene(token);
  }

  async function newNote() {
    stage = 'writing';
    await tick();
    editor?.focus({ preventScroll: true });
  }

  function resetPage() {
    generation++;
    disposeScene();
    clearText();
    stage = 'writing';
    aboutDialog?.close();
    activeTooltip = null;
    applyTheme(theme);
    syncViewport();
  }

  onMount(() => {
    statistics.load();
    theme = readTheme();
    applyTheme(theme);
    // Proactively overwrite any value restored by browser form restoration.
    clearText();
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    syncViewport();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    if (aboutDialog) firstVisitAbout = openAboutOnFirstVisit(showAbout);
    const onScheme = () => { if (theme === 'system' && stage !== 'burning') applyTheme(theme); };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        resetPage();
      }
      // Initial pageshow can arrive after a person has already started typing
      // while fonts load. Only discard a value restored outside app state.
      else if (editor && editor.value !== note) editor.value = note;
    };
    const onVisibility = () => { if (document.hidden && stage === 'burning') void completeScene(generation); };
    scheme.addEventListener('change', onScheme);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('pagehide', resetPage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      generation++;
      clearText();
      disposeScene();
      scheme.removeEventListener('change', onScheme);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('pagehide', resetPage);
      document.removeEventListener('visibilitychange', onVisibility);
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
    };
  });
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') activeTooltip = null; }} />

{#if stage === 'writing'}
  <a class="skip-link" href="#note">{copy.skip}</a>
{/if}

<div class="site-shell"
  class:compact-height={viewportHeight !== undefined && viewportHeight <= 560}
  style:--viewport-height={viewportHeight === undefined ? '100dvh' : `${viewportHeight}px`}
  style:--viewport-top={`${viewportTop}px`}>
  <header class="site-header">
    <div class="wordmark" aria-label={copy.domain}>
      <svg class="brand-symbol" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 23C10 24 9 8 16 8C24 8 27 24 20 24C12 24 10 12 17 10C25 8 23 27 28 24" /></svg>
      <h1>{copy.brand}</h1>
    </div>
    <nav class="header-actions" aria-label={copy.navigation}>
      <button class="quiet-button about-button" onclick={showAbout}>{copy.about}</button>
      <fieldset class="theme-control">
        <legend class="sr-only">{copy.theme}</legend>
        {#each Object.entries(copy.themeOptions) as [value, label]}
          <label class="theme-option" title={label}>
            <input type="radio" name="theme" {value} checked={theme === value} onchange={changeTheme} aria-label={label} />
            <span>
              {#if value === 'system'}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M9 20h6m-3-4v4"/></svg>
              {:else if value === 'light'}<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>
              {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>{/if}
            </span>
          </label>
        {/each}
      </fieldset>
      <a class="github-link" href="https://github.com/AronMav/icanteven" target="_blank" rel="noopener noreferrer" aria-label={copy.github} title={copy.github}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
      </a>
    </nav>
  </header>

  <main class="workspace">
    <section class="writing-space" aria-label={copy.pageLabel}>
      <div class="paper-stage">
        {#if stage === 'writing'}
          <div class="paper" bind:this={paper}>
            <PaperSurface />
            <div class="paper-content">
              <div class="paper-header"><output class="word-count" data-snapshot for="note" aria-live="off">{wordLabel(wordCount)}</output></div>
              {#key editorVersion}
                <textarea bind:this={editor} id="note" aria-label={copy.pageLabel} aria-describedby="privacy-note refresh-note" value={note} oninput={updateNote} spellcheck="false" autocomplete="off" autocapitalize="sentences" name="ephemeral-note" wrap="soft"></textarea>
              {/key}
              {#if !note}<div class="empty-hint" aria-hidden="true"><span>{copy.emptyHint}</span></div>{/if}
            </div>
          </div>
        {:else if stage === 'burning'}
          <canvas class="burn-canvas" class:scene-ready={sceneReady} bind:this={canvas} aria-hidden="true"></canvas>
          <div class="burn-scene" class:scene-ready={sceneReady} bind:this={sceneHost} aria-hidden="true"></div>
        {:else}
          <div class="completion">
            <svg class="ash-mark" viewBox="0 0 100 60" aria-hidden="true"><path d="M10 40c17 4 17-25 35-24s20 28 45 9" /></svg>
            <h2>{copy.done}</h2>
            <button class="action-button again-button" bind:this={anotherButton} onclick={newNote}>{copy.another}</button>
          </div>
        {/if}
      </div>

      <div class="page-tools">
        <div class="editor-bottom">
        {#if stage === 'writing'}
          <div class="writing-actions">
            <button class="action-button burn-button" onclick={destroyNote} disabled={!note.trim()}>
              <AshIcon />
              {copy.disperse}
            </button>
          </div>
        {/if}
      </div>
        <div class="paper-utilities">
        <div class="privacy-notes" role="group" aria-label={copy.aboutPrivacyTitle}
          onpointerenter={() => { activeTooltip = 'privacy'; }}
          onpointerleave={(event) => { if (activeTooltip === 'privacy' && !event.currentTarget.contains(document.activeElement)) activeTooltip = null; }}>
          <button class="privacy-button" aria-label={copy.aboutPrivacyTitle} aria-describedby="privacy-tooltip"
            onfocus={() => { activeTooltip = 'privacy'; }} onblur={() => { if (activeTooltip === 'privacy') activeTooltip = null; }}
            onclick={() => { activeTooltip = 'privacy'; }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3m-3 4v2"/></svg>
          </button>
          <div class="privacy-tooltip" id="privacy-tooltip" role="tooltip" hidden={activeTooltip !== 'privacy'}>
            <p id="privacy-note">{copy.privacy}</p><p id="refresh-note">{copy.refresh}</p>
          </div>
        </div>
        <button class="about-mobile" aria-label={copy.about} onclick={showAbout}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 11v6m0-10v.5"/></svg>
        </button>
        <div class="site-statistics" role="group" aria-label={copy.statisticsTitle}>
          <div role="group" aria-label={copy.statisticsDispersed}
            onpointerenter={() => { activeTooltip = 'dispersed'; }}
            onpointerleave={(event) => { if (activeTooltip === 'dispersed' && !event.currentTarget.contains(document.activeElement)) activeTooltip = null; }}>
          <button class="statistics-button" aria-describedby="dispersed-tooltip"
            onfocus={() => { activeTooltip = 'dispersed'; }} onblur={() => { if (activeTooltip === 'dispersed') activeTooltip = null; }}
            onclick={() => { activeTooltip = 'dispersed'; }}>
            <AshIcon />
            <span class="sr-only">{copy.statisticsDispersed} </span><strong>{totals ? totals.dispersed.toLocaleString('ru-RU') : copy.statisticsUnknown}</strong>
          </button>
          <div class="privacy-tooltip" id="dispersed-tooltip" role="tooltip" hidden={activeTooltip !== 'dispersed'}>
            <p>{copy.statisticsDispersedDescription}</p>
            {#if !totals}<p>{copy.statisticsUnavailable}</p>{/if}
          </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  </main>

</div>

<div class="sr-only" role="status" aria-live="polite">{stage === 'burning' ? copy.dispersing : stage === 'done' ? copy.done : ''}</div>

<dialog bind:this={aboutDialog} class="about-dialog" aria-labelledby="about-title"
  style:--viewport-height={viewportHeight === undefined ? '100dvh' : `${viewportHeight}px`}
  onpointerdown={(event) => { aboutBackdropPressed = isAboutBackdrop(event); }}
  onclick={(event) => {
    if (aboutBackdropPressed && isAboutBackdrop(event)) aboutDialog?.close();
    aboutBackdropPressed = false;
  }}
  onclose={() => {
    aboutBackdropPressed = false;
    if (firstVisitAbout) {
      firstVisitAbout = false;
      if (stage === 'writing') editor?.focus({ preventScroll: true });
    }
  }}>
  <div class="dialog-top"><span class="dialog-wordmark">{copy.brand}</span><button class="close-button" aria-label={copy.close} onclick={() => aboutDialog?.close()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
  <h2 id="about-title">{copy.aboutTitle}</h2><p>{copy.aboutBody}</p>
  <p>{copy.aboutHowTo}</p>
  <p class="about-privacy">{copy.aboutPrivacyShort}</p>
  {#if stage !== 'burning'}
    <button class="action-button about-start" onclick={startWriting}>{note ? copy.continueWriting : copy.startWriting}</button>
  {/if}
  <details class="about-details" bind:open={aboutDetailsOpen}>
    <summary>{copy.aboutDetails}</summary>
    <h3>{copy.aboutWritingTitle}</h3><p>{copy.aboutWritingBody}</p>
    <h3>{copy.aboutHelpTitle}</h3><p>{copy.aboutHelpBody}</p><p>{copy.aboutPracticeBody}</p>
    <h3>{copy.aboutPrivacyTitle}</h3><p>{copy.aboutPrivacy}</p><p>{copy.aboutPreferences}</p>
    {#if statistics.active}<p>{copy.aboutStatistics}</p>{/if}
    <div class="dialog-closing">{copy.aboutClosing}</div>
  </details>
  <footer class="about-copyright">{copy.aboutCopyright}</footer>
</dialog>
