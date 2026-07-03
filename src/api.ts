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
  description?: string | null;
  photos?: string[];
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

// ---- Mock data (Bills/Bucs juniors + Seahawks/Pats seniors) ----
const MOCK_JUNIORS_TEAM_BILLS: Team = {
  id: 3,
  name: 'Bills',
  category: 'Juniors',
  division: null,
  logo_path: null,
  color_primary: '#00338D',
  color_secondary: '#C60C30',
  sport: 'football',
  sport_label: 'Football',
  players_count: 36,
};

const MOCK_JUNIORS_TEAM_BUCS: Team = {
  id: 4,
  name: 'Bucs',
  category: 'Juniors',
  division: null,
  logo_path: null,
  color_primary: '#D0103A',
  color_secondary: '#FF8200',
  sport: 'football',
  sport_label: 'Football',
  players_count: 38,
};

const MOCK_SENIORS_TEAM_SEAHAWKS: Team = {
  id: 5,
  name: 'Seahawks',
  category: 'Senior',
  division: null,
  logo_path: null,
  color_primary: '#004C97',
  color_secondary: '#A5ACAF',
  sport: 'football',
  sport_label: 'Football',
  players_count: 32,
};

const MOCK_SENIORS_TEAM_PATS: Team = {
  id: 6,
  name: 'Pats',
  category: 'Senior',
  division: null,
  logo_path: null,
  color_primary: '#002244',
  color_secondary: '#C60C30',
  sport: 'football',
  sport_label: 'Football',
  players_count: 29,
};

