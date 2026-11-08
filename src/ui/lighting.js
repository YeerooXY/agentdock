// Lighting runs on one clock: every frame's wave reads its own window position
// and new continuous animations join the existing phase, including its pauses.
export function lighting() {
  let lightingFrame = 0;
  const lightingTiming = new WeakMap();
  const lightingPaused = new WeakMap();
  function changed() {
    if (lightingFrame) return;
    lightingFrame = requestAnimationFrame(() => {
      lightingFrame = 0;
      for (const node of document.querySelectorAll('.console-skin,.sidebar-edge')) node.style.setProperty('--panel-x', Math.round(node.getBoundingClientRect().left) + 'px');
      const groups = new Map();
      for (const animation of document.getAnimations()) {
        if (!/^light-(wave|breathe|spectrum)$/.test(animation.animationName || '')) continue;
        const group = groups.get(animation.animationName) || [];
        group.push(animation); groups.set(animation.animationName, group);
      }
      for (const group of groups.values()) {
        // Preserve progress when speed changes; ordinary publications leave existing clocks alone.
        for (const animation of group) {
          const previous = lightingTiming.get(animation), duration = animation.effect.getComputedTiming().duration;
          if (previous && previous !== duration && animation.currentTime != null) animation.currentTime *= duration / previous;
        }
        const reference = group.find(animation => lightingTiming.has(animation) && lightingPaused.get(animation) !== true && animation.playState === 'running')
          || group.find(animation => lightingTiming.has(animation) && animation.playState === 'running')
          || group[0];
        for (const animation of group) {
          const resumed = lightingPaused.get(animation) === true && animation.playState === 'running';
          if ((!lightingTiming.has(animation) || resumed) && animation !== reference) {
            const align = () => {
              if (animation.playState === 'idle' || reference.playState === 'idle') return;
              if (reference.startTime != null && reference.playState === 'running' && animation.playState === 'running') animation.startTime = reference.startTime;
              else animation.currentTime = reference.currentTime;
            };
            // Pending animations acquire their start times on the next browser paint.
            if (animation.pending || reference.pending) Promise.all([animation.ready, reference.ready]).then(align, () => {});
            else align();
          }
          lightingTiming.set(animation, animation.effect.getComputedTiming().duration);
          lightingPaused.set(animation, animation.playState === 'paused');
        }
      }
    });
  }
  // Reactive lighting: typing in a console or new output lights its frame.
  function lightUp(node) {
    if (!node || document.body.dataset.lighting !== 'reactive') return;
    node.classList.remove('lit'); void node.offsetWidth; node.classList.add('lit');
    clearTimeout(node.litTimer); node.litTimer = setTimeout(() => node.classList.remove('lit'), 1000);
  }
  // Listeners are installed by the app after its keyboard shortcuts, as before.
  function install() {
    addEventListener('resize', changed);
    document.addEventListener('keydown', event => lightUp(event.target.closest?.('.session-card')), true);
  }
  return { changed, lightUp, install };
}
