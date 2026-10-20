/// <reference types="vite/client" />

declare module '@config' {
  const config: Record<string, unknown>;
  export default config;
}

declare module '*.yml' {
  const content: Record<string, unknown>;
  export default content;
}

// Classic 主题仍在使用的兼容别名，取值与 vite.config.ts 的 resolve.alias 保持一致。
// 上游未在 tsconfig.json 的 paths 中声明这些别名，因此这里给出宽松的类型声明，
// 让 `tsc --noEmit` 能通过（运行时由 Vite 解析真实模块）。
declare module '@core/hooks/useSiteMetadata' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSiteMetadata: any;
  export default getSiteMetadata;
}

declare module '@core/hooks/useHover' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const useHover: any;
  export default useHover;
}

declare module '@core/hooks/useInterval' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const useInterval: any;
}

declare module '@assets/index' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const yearStats: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const yearSummaryStats: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const githubYearStats: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const totalStat: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const other: any;
  export default other;
}

// 上游漏装了 geojson 的类型依赖（仅 classic 主题引用），补齐最小类型声明
declare module 'geojson' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Feature<T = any, P = any> = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type FeatureCollection<T = any, P = any> = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type LineString = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Polygon = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type MultiPolygon = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type GeoJsonProperties = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Geometry = any;
}

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?url' {
  const url: string;
  export default url;
}
