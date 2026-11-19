// Fixed scenes for screenshots. `?shot=` picks one:
//   cover          the cover alone, sized to the browser window (landscape)
//   editor         the editor with a sample photo loaded
//   cover-square   the cover alone at 1080 x 1080
//   cover-portrait the cover alone at 1080 x 1350
// `layout`, `grade`, `caption` and `tagline` query values shape the scene;
// `photos` names the sample per panel (boulevard or pier).
// `apply` receives the scene; main.js loads the samples and paints it.

/** The scene for a shot name, or null when the name is unknown. */
export function shotScene(shot, query) {
  const title = query.get('caption') ?? 'VICE NIGHTS';
  const tagline = query.get('tagline') ?? 'One city. One night. No brakes.';
  const layout = query.get('layout') ?? 'hero';
  const grade = query.get('grade') ?? 'sunset';
  const photos = (query.get('photos') ?? 'pier,boulevard,pier').split(',');
  const base = { layout, grade, title, tagline, photos };
  if (shot === 'cover') return { ...base, coverOnly: true, size: null };
  if (shot === 'editor') return { ...base, coverOnly: false, size: null };
  if (shot === 'cover-square') return { ...base, coverOnly: true, size: [1080, 1080] };
  if (shot === 'cover-portrait') return { ...base, coverOnly: true, size: [1080, 1350] };
  return null;
}

/** Runs a shot scene: marks the page cover-only when needed, then applies it. */
export function runShot(shot, query, apply) {
  const scene = shotScene(shot, query);
  if (!scene) return false;
  if (scene.coverOnly) document.body.classList.add('shot-cover');
  apply(scene);
  return true;
}
