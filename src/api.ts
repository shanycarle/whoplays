import { Platform } from 'react-native';

/**
 * Base URL of the WhoPlays Laravel API.
 *
 * `php artisan serve` listens on the host's 127.0.0.1:8000, which is NOT
 * reachable as-is from a device/emulator, so we pick a host per platform:
 *  - Android emulator reaches the host via the special alias 10.0.2.2
 *  - iOS simulator / web share the host loopback (127.0.0.1)
 *
 * Running in Expo Go on a PHYSICAL phone? Replace the host with your computer's
 * LAN IP (e.g. http://192.168.1.42:8000) — phone and PC must be on the same Wi-Fi,
 * and start the server with: php artisan serve --host=0.0.0.0
 */
const HOST = Platform.select({
  android: 'http://10.2.151.80:8000',
  default: 'http://127.0.0.1:8000',
});

export const API_BASE_URL = `${HOST}/api/v1`;

const USE_MOCK_DATA = true; // Set to true for stress testing with mock data

// ---- API response types (mirror the Laravel API Resources) ----

export type RosterPlayer = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  photo_path: string | null;
  jersey_number: number | null;
  position: string | null;
};

export type Team = {
  id: number;
  name: string;
  category: string | null;
  division: string | null;
  logo_path: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  sport?: string | null;
  sport_label?: string | null;
  players_count?: number;
  players?: RosterPlayer[];
};

export type SportTag = { key: string; label: string };

export type Field = {
  id: number;
  name: string;
  address: string | null;
  region: string | null;
  city: string | null;
  venue_type: string | null;
  venue_type_label: string | null;
  surface_number: number | null;
  surface_label: string | null;
  sport_type: string | null;
  sports: SportTag[];
  latitude: number | null;
  longitude: number | null;
  detection_radius_m: number | null;
  distance_m: number | null;
};

export type LineupEntry = {
  player_id: number;
  full_name: string | null;
  jersey_number: number | null;
  position: string | null;
  is_starter: boolean;
};

export type Lineup = {
  id: number;
  team: Team | null;
  formation: string | null;
  published_at: string | null;
  entries?: LineupEntry[];
};

export type Match = {
  id: number;
  status: 'scheduled' | 'live' | 'finished' | string;
  starts_at: string | null;
  ends_at: string | null;
  sport: string | null;
  sport_label: string | null;
  home_score: number | null;
  away_score: number | null;
  field?: Field | null;
  home_team?: Team | null;
  away_team?: Team | null;
  lineups?: Lineup[];
};

export type GeoResolveResult = {
  field: Field | null;
  message?: string;
  candidates?: Field[];
  active_match?: Match | null;
  next_match?: Match | null;
  schedule?: Match[];
};

export type PlayerProfile = {
  id: number;
  full_name: string | null;
  photo_path: string | null;
  team: string | null;
  position: string | null;
  jersey_number: number | null;
  numbers: number[];
  age: number | null;
  birthdate: string | null;
  school_year: string | null;
  side: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  build: string | null;
  discipline: string | null;
  hometown: string | null;
};

export type PlayerHit = {
  player_id: number;
  full_name: string | null;
  jersey_number: number | null;
  position: string | null;
  team: string | null;
  team_id: number;
  photo_path: string | null;
};

