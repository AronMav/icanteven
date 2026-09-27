<script lang="ts">
  import { onMount } from 'svelte';
  import { paintPaper } from './lib/paper';

  let surface: HTMLCanvasElement;
  let ready = $state(false);

  onMount(() => {
    const repaint = () => {
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      ready = paintPaper(surface, bounds.width, bounds.height,
        document.documentElement.dataset.theme === 'dark');
    };
    const resize = new ResizeObserver(repaint);
    const theme = new MutationObserver(repaint);
    resize.observe(surface);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    repaint();
    return () => {
      resize.disconnect();
      theme.disconnect();
      surface.width = surface.height = 0;
    };
  });
</script>

<canvas bind:this={surface} class="paper-surface" class:ready data-paper-surface aria-hidden="true"></canvas>
