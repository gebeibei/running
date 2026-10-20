import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { hasRoute, routeForActivity } from '../core/routeFallback';
import {
  BASEMAP_VENDORS,
  basemapStyleUrl,
  isBasemapVendor,
  type MapStyleName,
} from '../core/basemap';
import { MAPBOX_TOKEN, MAP_PROVIDER } from '../config';
import { useLocale } from '../hooks/useLocale';
import './RouteMap.css';

export interface RouteMapProps {
  activities: Activity[];
  allActivities?: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
}

const routeCache = new WeakMap<
  Activity,
  {
    type: 'Feature';
    properties: { type: string };
    geometry: { type: 'LineString'; coordinates: number[][] };
  }[]
>();

export function RouteMapCanvas({
  activities,
  allActivities = activities,
  selectedActivity,
  dark,
  onClearSelection,
}: RouteMapProps) {
  const { locale } = useLocale();
  const zh = locale === 'zh';
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const cameraRef = useRef<maplibregl.CameraOptions | null>(null);
  const fittedRef = useRef<unknown>(null);
  /**
   * 底图统一使用 MapCN（OpenFreeMap 的免 token 矢量样式），由 MapLibre GL
   * 渲染。只有显式把 `map_provider` 配成 `mapbox` 且提供了 token 时才走
   * Mapbox 的专有样式，两者共用同一套 GeoJSON 轨迹图层。
   */
  const preferredVendor = useMemo(() => {
    const configured = import.meta.env.VITE_MAP_PROVIDER;
    if (isBasemapVendor(configured)) {
      return configured;
    }
    return MAP_PROVIDER;
  }, []);
  const provider = useMemo<'mapbox' | 'mapcn'>(
    () => (preferredVendor === 'mapbox' && MAPBOX_TOKEN ? 'mapbox' : 'mapcn'),
    [preferredVendor]
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  /** The canvas stays hidden until the first frame is on screen, see below. */
  const [revealed, setRevealed] = useState(false);
  const [retry, setRetry] = useState(0);
  const styleName: MapStyleName = dark === false ? 'light' : 'dark';
  const style = useMemo(() => {
    if (provider === 'mapbox') {
      return basemapStyleUrl('mapbox', styleName) ?? '';
    }
    // 亮/暗各用一份 MapCN 原始样式，MapLibre 会跟随主题重设样式。
    return (
      basemapStyleUrl(preferredVendor, styleName) ??
      basemapStyleUrl('mapcn', styleName) ??
      ''
    );
  }, [provider, styleName, preferredVendor]);
  const basemapLabel =
    provider === 'mapbox' ? 'Mapbox' : BASEMAP_VENDORS[preferredVendor].label;

  const displayActivity = useMemo(
    () =>
      selectedActivity
        ? routeForActivity(selectedActivity, allActivities)
        : null,
    [selectedActivity, allActivities]
  );
  const fallbackActivity =
    selectedActivity && !hasRoute(selectedActivity) ? displayActivity : null;

  const routes = useMemo(() => {
    const items = selectedActivity
      ? displayActivity
        ? [displayActivity]
        : []
      : activities;
    return items.flatMap((activity) => {
      const cached = routeCache.get(activity);
      if (cached) return cached;
      if (!activity.summary_polyline) return [];
      try {
        const coordinates = polyline
          .decode(activity.summary_polyline)
          .map(([lat, lng]) => [lng, lat])
          .filter(
            ([lng, lat]) =>
              Number.isFinite(lng) &&
              Number.isFinite(lat) &&
              Math.abs(lng) <= 180 &&
              Math.abs(lat) <= 90
          );
        if (coordinates.length < 2) return [];
        const features = [
          {
            type: 'Feature' as const,
            properties: { type: activity.type },
            geometry: { type: 'LineString' as const, coordinates },
          },
        ];
        routeCache.set(activity, features);
        return features;
      } catch {
        return [];
      }
    });
  }, [activities, selectedActivity, displayActivity]);

  const routeBounds = useMemo(() => {
    const bounds = new maplibregl.LngLatBounds();
    for (const route of routes) {
      for (const coord of route.geometry.coordinates)
        bounds.extend(coord as [number, number]);
    }
    return bounds;
  }, [routes]);

  const fitRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || routeBounds.isEmpty()) return;
    map.fitBounds(routeBounds, {
      padding: { top: 35, bottom: 35, left: 35, right: 65 },
      maxZoom: selectedActivity ? 16 : 13,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 500,
    });
  }, [routeBounds, selectedActivity]);

  const drawRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    const data = { type: 'FeatureCollection' as const, features: routes };
    const source = map.getSource('routes') as
      maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource('routes', { type: 'geojson', data });
      map.addLayer({
        id: 'routes',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'type'],
            'Run',
            '#f97316',
            'Ride',
            '#3b82f6',
            '#4dd2ff',
          ],
        },
      });
    }
    map.setPaintProperty('routes', 'line-width', selectedActivity ? 3.5 : 2);
    map.setPaintProperty('routes', 'line-opacity', selectedActivity ? 1 : 0.7);
    if (fittedRef.current !== routes) {
      fittedRef.current = routes;
      fitRoutes();
    }
    // Mapbox only requests tiles for an area after a jump or a camera
    // operation. The camera is restored from `cameraRef` on mount, so a plain
    // repaint would leave the basemap empty after a re-entry.
    map.once('style.load', fitRoutes);
  }, [routes, selectedActivity, fitRoutes]);

  useEffect(() => {
    if (!containerRef.current || !panelRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      // MapLibre 不支持 Mapbox 的 `language` 选项，中文标注由样式里的
      // `text-field: name:{name_language}` 决定，这里不再传。
      // 先挂一份空样式，等地图就绪后再 setStyle 到 MapCN：这样瓦片请求
      // 不会和首屏渲染抢资源。
      style: { version: 8, sources: {}, layers: [] },
      center: [121.4, 31.2],
      zoom: 10,
      locale: zh
        ? {
            'Map.Title': '跑步路线地图',
            'NavigationControl.ZoomIn': '放大',
            'NavigationControl.ZoomOut': '缩小',
            'NavigationControl.ResetBearing': '恢复朝北',
            'FullscreenControl.Enter': '全屏查看',
            'FullscreenControl.Exit': '退出全屏',
            'AttributionControl.ToggleAttribution': '地图来源',
          }
        : {},
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(
      new maplibregl.FullscreenControl({ container: panelRef.current }),
      'top-right'
    );
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 90 }),
      'bottom-left'
    );
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      cameraRef.current = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [zh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let failed = false;
    // The optional basemap is best effort: a failing tile sprite or glyph
    // request must not leave the page stuck on a loading label.
    let settled = false;
    const settleIfFailed = () => {
      if (!settled) setStatus('ready');
    };
    const onError = (event: maplibregl.ErrorEvent) => {
      // 底图尽力而为：可选图层的单个请求失败（离线、CDN 被拦、字形请求出错）
      // 不应该让页面卡在加载中，保持空画布即可，其它错误才提示重试。
      const code = (event.error as Error & { status?: number }).status;
      if (code === 401 || code === 403) {
        setStatus('ready');
      } else {
        failed = true;
        setStatus('error');
      }
    };
    const onIdle = () => {
      if (!failed) {
        settled = true;
        setStatus('ready');
      }
    };
    const onLoading = () => setStatus('loading');
    map.on('error', onError);
    map.on('idle', onIdle);
    map.once('styledataloading', onLoading);
    styleReadyRef.current = false;
    map.setStyle(style, {
      diff: false,
      localIdeographFontFamily: 'sans-serif',
    });
    const timer = window.setTimeout(() => {
      if (!settled && !map.isStyleLoaded()) {
        setStatus(provider === 'mapcn' ? 'ready' : 'error');
      }
    }, 15000);
    const settleTimer = window.setTimeout(() => {
      // Mapbox keeps retrying failed tiles; once the style is applied the
      // basemap is usable, so stop reporting the loading state.
      if (!failed && map.isStyleLoaded()) settleIfFailed();
    }, 4000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(settleTimer);
      map.off('error', onError);
      map.off('idle', onIdle);
      map.off('styledataloading', onLoading);
    };
  }, [style, provider, retry, zh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onStyleLoad = () => {
      styleReadyRef.current = true;
      drawRoutes();
      // MapLibre skips all work while the canvas is hidden (`display: none`,
      // collapsed layout) and comes back with a stale size afterwards. A map
      // mounted while its section is off screen never paints nor requests a
      // tile even though the style reports itself as loaded, so measure once
      // on the frame after the style arrives and let the camera repaint.
      // 首帧与隐藏恢复都靠这里重新测量。
      cancelAnimationFrame(nudge);
      nudge = requestAnimationFrame(() => map.resize());
    };
    let nudge = 0;
    map.on('style.load', onStyleLoad);
    drawRoutes();
    return () => {
      cancelAnimationFrame(nudge);
      map.off('style.load', onStyleLoad);
    };
  }, [drawRoutes, style, retry, zh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // 样式就绪后再显示画布：画布被隐藏时 MapLibre 不会渲染，重新显示后
    // WebGL 缓冲区是空的，只能靠后续的 jumpTo 或缩放才恢复。
    const onStyleLoad = () => setRevealed(true);
    map.once('style.load', onStyleLoad);
    if (map.isStyleLoaded()) setRevealed(true);
    return () => {
      map.off('style.load', onStyleLoad);
    };
  }, [style, retry, zh]);

  useEffect(() => {
    let wasFullscreen = document.fullscreenElement === panelRef.current;
    let frame = 0;
    const onFullscreen = () => {
      const isFullscreen = document.fullscreenElement === panelRef.current;
      if (isFullscreen || wasFullscreen) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          mapRef.current?.resize();
          fitRoutes();
        });
      }
      wasFullscreen = isFullscreen;
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [fitRoutes]);

  return (
    <section
      ref={panelRef}
      className="route-map"
      aria-label={zh ? '路线地图' : 'Route map'}
    >
      <div className="route-map-header">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {zh ? '路线地图' : 'Route map'}
          </h2>
          <p
            className="truncate text-xs text-[var(--color-muted)]"
            title={selectedActivity?.name}
          >
            {selectedActivity
              ? `${selectedActivity.name} · ${(selectedActivity.distance / 1000).toFixed(1)} km`
              : `${routes.length.toLocaleString()} ${zh ? '条轨迹' : 'routes'}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {selectedActivity && onClearSelection && (
            <button className="route-map-action" onClick={onClearSelection}>
              {zh ? '返回总览' : 'Overview'}
            </button>
          )}
          <button
            className="route-map-action"
            disabled={!routes.length}
            onClick={fitRoutes}
            title={zh ? '将所有当前轨迹完整放入视野' : 'Fit all current routes'}
          >
            {zh ? '定位轨迹' : 'Fit routes'}
          </button>
        </div>
      </div>
      {fallbackActivity && (
        <p
          role="status"
          className="px-4 pb-2 text-xs text-[var(--color-muted)]"
        >
          {zh
            ? `此活动没有可用的 GPS 轨迹，现显示之前最近一次有轨迹的活动：${fallbackActivity.name}（${fallbackActivity.start_date_local}）。`
            : `This activity has no usable GPS route. Showing the most recent earlier mapped activity: ${fallbackActivity.name} (${fallbackActivity.start_date_local}).`}
        </p>
      )}
      <div className="route-map-body">
        <div
          ref={containerRef}
          className="h-full w-full transition-opacity duration-200"
          style={{ opacity: revealed ? 1 : 0 }}
        />
        {!routes.length && (
          <div className="route-map-empty" role="status">
            {zh
              ? selectedActivity
                ? '这次活动没有 GPS 轨迹'
                : '当前筛选没有 GPS 轨迹'
              : 'No GPS route available'}
          </div>
        )}
        {provider === 'mapbox' && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/55 to-transparent"
          />
        )}
      </div>
      <div className="route-map-footer">
        <span role="status" aria-live="polite">
          {status === 'error'
            ? zh
              ? '底图加载失败，请重试'
              : 'Basemap failed to load'
            : provider === 'mapcn'
              ? zh
                ? `底图 · ${basemapLabel}`
                : `Basemap · ${basemapLabel}`
              : zh
                ? '底图 · Mapbox'
                : 'Basemap · Mapbox'}
        </span>
        {status === 'error' && (
          <button
            className="route-map-action"
            onClick={() => setRetry((value) => value + 1)}
          >
            {zh ? '重试' : 'Retry'}
          </button>
        )}
      </div>
    </section>
  );
}
