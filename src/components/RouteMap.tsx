import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { RouteMapProps } from './RouteMapCanvas';
import { useLocale } from '../hooks/useLocale';

const MapCanvas = lazy(() =>
  import('./RouteMapCanvas').then((module) => ({
    default: module.RouteMapCanvas,
  }))
);

/**
 * Load WebGL and decode routes only as the map approaches the viewport.
 *
 * Once mounted the canvas is kept alive (only hidden): tearing it down and
 * recreating the Mapbox instance mid-scroll leaves the basemap blank because
 * the browser drops the WebGL context of the removed canvas.
 */
export function RouteMap(props: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { locale } = useLocale();
  const active = visible || Boolean(props.selectedActivity);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    // When switching routes the map may already sit inside the viewport, so
    // the first observation has to mount it instead of waiting for a scroll.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(element);
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 0;
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < viewportHeight + 200 &&
      rect.bottom > -200
    ) {
      setVisible(true);
      observer.disconnect();
    }
    return () => observer.disconnect();
  }, []);
  const placeholder = (
    <div
      className="flex h-[442px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm text-[var(--color-muted)]"
      role="status"
    >
      {locale === 'zh' ? '正在加载地图…' : 'Loading map…'}
    </div>
  );
  return (
    <div ref={containerRef}>
      <Suspense fallback={placeholder}>
        {active ? <MapCanvas {...props} /> : placeholder}
      </Suspense>
    </div>
  );
}
