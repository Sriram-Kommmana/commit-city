// Always loaded, and tiny. The game itself downloads only when someone presses Play.
// With JavaScript off, or if the game fails to load, every Play link stays a normal link
// to the portfolio, so a visitor never sees a broken screen.
document.addEventListener('click', async (event) => {
  const link = (event.target as Element).closest<HTMLElement>('[data-play]');
  if (!link) return;
  event.preventDefault();
  try {
    const { startGame } = await import('./game');
    startGame(link.dataset.play || undefined);
  } catch (error) {
    console.error('Story mode could not load', error);
    location.hash = 'about';
  }
});