const MOCK_JUNIORS_MATCH: Match = {
  id: 101,
  status: 'scheduled',
  starts_at: '2026-07-03T16:00:00Z', // 12:00 (midi) heure de Trois-Rivières (EDT)
  ends_at: null,
  sport: 'football',
  sport_label: 'Football',
  home_score: null,
  away_score: null,
  field: {
    id: 201,
    name: 'Stade Gilles-Doucet',
    address: '858, rue Laviolette, Trois-Rivières',
    region: 'Mauricie',
    city: 'Trois-Rivières',
    venue_type: 'stadium',
    venue_type_label: 'Stade',
    surface_number: 1,
    surface_label: 'Gazon synthétique',
    sport_type: 'football',
    sports: [{ key: 'football', label: 'Football' }],
    latitude: 46.348793,
    longitude: -72.5437084,
    detection_radius_m: 500,
    distance_m: 150,
    description:
      'Le Stade Gilles-Doucet est le terrain de football du Séminaire Saint-Joseph de Trois-Rivières, situé au 858, rue Laviolette. Inauguré en 2010, il dispose d’un terrain en gazon synthétique, d’un éclairage de qualité pour les soirées et de gradins pouvant accueillir plus de 1 000 spectateurs. Il porte le nom de Gilles Doucet, entraîneur-chef pendant 28 ans, qui a formé plus de 1 200 joueurs et contribué à faire du programme de football du Séminaire une référence régionale.',
    photos: [
      // Served from mobile/public/img/ (copied to the site root on deploy).
      // Relative paths so they resolve both locally and under the /whoplays/ base.
      'img/stade-gilles-doucet-1.jpg',
      'img/stade-gilles-doucet-2.png',
    ],
  },
  home_team: MOCK_JUNIORS_TEAM_BILLS,
  away_team: MOCK_JUNIORS_TEAM_BUCS,
  lineups: [
    {
      id: 1,
      team: MOCK_JUNIORS_TEAM_BILLS,
      formation: '4-3-3',
      published_at: '2026-07-03T12:30:00Z',
      entries: [
        { player_id: 100, full_name: 'Emile Grenier', jersey_number: 7, position: 'Quarterback', is_starter: true },
        { player_id: 101, full_name: 'Justin Provencher', jersey_number: 5, position: 'Running Back', is_starter: true },
        { player_id: 102, full_name: 'Lyhan Ouellette', jersey_number: 3, position: 'Running Back', is_starter: true },
        { player_id: 103, full_name: 'Alexis Gagnon', jersey_number: 2, position: 'Running Back', is_starter: true },
        { player_id: 104, full_name: 'Alec Bellemare', jersey_number: 22, position: 'Running Back', is_starter: true },
        { player_id: 105, full_name: 'Theo Gauthier', jersey_number: 13, position: 'Receveur', is_starter: true },
        { player_id: 106, full_name: 'Edgar Salib', jersey_number: 11, position: 'Receveur', is_starter: true },
        { player_id: 107, full_name: 'Tom Carpentier', jersey_number: 10, position: 'Receveur', is_starter: true },
        { player_id: 108, full_name: 'Odin Lafreniere', jersey_number: 80, position: 'Receveur', is_starter: true },
        { player_id: 109, full_name: 'Logan Boisvert', jersey_number: 81, position: 'Receveur', is_starter: true },
        { player_id: 110, full_name: 'Liam Martin', jersey_number: 88, position: 'Receveur', is_starter: true },
        { player_id: 111, full_name: 'Gabriel Handoyan', jersey_number: 8, position: 'Receveur', is_starter: true },
        { player_id: 112, full_name: 'Markus Bellemare', jersey_number: 1, position: 'Receveur', is_starter: true },
        { player_id: 113, full_name: 'Laurent Courey', jersey_number: 17, position: 'Receveur', is_starter: true },
        { player_id: 114, full_name: 'Logan Grenier', jersey_number: 24, position: 'Receveur', is_starter: true },
        { player_id: 115, full_name: 'Elliot Desjardins', jersey_number: 50, position: 'OL/DL', is_starter: true },
        { player_id: 116, full_name: 'Louka Paradis', jersey_number: 68, position: 'OL/DL', is_starter: true },
        { player_id: 117, full_name: 'Emile Giguere', jersey_number: 58, position: 'OL/DL', is_starter: true },
        { player_id: 118, full_name: 'Lil James Lavaud', jersey_number: 52, position: 'OL/DL', is_starter: true },
        { player_id: 119, full_name: 'Idris Golli', jersey_number: 57, position: 'OL/DL', is_starter: true },
        { player_id: 120, full_name: 'Malcom Forest', jersey_number: 9, position: 'Lignebacker', is_starter: true },
        { player_id: 121, full_name: 'Laurent Ayotte', jersey_number: 42, position: 'Lignebacker', is_starter: true },
        { player_id: 122, full_name: 'Eliot Groleau', jersey_number: 44, position: 'Lignebacker', is_starter: true },
        { player_id: 123, full_name: 'Remi Ducharme', jersey_number: 40, position: 'Lignebacker', is_starter: true },
        { player_id: 124, full_name: 'Charlie Martel', jersey_number: 35, position: 'Lignebacker', is_starter: true },
        { player_id: 125, full_name: 'Zack Arcand', jersey_number: 54, position: 'Lignebacker', is_starter: true },
        { player_id: 126, full_name: 'Nolhan Hugo', jersey_number: 53, position: 'Lignebacker', is_starter: true },
        { player_id: 127, full_name: 'Arnaud Lacroix', jersey_number: 26, position: 'Defensive Back', is_starter: true },
        { player_id: 128, full_name: 'Cedric Maltais', jersey_number: 6, position: 'Defensive Back', is_starter: true },
        { player_id: 129, full_name: 'Albert Lamothe', jersey_number: 18, position: 'Defensive Back', is_starter: true },
        { player_id: 130, full_name: 'Thomas Perron Poisson', jersey_number: 4, position: 'Defensive Back', is_starter: true },
        { player_id: 131, full_name: 'William Deschesnes', jersey_number: 14, position: 'Defensive Back', is_starter: true },
        { player_id: 132, full_name: 'Cedric Gagnon', jersey_number: 15, position: 'Defensive Back', is_starter: true },
        { player_id: 133, full_name: 'Zayan Paradis Burice', jersey_number: 28, position: 'Defensive Back', is_starter: true },
        { player_id: 134, full_name: 'Edouard Lacourisiere-Lemyre', jersey_number: 23, position: 'Defensive Back', is_starter: true },
        { player_id: 135, full_name: 'Louis Aubrey', jersey_number: 19, position: 'Defensive Back', is_starter: true },
      ],
    },
    {
      id: 2,
      team: MOCK_JUNIORS_TEAM_BUCS,
      formation: '4-3-3',
      published_at: '2026-07-03T12:30:00Z',
      entries: [
        { player_id: 136, full_name: 'Arthur Voulimy', jersey_number: 7, position: 'Quarterback', is_starter: true },
        { player_id: 137, full_name: 'Hubert Kavadias', jersey_number: 2, position: 'Quarterback', is_starter: true },
        { player_id: 138, full_name: 'Edouard Bonenfant', jersey_number: 3, position: 'Running Back', is_starter: true },
        { player_id: 139, full_name: 'Liam Deboule', jersey_number: 9, position: 'Running Back', is_starter: true },
        { player_id: 140, full_name: 'Alec Guay', jersey_number: 22, position: 'Running Back', is_starter: true },
        { player_id: 141, full_name: 'Charles Poudrier', jersey_number: 11, position: 'Running Back', is_starter: true },
        { player_id: 142, full_name: 'Hubert Kavadias', jersey_number: 2, position: 'Receveur', is_starter: true },
        { player_id: 143, full_name: 'Hubert Gelinas', jersey_number: 1, position: 'Receveur', is_starter: true },
        { player_id: 144, full_name: 'Benjamin Haydock', jersey_number: 10, position: 'Receveur', is_starter: true },
        { player_id: 145, full_name: 'Henry Lessard', jersey_number: 80, position: 'Receveur', is_starter: true },
        { player_id: 146, full_name: 'Edward Dufresne', jersey_number: 12, position: 'Receveur', is_starter: true },
        { player_id: 147, full_name: 'Liam Bellemare', jersey_number: 88, position: 'Receveur', is_starter: true },
        { player_id: 148, full_name: 'Edouard Poirier', jersey_number: 19, position: 'Receveur', is_starter: true },
        { player_id: 149, full_name: 'Charles-Antoine Arcand', jersey_number: 6, position: 'Receveur', is_starter: true },
        { player_id: 150, full_name: 'Leonard Lamirande', jersey_number: 28, position: 'Receveur', is_starter: true },
        { player_id: 151, full_name: 'Remi St-Yves', jersey_number: 55, position: 'OL/DL', is_starter: true },
        { player_id: 152, full_name: 'Nicolas Acevedo', jersey_number: 68, position: 'OL/DL', is_starter: true },
        { player_id: 153, full_name: 'Liam Cote', jersey_number: 57, position: 'OL/DL', is_starter: true },
        { player_id: 154, full_name: 'Jacob Deveault', jersey_number: 54, position: 'OL/DL', is_starter: true },
        { player_id: 155, full_name: 'Hugo Villeneuve', jersey_number: 52, position: 'OL/DL', is_starter: true },
        { player_id: 156, full_name: 'Samuel Laquerre', jersey_number: 25, position: 'Lignebacker', is_starter: true },
        { player_id: 157, full_name: 'Alexandre Fauchon', jersey_number: 45, position: 'Lignebacker', is_starter: true },
        { player_id: 158, full_name: 'Thomas Frechette', jersey_number: 44, position: 'Lignebacker', is_starter: true },
        { player_id: 159, full_name: 'Mathis Boisvert', jersey_number: 40, position: 'Lignebacker', is_starter: true },
        { player_id: 160, full_name: 'Antoine Gauthier', jersey_number: 36, position: 'Lignebacker', is_starter: true },
        { player_id: 161, full_name: 'Thomas Dufresne', jersey_number: 60, position: 'Lignebacker', is_starter: true },
        { player_id: 162, full_name: 'Julien Vigneault', jersey_number: 53, position: 'Lignebacker', is_starter: true },
        { player_id: 163, full_name: 'Theo Barthe', jersey_number: 26, position: 'Defensive Back', is_starter: true },
        { player_id: 164, full_name: 'Leo St-Yves', jersey_number: 27, position: 'Defensive Back', is_starter: true },
        { player_id: 165, full_name: 'Bastien Marchand', jersey_number: 21, position: 'Defensive Back', is_starter: true },
        { player_id: 166, full_name: 'Elliott Sylvestre', jersey_number: 4, position: 'Defensive Back', is_starter: true },
        { player_id: 167, full_name: 'Edouard Deschesnes', jersey_number: 24, position: 'Defensive Back', is_starter: true },
        { player_id: 168, full_name: 'Mika Deschesnes', jersey_number: 15, position: 'Defensive Back', is_starter: true },
        { player_id: 169, full_name: 'Leonard Lamirande', jersey_number: 28, position: 'Defensive Back', is_starter: true },
        { player_id: 170, full_name: 'Malcom Sicard', jersey_number: 13, position: 'Defensive Back', is_starter: true },
        { player_id: 171, full_name: 'James Plourde', jersey_number: 29, position: 'Defensive Back', is_starter: true },
        { player_id: 172, full_name: 'Benjamin Duguay', jersey_number: 16, position: 'Defensive Back', is_starter: true },
      ],
    },
  ],
};