/** Thrown for any non-2xx response, carrying the API's message when present. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---- Mock data for stress testing (SSJ Blancs vs SSJ Verts) ----
const MOCK_TEAM_BLANCS: Team = {
  id: 1,
  name: 'SSJ Blancs',
  category: 'Senior',
  division: 'Division 1',
  logo_path: null,
  color_primary: '#FFFFFF',
  color_secondary: '#000000',
  sport: 'football',
  sport_label: 'Football',
  players_count: 11,
  players: [
    { id: 1, first_name: 'Marc', last_name: 'Dupont', full_name: 'Marc Dupont', photo_path: null, jersey_number: 1, position: 'Gardien' },
    { id: 2, first_name: 'Pierre', last_name: 'Bernard', full_name: 'Pierre Bernard', photo_path: null, jersey_number: 2, position: 'Arrière Droit' },
    { id: 3, first_name: 'Jean', last_name: 'Martin', full_name: 'Jean Martin', photo_path: null, jersey_number: 3, position: 'Arrière Gauche' },
    { id: 4, first_name: 'Claude', last_name: 'Lefebvre', full_name: 'Claude Lefebvre', photo_path: null, jersey_number: 4, position: 'Défenseur Central' },
    { id: 5, first_name: 'Michel', last_name: 'Garcia', full_name: 'Michel Garcia', photo_path: null, jersey_number: 5, position: 'Défenseur Central' },
    { id: 6, first_name: 'François', last_name: 'Moreau', full_name: 'François Moreau', photo_path: null, jersey_number: 6, position: 'Milieu Défensif' },
    { id: 7, first_name: 'André', last_name: 'Thomas', full_name: 'André Thomas', photo_path: null, jersey_number: 7, position: 'Ailier' },
    { id: 8, first_name: 'Luc', last_name: 'Petit', full_name: 'Luc Petit', photo_path: null, jersey_number: 8, position: 'Milieu' },
    { id: 9, first_name: 'Robert', last_name: 'Richard', full_name: 'Robert Richard', photo_path: null, jersey_number: 9, position: 'Attaquant' },
    { id: 10, first_name: 'Philippe', last_name: 'Dubois', full_name: 'Philippe Dubois', photo_path: null, jersey_number: 10, position: 'Meneur de jeu' },
    { id: 11, first_name: 'Serge', last_name: 'Lefevre', full_name: 'Serge Lefevre', photo_path: null, jersey_number: 11, position: 'Ailier' },
  ],
};

const MOCK_TEAM_VERTS: Team = {
  id: 2,
  name: 'SSJ Verts',
  category: 'Senior',
  division: 'Division 1',
  logo_path: null,
  color_primary: '#00AA00',
  color_secondary: '#FFFFFF',
  sport: 'football',
  sport_label: 'Football',
  players_count: 11,
  players: [
    { id: 12, first_name: 'Alain', last_name: 'Rossi', full_name: 'Alain Rossi', photo_path: null, jersey_number: 1, position: 'Gardien' },
    { id: 13, first_name: 'Didier', last_name: 'Bertrand', full_name: 'Didier Bertrand', photo_path: null, jersey_number: 2, position: 'Arrière Droit' },
    { id: 14, first_name: 'Eric', last_name: 'Fournier', full_name: 'Eric Fournier', photo_path: null, jersey_number: 3, position: 'Arrière Gauche' },
    { id: 15, first_name: 'Georges', last_name: 'Mercier', full_name: 'Georges Mercier', photo_path: null, jersey_number: 4, position: 'Défenseur Central' },
    { id: 16, first_name: 'Henri', last_name: 'Arnaud', full_name: 'Henri Arnaud', photo_path: null, jersey_number: 5, position: 'Défenseur Central' },
    { id: 17, first_name: 'Olivier', last_name: 'Fontaine', full_name: 'Olivier Fontaine', photo_path: null, jersey_number: 6, position: 'Milieu Défensif' },
    { id: 18, first_name: 'Patrick', last_name: 'Caron', full_name: 'Patrick Caron', photo_path: null, jersey_number: 7, position: 'Ailier' },
    { id: 19, first_name: 'Raymond', last_name: 'Chevalier', full_name: 'Raymond Chevalier', photo_path: null, jersey_number: 8, position: 'Milieu' },
    { id: 20, first_name: 'Thierry', last_name: 'Leclerc', full_name: 'Thierry Leclerc', photo_path: null, jersey_number: 9, position: 'Attaquant' },
    { id: 21, first_name: 'Yves', last_name: 'Brun', full_name: 'Yves Brun', photo_path: null, jersey_number: 10, position: 'Meneur de jeu' },
    { id: 22, first_name: 'Xavier', last_name: 'Vincent', full_name: 'Xavier Vincent', photo_path: null, jersey_number: 11, position: 'Ailier' },
  ],
};

const MOCK_MATCH: Match = {
  id: 101,
  status: 'live',
  starts_at: '2026-06-22T19:00:00Z',
  ends_at: null,
  sport: 'football',
  sport_label: 'Football',
  home_score: 2,
  away_score: 1,
  field: {
    id: 201,
    name: 'Stade Municipal',
    address: '123 Rue du Sport, Montréal',
    region: 'Île-de-Montréal',
    city: 'Montréal',
    venue_type: 'stadium',
    venue_type_label: 'Stade',
    surface_number: 1,
    surface_label: 'Terrain Principal',
    sport_type: 'football',
    sports: [{ key: 'football', label: 'Football' }],
    latitude: 45.5,
    longitude: -73.55,
    detection_radius_m: 500,
    distance_m: 150,
  },
  home_team: MOCK_TEAM_BLANCS,
  away_team: MOCK_TEAM_VERTS,
  lineups: [
    {
      id: 1,
      team: { id: 1, name: 'SSJ Blancs', category: null, division: null, logo_path: null, color_primary: '#FFFFFF', color_secondary: '#000000' },
      formation: '4-3-3',
      published_at: '2026-06-22T18:45:00Z',
      entries: [
        { player_id: 1, full_name: 'Marc Dupont', jersey_number: 1, position: 'Gardien', is_starter: true },
        { player_id: 2, full_name: 'Pierre Bernard', jersey_number: 2, position: 'Arrière Droit', is_starter: true },
        { player_id: 3, full_name: 'Jean Martin', jersey_number: 3, position: 'Arrière Gauche', is_starter: true },
        { player_id: 4, full_name: 'Claude Lefebvre', jersey_number: 4, position: 'Défenseur Central', is_starter: true },
        { player_id: 5, full_name: 'Michel Garcia', jersey_number: 5, position: 'Défenseur Central', is_starter: true },
        { player_id: 6, full_name: 'François Moreau', jersey_number: 6, position: 'Milieu Défensif', is_starter: true },
        { player_id: 8, full_name: 'Luc Petit', jersey_number: 8, position: 'Milieu', is_starter: true },
        { player_id: 10, full_name: 'Philippe Dubois', jersey_number: 10, position: 'Meneur de jeu', is_starter: true },
        { player_id: 7, full_name: 'André Thomas', jersey_number: 7, position: 'Ailier', is_starter: true },
        { player_id: 9, full_name: 'Robert Richard', jersey_number: 9, position: 'Attaquant', is_starter: true },
        { player_id: 11, full_name: 'Serge Lefevre', jersey_number: 11, position: 'Ailier', is_starter: true },
      ],
    },
    {
      id: 2,
      team: { id: 2, name: 'SSJ Verts', category: null, division: null, logo_path: null, color_primary: '#00AA00', color_secondary: '#FFFFFF' },
      formation: '4-2-3-1',
      published_at: '2026-06-22T18:45:00Z',
      entries: [
        { player_id: 12, full_name: 'Alain Rossi', jersey_number: 1, position: 'Gardien', is_starter: true },
        { player_id: 13, full_name: 'Didier Bertrand', jersey_number: 2, position: 'Arrière Droit', is_starter: true },
        { player_id: 14, full_name: 'Eric Fournier', jersey_number: 3, position: 'Arrière Gauche', is_starter: true },
        { player_id: 15, full_name: 'Georges Mercier', jersey_number: 4, position: 'Défenseur Central', is_starter: true },
        { player_id: 16, full_name: 'Henri Arnaud', jersey_number: 5, position: 'Défenseur Central', is_starter: true },
        { player_id: 17, full_name: 'Olivier Fontaine', jersey_number: 6, position: 'Milieu Défensif', is_starter: true },
        { player_id: 19, full_name: 'Raymond Chevalier', jersey_number: 8, position: 'Milieu', is_starter: true },
        { player_id: 18, full_name: 'Patrick Caron', jersey_number: 7, position: 'Ailier', is_starter: true },
        { player_id: 21, full_name: 'Yves Brun', jersey_number: 10, position: 'Meneur de jeu', is_starter: true },
        { player_id: 20, full_name: 'Thierry Leclerc', jersey_number: 9, position: 'Attaquant', is_starter: true },
        { player_id: 22, full_name: 'Xavier Vincent', jersey_number: 11, position: 'Ailier', is_starter: true },
      ],
    },
  ],
};

const MOCK_GEO_RESULT: GeoResolveResult = {
  field: MOCK_MATCH.field,
  active_match: MOCK_MATCH,
  next_match: null,
  schedule: [MOCK_MATCH],
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      "Impossible de joindre le serveur. Vérifie qu'il tourne et que l'adresse est correcte.",
      0,
    );
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body.message === 'string' && body.message) ||
      `Erreur serveur (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/** POST /geo/resolve — turn a GPS fix into a field + its active/next match. */
