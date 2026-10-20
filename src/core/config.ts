/**
 * 配置从根目录 config.yml 加载，由 Vite 在构建时转换。
 * 直接编辑 config.yml 即可，无需改动此文件。
 */
import rawConfig from '@config';
import type { Locale } from './i18n';

export interface GoalConfig {
  yearly: number;
  monthly: number;
  weekly: number;
  /** 'distance' (km) | 'time' (minutes) */
  unit: 'distance' | 'time';
}

interface AppConfig {
  locale: Locale;
  theme: 'light' | 'dark' | 'system';
  theme_preset: string;
  goals: Record<string, GoalConfig>;
  avatar?: string;
  mapbox_token?: string;
  /** 'mapcn'（默认，免费免 token）| 'mapbox'（需要 token） */
  map_provider?: 'mapcn' | 'mapbox';
}

const config = rawConfig as unknown as AppConfig;

export const DEFAULT_LOCALE: Locale = config.locale ?? 'zh';
export const DEFAULT_THEME: 'light' | 'dark' | 'system' =
  config.theme ?? 'system';
export const THEME_PRESET: string = config.theme_preset ?? 'default';
export const GOALS: Record<string, GoalConfig> = config.goals ?? {};
export const DEFAULT_GOAL: GoalConfig = GOALS.all ?? {
  yearly: 2000,
  monthly: 150,
  weekly: 35,
  unit: 'distance',
};
export const AVATAR: string = config.avatar ?? '';
export const MAPBOX_TOKEN: string =
  import.meta.env.VITE_MAPBOX_TOKEN || config.mapbox_token || '';

/**
 * 底图服务：默认 MapCN（CARTO Basemaps，免费、无需 token）。
 * 只有配置了 mapbox_token（或在 .env 中设置 VITE_MAPBOX_TOKEN），
 * 并显式把 map_provider 设为 mapbox 时才使用 Mapbox。
 */
export const MAP_PROVIDER: 'mapcn' | 'mapbox' =
  config.map_provider === 'mapbox' && MAPBOX_TOKEN ? 'mapbox' : 'mapcn';
