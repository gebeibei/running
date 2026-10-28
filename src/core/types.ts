/** Fastest segment of a single run over a target distance (seconds). */
export type BestEfforts = Partial<
  Record<'1k' | '5k' | '10k' | 'half' | 'marathon', number>
>;

export interface Activity {
  run_id: number;
  name: string;
  distance: number; // meters
  moving_time: string; // "H:MM:SS"
  type: 'Run' | string;
  subtype?: string;
  start_date: string;
  start_date_local: string;
  location_country: string | null;
  summary_polyline: string | null;
  average_heartrate: number | null;
  average_speed: number; // m/s
  elevation_gain: number | null;
  best_efforts?: BestEfforts | null;
  source: string;
  streak: number;
}

export type SportFilter = 'all' | 'Run';
