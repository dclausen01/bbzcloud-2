/**
 * wcvOverlayGuard
 *
 * Tiny ref-counted wrapper around `window.electron.view.setActiveVisible`.
 * Native WebContentsView is composited above the React DOM, so popovers,
 * menus and tooltips that would overlap the WCV are otherwise invisible.
 * Components call `enter()` when their popup opens and `exit()` when it
 * closes; while the depth is > 0 the active WCV is hidden.
 */

let depth = 0;
let lastSent = null;

const sync = () => {
  const visible = depth === 0;
  if (visible === lastSent) return;
  lastSent = visible;
  if (window.electron?.view?.setActiveVisible) {
    window.electron.view.setActiveVisible(visible).catch(() => {});
  }
};

export const wcvOverlayGuard = {
  enter() {
    depth += 1;
    sync();
  },
  exit() {
    depth = Math.max(0, depth - 1);
    sync();
  },
};