export function resolveGeo(
  lat: number,
  lng: number,
  accuracy?: number | null,
): Promise<GeoResolveResult> {
  if (USE_MOCK_DATA) {
    return Promise.resolve(MOCK_GEO_RESULT);
  }
  return request<GeoResolveResult>('/geo/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, accuracy: accuracy ?? null }),
  });
}

/**
 * GET /matches/{match}/players/{number} — the core feature.
 * Returns every player whose jersey number CONTAINS the typed digits
 * (e.g. 8 → 8, 18, 80, 88, 89…), exact matches first. [] when none (API 404).
 */
export async function findPlayerByNumber(
  matchId: number,
  number: number,
): Promise<PlayerHit[]> {
  if (USE_MOCK_DATA) {
    const match = MOCK_MATCH;
    const searchStr = String(number);
    const hits: PlayerHit[] = [];

    if (match.lineups) {
      for (const lineup of match.lineups) {
        if (lineup.entries) {
          for (const entry of lineup.entries) {
            if (entry.jersey_number !== null && String(entry.jersey_number).includes(searchStr)) {
              const team = lineup.team;
              hits.push({
                player_id: entry.player_id,
                full_name: entry.full_name,
                jersey_number: entry.jersey_number,
                position: entry.position,
                team: team?.name ?? null,
                team_id: team?.id ?? 0,
                photo_path: null,
              });
            }
          }
        }
      }
    }
    return hits;
  }

  try {
    const res = await request<{ data: PlayerHit[] }>(
      `/matches/${matchId}/players/${number}`,
    );
    return res.data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

/** GET /players/{id} — full profile for the zoom popup. */
export async function getPlayer(id: number): Promise<PlayerProfile> {
  if (USE_MOCK_DATA) {
    const match = MOCK_MATCH;
    
    // Search in all lineups
    if (match.lineups) {
      for (const lineup of match.lineups) {
        if (lineup.entries) {
          const entry = lineup.entries.find(e => e.player_id === id);
          if (entry) {
            return {
              id,
              full_name: entry.full_name,
              photo_path: null,
              team: lineup.team?.name ?? null,
              position: entry.position,
              jersey_number: entry.jersey_number,
              numbers: entry.jersey_number ? [entry.jersey_number] : [],
              age: 28,
              birthdate: '1998-01-01',
              school_year: null,
              side: 'Droit',
              height_cm: 180,
              weight_kg: 80,
              build: 'Athlétique',
              discipline: 'Football',
              hometown: 'Montréal',
            };
          }
        }
      }
    }
    
    // Default fallback
    return {
      id,
      full_name: `Joueur ${id}`,
      photo_path: null,
      team: null,
      position: null,
      jersey_number: null,
      numbers: [],
      age: null,
      birthdate: null,
      school_year: null,
      side: null,
      height_cm: null,
      weight_kg: null,
      build: null,
      discipline: null,
      hometown: null,
    };
  }

  const res = await request<{ data: PlayerProfile }>(`/players/${id}`);
  return res.data;
}

/**
 * GET /matches/nearby — the schedule ("cédule"): upcoming/ongoing matches
 * within `radiusM` metres of the point, ordered chronologically.
 */
export async function nearbyMatches(
  lat: number,
  lng: number,
  radiusM: number,
  sport?: string | null,
): Promise<Match[]> {
  if (USE_MOCK_DATA) {
    return MOCK_GEO_RESULT.schedule ?? [];
  }

  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius_m: String(Math.round(radiusM)),
  });
  if (sport) qs.set('sport', sport);
  const res = await request<{ data: Match[] }>(`/matches/nearby?${qs.toString()}`);
  return res.data;
}

