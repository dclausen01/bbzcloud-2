import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Binds an anchor <div> ref to the active WebContentsView's bounds.
 * Call this once; re-run whenever appId changes (pass null to stop).
 * RAF-throttled so it fires at most once per frame.
 */
export function useViewBoundsBinding(anchorRef, appId) {
  const rafRef = useRef(null);

  useEffect(() => {
    if (!anchorRef.current || !appId) return;

    const sendBounds = () => {
      if (!anchorRef.current) return;
      const r = anchorRef.current.getBoundingClientRect();
      window.electron.view.setBounds({
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };

    const schedule = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(sendBounds);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(anchorRef.current);
    window.addEventListener('resize', schedule);
    schedule(); // initial send

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [anchorRef, appId]);
}

/**
 * Subscribe to a specific event type for a given appId.
 * callback receives the full event payload ({ appId, type, ...rest }).
 */
export function useViewEvent(appId, type, callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!appId) return;
    const unsubscribe = window.electron.view.onEvent((event) => {
      if (event.appId === appId && event.type === type) {
        callbackRef.current(event);
      }
    });
    return unsubscribe;
  }, [appId, type]);
}

/**
 * Tracks the loading and navigation state of a WCV app.
 * Returns { isLoading, url }.
 */
export function useViewState(appId) {
  const [state, setState] = useState({ isLoading: false, url: '' });

  const setIsLoading = useCallback((val) => setState(s => ({ ...s, isLoading: val })), []);
  const setUrl = useCallback((val) => setState(s => ({ ...s, url: val })), []);

  useViewEvent(appId, 'did-start-loading', () => setIsLoading(true));
  useViewEvent(appId, 'did-stop-loading', () => setIsLoading(false));
  useViewEvent(appId, 'did-navigate', (e) => setUrl(e.url));
  useViewEvent(appId, 'did-navigate-in-page', (e) => setUrl(e.url));

  return state;
}
