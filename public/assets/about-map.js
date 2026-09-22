(() => {
  const atlas = document.getElementById('sourcingAtlas');
  if (!atlas) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || !('IntersectionObserver' in window)) return;
  atlas.classList.add('will-animate');
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    atlas.classList.add('is-drawn');
    observer.disconnect();
  }, { threshold: .15 });
  observer.observe(atlas);
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      atlas.classList.remove('will-animate');
      observer.disconnect();
    }
  });
})();