const MOCK_SENIORS_MATCH: Match = {
  id: 102,
  status: 'scheduled',
  starts_at: '2026-07-03T17:30:00Z', // 13:30 heure de Trois-Rivières (EDT)
  ends_at: null,
  sport: 'football',
  sport_label: 'Football',
  home_score: null,
  away_score: null,
  field: MOCK_JUNIORS_MATCH.field,
  home_team: MOCK_SENIORS_TEAM_SEAHAWKS,
  away_team: MOCK_SENIORS_TEAM_PATS,
  lineups: [
    {
      id: 3,
      team: MOCK_SENIORS_TEAM_SEAHAWKS,
      formation: '3-4-4',
      published_at: '2026-07-03T14:00:00Z',
      entries: [
        { player_id: 200, full_name: 'Alex Trepanier', jersey_number: 1, position: 'Quarterback', is_starter: true },
        { player_id: 201, full_name: 'Hugo Carignan', jersey_number: 2, position: 'Running Back', is_starter: true },
        { player_id: 202, full_name: 'Charles Leblanc', jersey_number: 5, position: 'Running Back', is_starter: true },
        { player_id: 203, full_name: 'Emile Gosselin', jersey_number: 22, position: 'Running Back', is_starter: true },
        { player_id: 204, full_name: 'Mathis Blais', jersey_number: 14, position: 'Receveur', is_starter: true },
        { player_id: 205, full_name: 'Olivier Daly', jersey_number: 17, position: 'Receveur', is_starter: true },
        { player_id: 206, full_name: 'Gabriel Gaudet', jersey_number: 3, position: 'Receveur', is_starter: true },
        { player_id: 207, full_name: 'Edouard Cliche', jersey_number: 10, position: 'Receveur', is_starter: true },
        { player_id: 208, full_name: 'Mauva Cote', jersey_number: 7, position: 'Receveur', is_starter: true },
        { player_id: 209, full_name: 'Christophe Olivier', jersey_number: 4, position: 'Receveur', is_starter: true },
        { player_id: 210, full_name: 'Clement Tremblay', jersey_number: 27, position: 'Receveur', is_starter: true },
        { player_id: 211, full_name: 'Benjamin Parent', jersey_number: 84, position: 'Receveur', is_starter: true },
        { player_id: 212, full_name: 'Samuel Desrochers', jersey_number: 52, position: 'OL/DL', is_starter: true },
        { player_id: 213, full_name: 'Gahl Acevedo', jersey_number: 65, position: 'OL/DL', is_starter: true },
        { player_id: 214, full_name: 'Charles Moissan', jersey_number: 58, position: 'OL/DL', is_starter: true },
        { player_id: 215, full_name: 'Daven Coulombe', jersey_number: 60, position: 'OL/DL', is_starter: true },
        { player_id: 216, full_name: 'Philippe Boivert', jersey_number: 53, position: 'OL/DL', is_starter: true },
        { player_id: 217, full_name: 'Edouard Ayotte', jersey_number: 57, position: 'OL/DL', is_starter: true },
        { player_id: 218, full_name: 'Ulrick Guay', jersey_number: 34, position: 'Lignebacker', is_starter: true },
        { player_id: 219, full_name: 'Bryan Nadeau', jersey_number: 23, position: 'Lignebacker', is_starter: true },
        { player_id: 220, full_name: 'Vincent Leblanc', jersey_number: 6, position: 'Lignebacker', is_starter: true },
        { player_id: 221, full_name: 'Samuel Pelletier', jersey_number: 55, position: 'Lignebacker', is_starter: true },
        { player_id: 222, full_name: 'Milan Martel', jersey_number: 9, position: 'Lignebacker', is_starter: true },
        { player_id: 223, full_name: 'Jacob Guillemette', jersey_number: 44, position: 'Lignebacker', is_starter: true },
        { player_id: 224, full_name: 'William Sorrentino', jersey_number: 24, position: 'Defensive Back', is_starter: true },
        { player_id: 225, full_name: 'Elliot Dessureault', jersey_number: 13, position: 'Defensive Back', is_starter: true },
        { player_id: 226, full_name: 'Elliot Lampron', jersey_number: 15, position: 'Defensive Back', is_starter: true },
        { player_id: 227, full_name: 'Victor Beaulieu', jersey_number: 19, position: 'Defensive Back', is_starter: true },
        { player_id: 228, full_name: 'C-A Lemaire', jersey_number: 12, position: 'Defensive Back', is_starter: true },
        { player_id: 229, full_name: 'Matias Caron', jersey_number: 8, position: 'Defensive Back', is_starter: true },
        { player_id: 230, full_name: 'Maveric Bellemare', jersey_number: 21, position: 'Defensive Back', is_starter: true },
        { player_id: 231, full_name: 'Abel Paris', jersey_number: 40, position: 'Defensive Back', is_starter: true },
      ],
    },
    {
      id: 4,
      team: MOCK_SENIORS_TEAM_PATS,
      formation: '3-4-4',
      published_at: '2026-07-03T14:00:00Z',
      entries: [
        { player_id: 300, full_name: 'Frederik Tardif', jersey_number: 9, position: 'Quarterback', is_starter: true },
        { player_id: 301, full_name: 'Alexis Moreau', jersey_number: 7, position: 'Running Back', is_starter: true },
        { player_id: 302, full_name: 'Nolan Gelinas', jersey_number: 1, position: 'Running Back', is_starter: true },
        { player_id: 303, full_name: 'Benjamin Barabe', jersey_number: 3, position: 'Running Back', is_starter: true },
        { player_id: 304, full_name: 'Milan Parent', jersey_number: 5, position: 'Receveur', is_starter: true },
        { player_id: 305, full_name: 'Charles Bozeau', jersey_number: 12, position: 'Receveur', is_starter: true },
        { player_id: 306, full_name: 'Olivier Garant', jersey_number: 4, position: 'Receveur', is_starter: true },
        { player_id: 307, full_name: 'Victor Lacourre', jersey_number: 14, position: 'Receveur', is_starter: true },
        { player_id: 308, full_name: 'Simon Lefebvre', jersey_number: 88, position: 'Receveur', is_starter: true },
        { player_id: 309, full_name: 'Emile Verret', jersey_number: 80, position: 'Receveur', is_starter: true },
        { player_id: 310, full_name: 'Victor Baby', jersey_number: 18, position: 'Receveur', is_starter: true },
        { player_id: 311, full_name: 'Adrien M-Dubois', jersey_number: 97, position: 'OL/DL', is_starter: true },
        { player_id: 312, full_name: 'Emile Ayotte', jersey_number: 51, position: 'OL/DL', is_starter: true },
        { player_id: 313, full_name: 'Rafael Duerie', jersey_number: 68, position: 'OL/DL', is_starter: true },
        { player_id: 314, full_name: 'Antoine Langlois', jersey_number: 53, position: 'OL/DL', is_starter: true },
        { player_id: 315, full_name: 'Gabriel Giguere', jersey_number: 57, position: 'OL/DL', is_starter: true },
        { player_id: 316, full_name: 'Mateo Couture', jersey_number: 23, position: 'Lignebacker', is_starter: true },
        { player_id: 317, full_name: 'Liam Brube', jersey_number: 40, position: 'Lignebacker', is_starter: true },
        { player_id: 318, full_name: 'Lowes Indombi', jersey_number: 42, position: 'Lignebacker', is_starter: true },
        { player_id: 319, full_name: 'Hugo Ducharme', jersey_number: 44, position: 'Lignebacker', is_starter: true },
        { player_id: 320, full_name: 'Midherik Laforce', jersey_number: 11, position: 'Lignebacker', is_starter: true },
        { player_id: 321, full_name: 'Lucas Roy', jersey_number: 52, position: 'Lignebacker', is_starter: true },
        { player_id: 322, full_name: 'Alexandre Sorrentino', jersey_number: 24, position: 'Defensive Back', is_starter: true },
        { player_id: 323, full_name: 'Charles Messier', jersey_number: 13, position: 'Defensive Back', is_starter: true },
        { player_id: 324, full_name: 'Benjamin Choquette', jersey_number: 21, position: 'Defensive Back', is_starter: true },
        { player_id: 325, full_name: 'Jeremie Caya', jersey_number: 22, position: 'Defensive Back', is_starter: true },
        { player_id: 326, full_name: 'Gabriel Duguette', jersey_number: 26, position: 'Defensive Back', is_starter: true },
        { player_id: 327, full_name: 'Jake Charland', jersey_number: 8, position: 'Defensive Back', is_starter: true },
        { player_id: 328, full_name: 'Nolan Provencher', jersey_number: 16, position: 'Defensive Back', is_starter: true },
      ],
    },
  ],
};