/**
 * GET /teams — lineups filtered by region (where they play) and sport.
 * Used by the "Alignements" tab.
 */
export async function searchTeams(params?: {
  region?: string | null;
  sport?: string | null;
}): Promise<Team[]> {
  if (USE_MOCK_DATA) {
    return [MOCK_TEAM_BLANCS, MOCK_TEAM_VERTS];
  }

  const qs = new URLSearchParams();
  if (params?.region) qs.set('region', params.region);
  if (params?.sport) qs.set('sport', params.sport);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await request<{ data: Team[] }>(`/teams${suffix}`);
  return res.data;
}

/** GET /teams/{id} — full team with its roster (all players). */
export async function getTeam(id: number): Promise<Team> {
  if (USE_MOCK_DATA) {
    if (id === 1) return MOCK_TEAM_BLANCS;
    if (id === 2) return MOCK_TEAM_VERTS;
    return MOCK_TEAM_BLANCS; // Default fallback
  }

  const res = await request<{ data: Team }>(`/teams/${id}`);
  return res.data;
}

/** GET /fields/regions — distinct regions for the Terrain filter chips. */
export async function listRegions(): Promise<string[]> {
  if (USE_MOCK_DATA) {
    return ['Île-de-Montréal'];
  }

  const res = await request<{ data: string[] }>('/fields/regions');
  return res.data;
}

/**
 * GET /fields — search fields, optionally by region and/or free text
 * (name, city, address). Both filters are optional.
 */
export async function searchFields(params?: {
  region?: string | null;
  sport?: string | null;
  venue_type?: string | null;
  q?: string | null;
}): Promise<Field[]> {
  if (USE_MOCK_DATA) {
    return MOCK_GEO_RESULT.field ? [MOCK_GEO_RESULT.field] : [];
  }

  const qs = new URLSearchParams();
  if (params?.region) qs.set('region', params.region);
  if (params?.sport) qs.set('sport', params.sport);
  if (params?.venue_type) qs.set('venue_type', params.venue_type);
  if (params?.q) qs.set('q', params.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await request<{ data: Field[] }>(`/fields${suffix}`);
  return res.data;
}

/** The sports WhoPlays supports, in display order — used for the Terrain filter. */
export const SPORTS: SportTag[] = [
  { key: 'football', label: 'Football' },
  { key: 'flag_football', label: 'Flag football' },
  { key: 'rugby', label: 'Rugby' },
  { key: 'soccer', label: 'Soccer' },
  { key: 'baseball', label: 'Baseball' },
  { key: 'basketball', label: 'Basketball' },
  { key: 'hockey', label: 'Hockey' },
];
