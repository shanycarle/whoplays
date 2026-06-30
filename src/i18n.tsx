import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'fr' | 'en';

const STORAGE_KEY = 'whoplays.lang.v1';

type Dict = Record<string, { fr: string; en: string }>;

const STRINGS: Dict = {
  // Top panel / search
  findByNumber: { fr: 'TROUVEZ LE JOUEUR PAR SON NUMÉRO', en: 'FIND THE PLAYER BY NUMBER' },
  enterNumberPh: { fr: 'Entrez le numéro du joueur', en: "Enter the player's number" },
  noFieldNearby: { fr: 'Aucun terrain à proximité', en: 'No field nearby' },
  locationUnavailable: { fr: 'Localisation indisponible', en: 'Location unavailable' },
  locating: { fr: 'Localisation…', en: 'Locating…' },
  change: { fr: 'Changer', en: 'Change' },
  locationDenied: {
    fr: 'Active la localisation pour trouver le match autour de toi.',
    en: 'Enable location to find the match around you.',
  },
  unexpectedError: { fr: 'Erreur inattendue.', en: 'Unexpected error.' },
  connectError: {
    fr: "Impossible de joindre le serveur. Vérifie qu'il tourne et que l'adresse est correcte.",
    en: 'Cannot reach the server. Check that it is running and the address is correct.',
  },

  // Matchup banner
  tapTeamHint: { fr: 'Touchez une équipe pour cibler la recherche', en: 'Tap a team to target the search' },
  searchingIn: { fr: 'Recherche dans {name}', en: 'Searching in {name}' },

  // Keypad
  searchBtn: { fr: 'Rechercher', en: 'Search' },

  // Result card
  enterNumberTitle: { fr: 'ENTREZ LE NUMÉRO', en: 'ENTER A NUMBER' },
  nameWillShow: { fr: "Le nom du joueur s'affichera ici", en: "The player's name will appear here" },
  noLiveMatch: { fr: 'AUCUN MATCH EN COURS', en: 'NO MATCH IN PROGRESS' },
  approachField: { fr: 'Approche-toi du terrain pendant un match', en: 'Get near the field during a match' },
  searchingTitle: { fr: 'RECHERCHE…', en: 'SEARCHING…' },
  numberN: { fr: 'Numéro {n}', en: 'Number {n}' },
  unknownPlayer: { fr: 'Joueur inconnu', en: 'Unknown player' },
  noNumberTitle: { fr: 'AUCUN NUMÉRO « {n} »', en: 'NO NUMBER “{n}”' },
  noNumberSub: { fr: 'Aucun numéro ne contient ces chiffres', en: 'No number contains these digits' },

  // Recents
  recentSearches: { fr: 'RECHERCHES RÉCENTES', en: 'RECENT SEARCHES' },
  seeAll: { fr: 'Voir tout', en: 'See all' },

  // Tabs
  tabSearch: { fr: 'WhoPlays', en: 'WhoPlays' },
  tabLineups: { fr: 'Alignements', en: 'Lineups' },
  tabField: { fr: 'Terrains', en: 'Fields' },
  tabSchedule: { fr: 'Calendrier', en: 'Schedule' },

  // Generic
  comingSoon: { fr: 'Section à venir', en: 'Coming soon' },
  all_f: { fr: 'Toutes', en: 'All' },
  all_m: { fr: 'Tous', en: 'All' },
  allSports: { fr: 'Tous sports', en: 'All sports' },
  region: { fr: 'Région', en: 'Region' },
  sport: { fr: 'Sport', en: 'Sport' },

  // Fields tab
  searchFieldPh: { fr: 'Rechercher un terrain ou une ville…', en: 'Search a field or city…' },
  regionUnknown: { fr: 'Région inconnue', en: 'Unknown region' },
  fieldFallback: { fr: 'Terrain', en: 'Field' },
  noField: { fr: 'Aucun terrain', en: 'No field' },
  noFieldHint: { fr: 'Essaie une autre recherche, région ou sport', en: 'Try another search, region or sport' },
  noFieldRegistered: { fr: 'Aucun terrain enregistré', en: 'No field registered' },

  // Schedule tab
  maxRadius: { fr: 'Rayon maximum', en: 'Max radius' },
  today: { fr: "Aujourd'hui", en: 'Today' },
  tomorrow: { fr: 'Demain', en: 'Tomorrow' },
  noMatch: { fr: 'Aucune partie', en: 'No match' },
  noMatchWithin: { fr: 'Aucune partie dans un rayon de {n} km', en: 'No match within {n} km' },
  unknownField: { fr: 'Terrain inconnu', en: 'Unknown field' },

  // Lineups tab
  noLineup: { fr: 'Aucun alignement', en: 'No lineup' },
  noLineupHint: { fr: 'Essaie une autre région ou un autre sport', en: 'Try another region or sport' },
  teamFallback: { fr: 'Équipe', en: 'Team' },

  // Profile modal
  teamColors: { fr: "Couleurs de l'équipe", en: 'Team colors' },
  teamColorsSub: {
    fr: 'Choisis tes deux couleurs — elles habillent toute l\'app.',
    en: 'Pick your two colors — they theme the whole app.',
  },
  primaryColor: { fr: 'Couleur principale', en: 'Primary color' },
  secondaryColor: { fr: 'Couleur secondaire', en: 'Secondary color' },
  language: { fr: 'Langue', en: 'Language' },
  reset: { fr: 'Réinitialiser', en: 'Reset' },
  close: { fr: 'Fermer', en: 'Close' },
  loadDemoField: { fr: '▶ Charger le terrain démo', en: '▶ Load demo field' },

  // Player detail
  number: { fr: 'N°', en: 'No.' },
  age: { fr: 'ÂGE', en: 'AGE' },
  year: { fr: 'ANNÉE', en: 'YEAR' },
  measurements: { fr: 'MENSURATIONS', en: 'MEASUREMENTS' },
  height: { fr: 'TAILLE', en: 'HEIGHT' },
  weight: { fr: 'POIDS', en: 'WEIGHT' },
  academicInfo: { fr: 'INFORMATIONS ACADÉMIQUES', en: 'ACADEMIC INFO' },
  discipline: { fr: 'DISCIPLINE', en: 'PROGRAM' },
  otherInfo: { fr: 'AUTRES INFORMATIONS', en: 'OTHER INFO' },
  jerseyNumbers: { fr: 'NUMÉROS PORTÉS', en: 'JERSEY NUMBERS' },
  birthdate: { fr: 'DATE DE NAISSANCE', en: 'DATE OF BIRTH' },
  hometown: { fr: "VILLE D'ORIGINE", en: 'HOMETOWN' },
  yearsOld: { fr: '{n} ans', en: '{n} yrs' },

  // Count words (pluralized by appending "s" when n>1)
  wordField: { fr: 'terrain', en: 'field' },
  wordLineup: { fr: 'alignement', en: 'lineup' },
  wordPlayer: { fr: 'joueur', en: 'player' },
  wordMatch: { fr: 'partie', en: 'match' },
};

type LangCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  tr: (key: keyof typeof STRINGS, vars?: Record<string, string | number>) => string;
  /** "n word(s)" with naive pluralization (append s when n > 1). */
  trCount: (n: number, wordKey: 'wordField' | 'wordLineup' | 'wordPlayer' | 'wordMatch') => string;
};

const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'fr' || v === 'en') setLangState(v);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  }, []);

  const tr = useCallback(
    (key: keyof typeof STRINGS, vars?: Record<string, string | number>) => {
      let out = STRINGS[key]?.[lang] ?? String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
      }
      return out;
    },
    [lang],
  );

  const trCount = useCallback<LangCtx['trCount']>(
    (n, wordKey) => {
      const word = STRINGS[wordKey][lang];
      return `${n} ${word}${n > 1 ? 's' : ''}`;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, tr, trCount }), [lang, setLang, tr, trCount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