const MATCHES = [MOCK_JUNIORS_MATCH, MOCK_SENIORS_MATCH];

const MOCK_GEO_RESULT: GeoResolveResult = {
  field: MOCK_JUNIORS_MATCH.field ?? null,
  active_match: MOCK_JUNIORS_MATCH,
  next_match: MOCK_SENIORS_MATCH,
  schedule: [MOCK_JUNIORS_MATCH, MOCK_SENIORS_MATCH],
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
    const match = MATCHES.find((m) => m.id === matchId) ?? MATCHES[0];
    const searchStr = String(number);
    const hits: PlayerHit[] = [];

    if (match.lineups) {
      for (const lineup of match.lineups) {
        if (lineup.entries) {
          for (const entry of lineup.entries) {
            if (entry.jersey_number !== null && String(entry.jersey_number) === searchStr) {
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
    for (const match of MATCHES) {
      if (match.lineups) {
        for (const lineup of match.lineups) {
          if (lineup.entries) {
            const entry = lineup.entries.find((e) => e.player_id === id);
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
    const allTeams = [
      MOCK_JUNIORS_TEAM_BILLS,
      MOCK_JUNIORS_TEAM_BUCS,
      MOCK_SENIORS_TEAM_SEAHAWKS,
      MOCK_SENIORS_TEAM_PATS,
    ];
    return allTeams.filter((team) => {
      if (params?.sport && params.sport !== team.sport) {
        return false;
      }
      return true;
    });
  }

  const qs = new URLSearchParams();
  if (params?.region) qs.set('region', params.region);
  if (params?.sport) qs.set('sport', params.sport);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await request<{ data: Team[] }>(`/teams${suffix}`);
  return res.data;
}

/**
 * The mock teams only carry a players_count; their actual rosters live in the
 * match lineups. Rebuild the roster for a team from the matching lineup entries
 * so the Alignements roster sheet has players to show.
 */
function mockRosterForTeam(teamId: number): RosterPlayer[] {
  for (const m of MATCHES) {
    for (const lineup of m.lineups ?? []) {
      if (lineup.team?.id === teamId) {
        return (lineup.entries ?? []).map((e) => ({
          id: e.player_id,
          first_name: null,
          last_name: null,
          full_name: e.full_name,
          photo_path: null,
          jersey_number: e.jersey_number,
          position: e.position,
        }));
      }
    }
  }
  return [];
}

/** GET /teams/{id} — full team with its roster (all players). */
export async function getTeam(id: number): Promise<Team> {
  if (USE_MOCK_DATA) {
    const base =
      id === 3 ? MOCK_JUNIORS_TEAM_BILLS :
      id === 4 ? MOCK_JUNIORS_TEAM_BUCS :
      id === 5 ? MOCK_SENIORS_TEAM_SEAHAWKS :
      id === 6 ? MOCK_SENIORS_TEAM_PATS :
      MOCK_JUNIORS_TEAM_BILLS; // Default fallback
    const players = mockRosterForTeam(base.id);
    return { ...base, players, players_count: players.length };
  }

  const res = await request<{ data: Team }>(`/teams/${id}`);
  return res.data;
}

/** GET /fields/regions — distinct regions for the Terrain filter chips. */
export async function listRegions(): Promise<string[]> {
  if (USE_MOCK_DATA) {
    return ['Mauricie'];
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
