/**
 * 底图（Basemap）注册表 — 与 classic 主题 `utils/const.ts` 中的 MAP_TILE_STYLES
 * 保持一致；classic 主题本身通过 `./basemap` 桥接重新导出，因此注册表只维护一份。
 *
 * 默认使用 MapCN（CARTO Basemaps 的 GL 样式：免 token、免注册），
 * 需要在 config.yml 中把 `map_provider` 设为 `mapbox` 并提供 `mapbox_token`
 * 才能切回 Mapbox 底图。
 */

export type MapStyleName = 'light' | 'dark';

export interface BasemapVendor {
  /** 展示名称，用于地图角落的状态提示 */
  label: string;
  styles: Record<MapStyleName, string | null>;
}

const CARTO_BASE = 'https://basemaps.cartocdn.com/gl';
const OPENFREEMAP_BASE = 'https://tiles.openfreemap.org/styles';

export const BASEMAP_VENDORS = {
  mapcn: {
    label: 'MapCN',
    // OpenFreeMap 的公开矢量样式：免费、无需 token，瓦片和 glyph 与样式同域
    // （CARTO 的矢量瓦片与字体分布在不同子域，部分网络环境下瓦片请求会被中断）
    styles: {
      light: `${OPENFREEMAP_BASE}/bright`,
      dark: `${OPENFREEMAP_BASE}/dark`,
    },
  },
  mapcn_openfreemap: {
    label: 'OpenFreeMap',
    styles: {
      light: `${OPENFREEMAP_BASE}/bright`,
      dark: `${OPENFREEMAP_BASE}/dark`,
    },
  },
  mapcn_carto: {
    label: 'CARTO',
    // CARTO 公开 GL 样式：voyager-gl（浅色）/ dark-matter-gl（深色）
    styles: {
      light: `${CARTO_BASE}/voyager-gl-style/style.json`,
      dark: `${CARTO_BASE}/dark-matter-gl-style/style.json`,
    },
  },
  mapbox: {
    label: 'Mapbox',
    // mapbox:// 样式由 Mapbox GL 使用 accessToken 展开
    styles: {
      light: 'mapbox://styles/mapbox/light-v11',
      dark: 'mapbox://styles/mapbox/dark-v11',
    },
  },
} as const satisfies Record<string, BasemapVendor>;

export type BasemapVendorKey = keyof typeof BASEMAP_VENDORS;

export const DEFAULT_BASEMAP_VENDOR: BasemapVendorKey = 'mapcn';

/** 取某项底图服务的样式地址；缺少该明暗样式时返回 null（交给调用方回退）。 */
export function basemapStyleUrl(
  vendor: BasemapVendorKey,
  style: MapStyleName
): string | null {
  const styleUrl = BASEMAP_VENDORS[vendor]?.styles?.[style];
  return styleUrl ?? null;
}

export function isBasemapVendor(value: unknown): value is BasemapVendorKey {
  return typeof value === 'string' && value in BASEMAP_VENDORS;
}
