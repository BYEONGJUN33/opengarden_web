// Load the existing docent only after the visitor chooses to explore it.
(() => {
  const start = document.getElementById('demoStart');
  const reset = document.getElementById('demoReset');
  const cover = document.getElementById('demoCover');
  const frame = document.getElementById('docentDemo');
  if (!start || !reset || !cover || !frame) return;
  start.addEventListener('click', () => {
    frame.src = '/docent/ipark.html';
    cover.hidden = true;
    reset.hidden = false;
    frame.focus();
  });
  reset.addEventListener('click', () => {
    frame.removeAttribute('src');
    cover.hidden = false;
    reset.hidden = true;
    start.focus();
  });
})();
