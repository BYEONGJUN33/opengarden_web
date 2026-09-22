(() => {
  const atlas = document.getElementById('sourcingAtlas');
  if (!atlas) return;
  const routes = [...atlas.querySelectorAll('[data-route-group]')];
  const labels = [...atlas.querySelectorAll('[data-country-group]')];
  const selectors = [...atlas.querySelectorAll('[data-atlas-group]')];
  const pause = document.getElementById('atlasPause');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, timer, visible = false, paused = false;
  function show(index) {
    current = index;
    routes.forEach((route, i) => route.classList.toggle('active', i === index));
    labels.forEach((label, i) => { label.hidden = i !== index; });
    selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  function sync() {
    clearInterval(timer);
    const running = visible && !document.hidden && !paused && !reduced.matches;
    atlas.classList.toggle('is-running', running);
    pause.hidden = reduced.matches;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? '자동 전환 재생' : '자동 전환 일시정지';
    if (running) timer = setInterval(() => show((current + 1) % routes.length), 6000);
  }
  selectors.forEach((button, index) => button.addEventListener('click', () => {
    paused = true;
    show(index);
    sync();
  }));
  pause.addEventListener('click', () => { paused = !paused; sync(); });
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: .15 }).observe(atlas);
  } else { visible = true; }
  sync();
})();
