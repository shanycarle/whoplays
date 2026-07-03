import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { ThemeProvider, useTheme } from './src/ThemeContext';
import { LanguageProvider, useLang, type Lang } from './src/i18n';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from './src/haptics';
import { SWATCHES, spacing, radius, type Theme } from './src/theme';
import {
  ApiError,
  findPlayerByNumber,
  getPlayer,
  getTeam,
  listRegions,
  nearbyMatches,
  resolveGeo,
  searchFields,
  searchTeams,
  SPORTS,
  type Field,
  type GeoResolveResult,
  type Match,
  type PlayerHit,
  type PlayerProfile,
  type RosterPlayer,
  type Team,
} from './src/api';

const RECENTS_KEY = 'whoplays.recents.v1';
const DEMO_COORDS = { lat: 45.559, lng: -73.554 };

type Phase = 'locating' | 'resolving' | 'ready' | 'error';
type TabKey = 'search' | 'lineups' | 'field' | 'calendar';

const TABS: { key: TabKey; labelKey: string; icon: (color: string) => ReactNode }[] = [
  { key: 'search', labelKey: 'tabSearch', icon: (c) => <Ionicons name="search" size={22} color={c} /> },
  { key: 'lineups', labelKey: 'tabLineups', icon: (c) => <Ionicons name="people" size={22} color={c} /> },
  { key: 'field', labelKey: 'tabField', icon: (c) => <MaterialCommunityIcons name="soccer-field" size={22} color={c} /> },
  { key: 'calendar', labelKey: 'tabSchedule', icon: (c) => <Ionicons name="calendar" size={22} color={c} /> },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <Root />
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { theme: t } = useTheme();
  const { tr } = useLang();
  const s = useMemo(() => makeStyles(t), [t]);

  const [phase, setPhase] = useState<Phase>('locating');
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoResolveResult | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [number, setNumber] = useState('');
  const [hits, setHits] = useState<PlayerHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const queryId = useRef(0);

  const [recents, setRecents] = useState<PlayerHit[]>([]);
  const [tab, setTab] = useState<TabKey>('search');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null); // null = les deux équipes
  const [profileOpen, setProfileOpen] = useState(false);
  const [installPromptVisible, setInstallPromptVisible] = useState(false);
  const installPromptRef = useRef<any>(null);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const triedDemo = useRef(false);

  // Player zoom popup
  const [selected, setSelected] = useState<PlayerHit | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // ---- disable pinch / zoom everywhere (web only; native doesn't zoom) ----
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc: any = (globalThis as any).document;
    if (!doc) return;
    let meta = doc.querySelector('meta[name=viewport]');
    if (!meta) {
      meta = doc.createElement('meta');
      meta.setAttribute('name', 'viewport');
      doc.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no',
    );
    const stopGesture = (e: any) => e.preventDefault();
    const stopCtrlWheel = (e: any) => { if (e.ctrlKey) e.preventDefault(); };
    const stopKeyZoom = (e: any) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
    };
    doc.addEventListener('gesturestart', stopGesture, { passive: false });
    doc.addEventListener('gesturechange', stopGesture, { passive: false });
    doc.addEventListener('wheel', stopCtrlWheel, { passive: false });
    doc.addEventListener('keydown', stopKeyZoom);
    if (doc.body?.style) doc.body.style.touchAction = 'manipulation';
    return () => {
      doc.removeEventListener('gesturestart', stopGesture);
      doc.removeEventListener('gesturechange', stopGesture);
      doc.removeEventListener('wheel', stopCtrlWheel);
      doc.removeEventListener('keydown', stopKeyZoom);
    };
  }, []);

  // ---- recents persistence ----
  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => raw && setRecents(JSON.parse(raw)))
      .catch(() => {});
  }, []);
  const addRecent = useCallback((hit: PlayerHit) => {
    setRecents((prev) => {
      const next = [hit, ...prev.filter((p) => p.player_id !== hit.player_id)].slice(0, 12);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Tap a player (search result or recent) → remember it + open the zoom popup.
  const openPlayer = useCallback(
    (hit: PlayerHit) => {
      hapticSelect();
      addRecent(hit);
      setSelected(hit);
      setProfile(null);
      setProfileLoading(true);
      getPlayer(hit.player_id)
        .then(setProfile)
        .catch(() => setProfile(null))
        .finally(() => setProfileLoading(false));
    },
    [addRecent],
  );

  // ---- locate + resolve ----
  const locate = useCallback(async (override?: { lat: number; lng: number }) => {
    setPhase('locating');
    setError(null);
    setNumber('');
    setHits(null);
    setSelectedTeamId(null);
    try {
      let lat: number;
      let lng: number;
      let accuracy: number | null = null;
      if (override) {
        ({ lat, lng } = override);
      } else if (Platform.OS === 'web') {
        // Web: skip location, use demo coords for mock data testing
        ({ lat, lng } = DEMO_COORDS);
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError(tr('locationDenied'));
          setPhase('error');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        ({ latitude: lat, longitude: lng, accuracy } = pos.coords);
      }
      setPhase('resolving');
      setCoords({ lat, lng });
      const res = await resolveGeo(lat, lng, accuracy);
      // Dev convenience: if nothing nearby, fall back once to the seeded demo field.
      if (!res.field && __DEV__ && !override && !triedDemo.current) {
        triedDemo.current = true;
        return locate(DEMO_COORDS);
      }
      setGeo(res);
      setPhase('ready');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr('unexpectedError'));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void locate();
  }, [locate]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const win = window as Window & typeof globalThis & {
      beforeinstallprompt?: (event: Event) => void;
      appinstalled?: () => void;
    };
    const isStandalone = win.matchMedia?.('(display-mode: standalone)').matches || Boolean((win.navigator as Navigator & { standalone?: boolean }).standalone);
    if (isStandalone) return;

    const showInstallPrompt = () => {
      setInstallPromptVisible(true);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event;
      showInstallPrompt();
    };

    const handleAppInstalled = () => {
      installPromptRef.current = null;
      setInstallPromptVisible(false);
    };

    const timer = window.setTimeout(showInstallPrompt, 1400);

    win.addEventListener?.('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    win.addEventListener?.('appinstalled', handleAppInstalled as EventListener);

    return () => {
      window.clearTimeout(timer);
      win.removeEventListener?.('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      win.removeEventListener?.('appinstalled', handleAppInstalled as EventListener);
    };
  }, []);

  const handleInstallPwa = useCallback(async () => {
    const event = installPromptRef.current;
    if (!event) {
      setInstallPromptVisible(false);
      if (typeof window !== 'undefined') {
        window.open('https://support.google.com/chrome/answer/9658361?hl=fr', '_blank', 'noopener,noreferrer');
      }
      return;
    }

    try {
      await (event as any).prompt();
      const choice = await (event as any).userChoice;
      if (choice?.outcome === 'accepted') {
        installPromptRef.current = null;
      }
    } catch {
      // noop
    } finally {
      setInstallPromptVisible(false);
    }
  }, []);

  const activeMatch: Match | null = geo?.active_match ?? null;

  // Filter the results to the team picked in the matchup banner (null = both).
  const displayedHits = useMemo(() => {
    if (hits == null) return null;
    return selectedTeamId == null ? hits : hits.filter((h) => h.team_id === selectedTeamId);
  }, [hits, selectedTeamId]);

  // ---- search ----
  const runSearch = useCallback(
    async (remember: boolean) => {
      const n = parseInt(number, 10);
      if (!activeMatch || number === '' || Number.isNaN(n)) return;
      const id = ++queryId.current;
      setSearching(true);
      try {
        const res = await findPlayerByNumber(activeMatch.id, n);
        if (id !== queryId.current) return;
        setHits(res);
        // Match what the user actually sees (team filter applied).
        const visible = selectedTeamId == null ? res : res.filter((h) => h.team_id === selectedTeamId);
        if (remember) {
          if (visible.length > 0) {
            addRecent(visible[0]);
            hapticSuccess();
          } else {
            hapticWarning();
          }
        }
      } catch {
        if (id === queryId.current) setHits([]);
      } finally {
        if (id === queryId.current) setSearching(false);
      }
    },
    [number, activeMatch, addRecent, selectedTeamId],
  );

  // Live preview as the number is typed (debounced); explicit button "remembers".
  useEffect(() => {
    if (number === '') {
      setHits(null);
      return;
    }
    const h = setTimeout(() => void runSearch(false), 150);
    return () => clearTimeout(h);
  }, [number, runSearch]);

  const press = (key: string) => {
    hapticTap();
    if (key === 'del') setNumber((n) => n.slice(0, -1));
    else if (key === 'search') void runSearch(true);
    else if (number.length < 3) setNumber((n) => n + key);
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle={t.onPrimary === '#FFFFFF' ? 'light-content' : 'dark-content'} />

      {/* ---- Green top panel ---- */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: t.primary }}>
        <View style={s.topPanel}>
          <View style={s.topRow}>
            <View style={s.topSide} />
            <Logo t={t} s={s} />
            <Pressable onPress={() => setProfileOpen(true)} hitSlop={10} style={[s.topSide, { alignItems: 'flex-end' }]}>
              <Ionicons name="person-circle" size={30} color={t.secondary} />
            </Pressable>
          </View>

          <View style={s.titleRow}>
            <View style={s.titleLine} />
            <Text style={s.title}>{tr('findByNumber')}</Text>
            <View style={s.titleLine} />
          </View>

          <View style={s.searchBar}>
            <Ionicons name="search" size={20} color={t.muted} />
            <Text style={[s.searchText, number === '' && s.searchPlaceholder]} numberOfLines={1}>
              {number === '' ? tr('enterNumberPh') : `N° ${number}`}
            </Text>
          </View>

          <View style={s.locationRow}>
            <Ionicons name="location-sharp" size={16} color={t.secondary} />
            <Pressable
              onPress={() => geo?.field && setSelectedField(geo.field)}
              style={{ flex: 1 }}
              hitSlop={8}
            >
              <Text style={s.locationText} numberOfLines={1}>
                {phase === 'ready'
                  ? geo?.field?.name ?? tr('noFieldNearby')
                  : phase === 'error'
                  ? tr('locationUnavailable')
                  : tr('locating')}
              </Text>
            </Pressable>
            <Pressable onPress={() => locate()} hitSlop={8} style={s.changeBtn}>
              <Ionicons name="locate" size={15} color={t.secondary} />
              <Text style={s.changeText}>{tr('change')}</Text>
            </Pressable>
          </View>

          {phase === 'ready' && activeMatch && (
            <MatchupBanner
              t={t}
              s={s}
              match={activeMatch}
              selectedTeamId={selectedTeamId}
              onSelectTeam={(id) => {
                hapticSelect();
                setSelectedTeamId((prev) => (prev === id ? null : id));
              }}
            />
          )}
        </View>
      </SafeAreaView>

      {/* ---- White body ---- */}
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {tab === 'field' ? (
          <FieldsScreen t={t} s={s} />
        ) : tab === 'calendar' ? (
          <ScheduleScreen t={t} s={s} coords={coords} phase={phase} />
        ) : tab === 'lineups' ? (
          <AlignementsScreen t={t} s={s} />
        ) : tab !== 'search' ? (
          <StubScreen t={t} s={s} label={tr(TABS.find((x) => x.key === tab)!.labelKey as never)} />
        ) : (
          <>
            <Keypad t={t} s={s} onPress={press} canDelete={number !== ''} searching={searching} />
            <ResultCard
              t={t}
              s={s}
              number={number}
              hits={displayedHits}
              searching={searching}
              hasMatch={!!activeMatch}
              phase={phase}
              onPlayer={openPlayer}
            />
            <Recents t={t} s={s} recents={recents} onPlayer={openPlayer} />
          </>
        )}
      </ScrollView>

      {/* ---- Bottom tab bar ---- */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: t.primary }}>
        <View style={s.tabBar}>
          {TABS.map((tb) => {
            const active = tb.key === tab;
            return (
              <Pressable key={tb.key} onPress={() => setTab(tb.key)} style={s.tabItem}>
                <View style={active ? s.tabActive : s.tabIcon}>
                  {tb.icon(active ? t.primary : t.secondary)}
                </View>
                <Text style={[s.tabLabel, { color: active ? t.onPrimary : t.secondary }]} numberOfLines={1}>
                  {active ? tr(tb.labelKey as never) : tr(tb.labelKey as never).toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>

      <ProfileModal
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        onDemo={() => {
          setProfileOpen(false);
          void locate(DEMO_COORDS);
        }}
      />

      <PlayerDetailModal
        t={t}
        s={s}
        hit={selected}
        profile={profile}
        loading={profileLoading}
        onClose={() => setSelected(null)}
      />

      <FieldDetailModal t={t} s={s} field={selectedField} onClose={() => setSelectedField(null)} />

      <InstallPwaPrompt
        visible={installPromptVisible}
        onClose={() => setInstallPromptVisible(false)}
        onInstall={handleInstallPwa}
        s={s}
      />
    </View>
  );
}

function InstallPwaPrompt({ visible, onClose, onInstall, s }: { visible: boolean; onClose: () => void; onInstall: () => void; s: Styles }) {
  if (Platform.OS !== 'web') return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable style={[s.modalSheet, { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }] } onPress={(e) => e.stopPropagation()}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Installer WhoPlays</Text>
          <View style={[s.preview, { backgroundColor: '#F3F7FF', marginTop: spacing.md }] }>
            <Ionicons name="phone-portrait-outline" size={24} color={s.previewText.color} />
            <View style={{ flex: 1 }}>
              <Text style={s.previewText}>Pour une meilleure expérience, ajoutez WhoPlays à l’écran d’accueil.</Text>
              <Text style={{ color: '#64748B', fontSize: 13, marginTop: 6 }}>
                Vous bénéficierez du plein écran et d’un accès plus rapide à chaque visite.
              </Text>
            </View>
          </View>
          <View style={s.modalActions}>
            <Pressable style={[s.modalBtn, s.modalBtnGhost]} onPress={onClose}>
              <Text style={[s.modalBtnText, { color: '#334155' }]}>Plus tard</Text>
            </Pressable>
            <Pressable style={[s.modalBtn, { backgroundColor: '#2563EB' }]} onPress={onInstall}>
              <Text style={[s.modalBtnText, { color: '#FFFFFF' }]}>Installer</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- Presentational pieces ----------

function Logo({ t, s }: { t: Theme; s: Styles }) {
  return (
    <View style={s.logo}>
      <Text style={s.logoText}>
        <Text style={{ color: t.onPrimary }}>Who</Text>
        <Text style={{ color: t.secondary }}>Plays</Text>
        <Text style={[s.logoIo, { color: t.onPrimary }]}>.io</Text>
      </Text>
    </View>
  );
}

function MatchupBanner({
  t,
  s,
  match,
  selectedTeamId,
  onSelectTeam,
}: {
  t: Theme;
  s: Styles;
  match: Match;
  selectedTeamId: number | null;
  onSelectTeam: (id: number) => void;
}) {
  const { tr } = useLang();
  const home = match.home_team ?? null;
  const away = match.away_team ?? null;
  if (!home && !away) return null;
  const category = home?.category ?? away?.category ?? null;
  const badge = [match.sport_label, category].filter(Boolean).join(' · ');
  const hasSelection = selectedTeamId != null;

  return (
    <View style={s.matchup}>
      <View style={s.matchupRow}>
        <TeamCrest
          t={t}
          s={s}
          team={home}
          align="left"
          selected={!!home && selectedTeamId === home.id}
          dimmed={hasSelection && !!home && selectedTeamId !== home.id}
          onPress={() => home && onSelectTeam(home.id)}
        />
        <View style={s.vsWrap}>
          <Text style={s.vsText}>VS</Text>
        </View>
        <TeamCrest
          t={t}
          s={s}
          team={away}
          align="right"
          selected={!!away && selectedTeamId === away.id}
          dimmed={hasSelection && !!away && selectedTeamId !== away.id}
          onPress={() => away && onSelectTeam(away.id)}
        />
      </View>
      {!!badge && (
        <View style={s.catBadge}>
          {!!match.sport && sportIcon(match.sport, t.secondary, 13)}
          <Text style={s.catBadgeText}>{badge}</Text>
        </View>
      )}
      <Text style={s.matchupHint}>
        {hasSelection
          ? tr('searchingIn', { name: (selectedTeamId === home?.id ? home?.name : away?.name) ?? '' })
          : tr('tapTeamHint')}
      </Text>
    </View>
  );
}

function TeamCrest({
  t,
  s,
  team,
  align,
  selected,
  dimmed,
  onPress,
}: {
  t: Theme;
  s: Styles;
  team: Team | null;
  align: 'left' | 'right';
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  const name = team?.name ?? '—';
  const crestColor = team?.color_primary ?? t.secondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!team}
      hitSlop={6}
      style={[s.matchTeam, align === 'right' && { flexDirection: 'row-reverse' }, dimmed && { opacity: 0.4 }]}
    >
      <View>
        <View style={[s.crest, { backgroundColor: crestColor }, selected && s.crestSelected]}>
          {team?.logo_path ? (
            <Image source={{ uri: team.logo_path }} style={s.crestImg} />
          ) : (
            <Text style={s.crestText}>{initials(name)}</Text>
          )}
        </View>
        {selected && (
          <View style={s.crestCheck}>
            <Ionicons name="checkmark" size={11} color={t.onSecondary} />
          </View>
        )}
      </View>
      <Text
        style={[s.teamName, { textAlign: align }, selected && { color: t.secondary, fontWeight: '900' }]}
        numberOfLines={2}
      >
        {name}
      </Text>
    </Pressable>
  );
}

function Keypad({
  t,
  s,
  onPress,
  canDelete,
  searching,
}: {
  t: Theme;
  s: Styles;
  onPress: (k: string) => void;
  canDelete: boolean;
  searching: boolean;
}) {
  const { tr } = useLang();
  const rows = [
    ['1', '2', '3', 'del'],
    ['4', '5', '6', '0'],
    ['7', '8', '9', 'search'],
  ];
  return (
    <View style={s.keypad}>
      {rows.map((row, ri) => (
        <View key={ri} style={s.keyRow}>
          {row.map((k) => {
            if (k === 'search') {
              return (
                <Pressable
                  key={k}
                  onPress={() => onPress(k)}
                  style={({ pressed }) => [s.key, s.keySearch, pressed && { opacity: 0.85 }]}
                >
                  {searching ? (
                    <ActivityIndicator color={t.onSecondary} />
                  ) : (
                    <>
                      <Ionicons name="search" size={20} color={t.onSecondary} />
                      <Text style={[s.keySearchLabel, { color: t.onSecondary }]}>{tr('searchBtn')}</Text>
                    </>
                  )}
                </Pressable>
              );
            }
            if (k === 'del') {
              return (
                <Pressable
                  key={k}
                  onPress={() => onPress(k)}
                  disabled={!canDelete}
                  style={({ pressed }) => [s.key, s.keyPlain, pressed && { backgroundColor: '#EFEFEA' }, !canDelete && { opacity: 0.4 }]}
                >
                  <Ionicons name="backspace-outline" size={26} color={t.primary} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={k}
                onPress={() => onPress(k)}
                style={({ pressed }) => [s.key, s.keyPlain, pressed && { backgroundColor: '#EFEFEA' }]}
              >
                <Text style={s.keyNum}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ResultCard({
  t,
  s,
  number,
  hits,
  searching,
  hasMatch,
  phase,
  onPlayer,
}: {
  t: Theme;
  s: Styles;
  number: string;
  hits: PlayerHit[] | null;
  searching: boolean;
  hasMatch: boolean;
  phase: Phase;
  onPlayer: (hit: PlayerHit) => void;
}) {
  const { tr } = useLang();
  let icon = <MaterialCommunityIcons name="tshirt-crew" size={26} color={t.onPrimary} />;
  let title = tr('enterNumberTitle');
  let subtitle = tr('nameWillShow');

  if (phase === 'ready' && !hasMatch) {
    title = tr('noLiveMatch');
    subtitle = tr('approachField');
  } else if (number !== '' && searching && hits == null) {
    title = tr('searchingTitle');
    subtitle = tr('numberN', { n: number });
  } else if (hits && hits.length > 0) {
    // Found — render rich player rows (numbers containing the typed digits).
    return (
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {hits.map((h) => (
          <Pressable
            key={`${h.team_id}-${h.player_id}`}
            style={({ pressed }) => [s.foundCard, pressed && { opacity: 0.7 }]}
            onPress={() => onPlayer(h)}
          >
            <Avatar t={t} s={s} hit={h} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={s.foundName}>{h.full_name ?? tr('unknownPlayer')}</Text>
              <Text style={s.foundMeta}>{[h.position, h.team].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={s.foundBadge}>
              <Text style={s.foundBadgeText}>{h.jersey_number ?? '?'}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    );
  } else if (number !== '' && hits && hits.length === 0) {
    icon = <Ionicons name="help" size={26} color={t.onPrimary} />;
    title = tr('noNumberTitle', { n: number });
    subtitle = tr('noNumberSub');
  }

  return (
    <View style={s.placeholder}>
      <View style={s.placeholderIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.placeholderTitle}>{title}</Text>
        <Text style={s.placeholderSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

function Recents({
  t,
  s,
  recents,
  onPlayer,
}: {
  t: Theme;
  s: Styles;
  recents: PlayerHit[];
  onPlayer: (hit: PlayerHit) => void;
}) {
  const { tr } = useLang();
  if (recents.length === 0) return null;
  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={s.recentsHeader}>
        <Text style={s.recentsTitle}>{tr('recentSearches')}</Text>
        <Text style={s.seeAll}>{tr('seeAll')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.sm }}>
        {recents.map((h) => (
          <Pressable
            key={`${h.team_id}-${h.player_id}`}
            style={({ pressed }) => [s.recentCard, pressed && { opacity: 0.7 }]}
            onPress={() => onPlayer(h)}
          >
            <Avatar t={t} s={s} hit={h} size={64} />
            <Text style={s.recentName} numberOfLines={1}>{h.full_name ?? '—'}</Text>
            <Text style={s.recentPos} numberOfLines={1}>{h.position ?? ''}</Text>
            <Text style={s.recentTeam} numberOfLines={1}>{h.team ?? ''}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Avatar({ t, s, hit, size }: { t: Theme; s: Styles; hit: PlayerHit; size: number }) {
  const initials = (hit.full_name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={[s.avatarWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {hit.photo_path ? (
        <Image source={{ uri: hit.photo_path }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[s.avatarInitials, { fontSize: size * 0.36 }]}>{initials}</Text>
      )}
      <View style={s.avatarBadge}>
        <Text style={s.avatarBadgeText}>{hit.jersey_number ?? '?'}</Text>
      </View>
    </View>
  );
}

// ---------- Terrain tab : search fields by region ----------

function sportIcon(sport: string | null, color: string, size = 22): ReactNode {
  switch (sport) {
    case 'football':
      return <MaterialCommunityIcons name="football-helmet" size={size} color={color} />;
    case 'flag_football':
      return <MaterialCommunityIcons name="flag-checkered" size={size} color={color} />;
    case 'rugby':
      return <MaterialCommunityIcons name="rugby" size={size} color={color} />;
    case 'soccer':
      return <MaterialCommunityIcons name="soccer" size={size} color={color} />;
    case 'baseball':
      return <MaterialCommunityIcons name="baseball-bat" size={size} color={color} />;
    case 'basketball':
      return <MaterialCommunityIcons name="basketball" size={size} color={color} />;
    case 'hockey':
      return <MaterialCommunityIcons name="hockey-sticks" size={size} color={color} />;
    default:
      return <MaterialCommunityIcons name="soccer-field" size={size} color={color} />;
  }
}

function venueIcon(venueType: string | null, color: string, size = 14): ReactNode {
  switch (venueType) {
    case 'gymnasium':
      return <MaterialCommunityIcons name="basketball-hoop-outline" size={size} color={color} />;
    case 'arena':
      return <MaterialCommunityIcons name="hockey-puck" size={size} color={color} />;
    default:
      return <MaterialCommunityIcons name="soccer-field" size={size} color={color} />;
  }
}

function FieldsScreen({ t, s }: { t: Theme; s: Styles }) {
  const { tr, trCount } = useLang();
  const [regions, setRegions] = useState<string[]>([]);
  const [region, setRegion] = useState<string | null>(null); // null = toutes
  const [sport, setSport] = useState<string | null>(null);   // null = tous
  const [query, setQuery] = useState('');
  const [fields, setFields] = useState<Field[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const reqId = useRef(0);

  // Region chips (loaded once).
  useEffect(() => {
    listRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  // Search whenever the region / sport filter or the (debounced) query changes.
  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const h = setTimeout(() => {
      searchFields({ region, sport, q: query.trim() || null })
        .then((res) => {
          if (id !== reqId.current) return;
          setFields(res);
        })
        .catch((e) => {
          if (id !== reqId.current) return;
          setFields([]);
          setError(e instanceof ApiError ? e.message : tr('unexpectedError'));
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    }, 200);
    return () => clearTimeout(h);
  }, [region, sport, query]);

  return (
    <View style={{ gap: spacing.md }}>
      {/* Search box */}
      <View style={s.fieldSearchBar}>
        <Ionicons name="search" size={20} color={t.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tr('searchFieldPh')}
          placeholderTextColor={t.muted}
          style={s.fieldSearchInput}
          returnKeyType="search"
        />
        {query !== '' && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={t.muted} />
          </Pressable>
        )}
      </View>

      {/* Region filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      >
        <RegionChip t={t} s={s} label={tr('all_f')} active={region === null} onPress={() => setRegion(null)} />
        {regions.map((r) => (
          <RegionChip key={r} t={t} s={s} label={r} active={region === r} onPress={() => setRegion(r)} />
        ))}
      </ScrollView>

      {/* Sport filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      >
        <RegionChip t={t} s={s} label={tr('allSports')} active={sport === null} onPress={() => setSport(null)} />
        {SPORTS.map((sp) => (
          <Pressable
            key={sp.key}
            onPress={() => setSport(sport === sp.key ? null : sp.key)}
            style={[
              s.sportChip,
              sport === sp.key && { backgroundColor: t.secondary, borderColor: t.secondary },
            ]}
          >
            {sportIcon(sp.key, sport === sp.key ? t.onSecondary : t.primary, 16)}
            <Text style={[s.regionChipText, sport === sp.key && { color: t.onSecondary }]}>{sp.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Results */}
      {loading ? (
        <ActivityIndicator color={t.primary} style={{ marginTop: spacing.xl }} />
      ) : error ? (
        <View style={s.stub}>
          <Ionicons name="cloud-offline-outline" size={38} color={t.muted} />
          <Text style={s.placeholderSub}>{error}</Text>
        </View>
      ) : fields && fields.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.fieldCount}>
            {trCount(fields.length, 'wordField')}
            {region ? ` · ${region}` : ''}
            {sport ? ` · ${SPORTS.find((x) => x.key === sport)?.label ?? sport}` : ''}
          </Text>
          {fields.map((f) => (
            <Pressable
              key={f.id}
              style={({ pressed }) => [s.fieldCard, pressed && { opacity: 0.7 }]}
              onPress={() => setSelectedField(f)}
            >
              <View style={s.fieldIcon}>{sportIcon(f.sport_type ?? f.sports[0]?.key ?? null, t.onPrimary)}</View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldName} numberOfLines={1}>{f.name}</Text>
                <Text style={s.fieldMeta} numberOfLines={1}>
                  {[f.city, f.region].filter(Boolean).join(' · ') || tr('regionUnknown')}
                </Text>
                <View style={s.fieldVenueRow}>
                  {venueIcon(f.venue_type, t.muted)}
                  <Text style={s.fieldAddress} numberOfLines={1}>
                    {f.surface_label ?? f.venue_type_label ?? tr('fieldFallback')}
                  </Text>
                </View>
                {f.sports.length > 0 && (
                  <View style={s.sportTagRow}>
                    {f.sports.map((sp) => (
                      <View key={sp.key} style={s.sportTag}>
                        {sportIcon(sp.key, t.secondary, 13)}
                        <Text style={s.sportTagText}>{sp.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              {f.distance_m != null && (
                <View style={s.fieldDist}>
                  <Ionicons name="navigate" size={12} color={t.secondary} />
                  <Text style={s.fieldDistText}>
                    {f.distance_m >= 1000
                      ? `${(f.distance_m / 1000).toFixed(1)} km`
                      : `${Math.round(f.distance_m)} m`}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={s.stub}>
          <MaterialCommunityIcons name="soccer-field" size={42} color={t.muted} />
          <Text style={s.stubTitle}>{tr('noField')}</Text>
          <Text style={s.placeholderSub}>
            {query || region || sport ? tr('noFieldHint') : tr('noFieldRegistered')}
          </Text>
        </View>
      )}

      <FieldDetailModal t={t} s={s} field={selectedField} onClose={() => setSelectedField(null)} />
    </View>
  );
}

function RegionChip({
  t,
  s,
  label,
  active,
  onPress,
}: {
  t: Theme;
  s: Styles;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.regionChip, active && { backgroundColor: t.secondary, borderColor: t.secondary }]}
    >
      <Text style={[s.regionChipText, active && { color: t.onSecondary }]}>{label}</Text>
    </Pressable>
  );
}

// ---------- Calendrier tab : nearby matches schedule ("cédule") ----------

const RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100];
const WEEKDAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtTime(d: Date, lang: Lang): string {
  const mm = String(d.getMinutes()).padStart(2, '0');
  return lang === 'fr' ? `${d.getHours()}h${mm}` : `${d.getHours()}:${mm}`;
}
function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(d: Date, lang: Lang): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (dayKey(d) === dayKey(today)) return lang === 'fr' ? "Aujourd'hui" : 'Today';
  if (dayKey(d) === dayKey(tomorrow)) return lang === 'fr' ? 'Demain' : 'Tomorrow';
  const wd = (lang === 'fr' ? WEEKDAYS_FR : WEEKDAYS_EN)[d.getDay()];
  const mo = (lang === 'fr' ? MONTHS_FR : MONTHS_EN)[d.getMonth()];
  const cap = `${wd.charAt(0).toUpperCase()}${wd.slice(1)}`;
  return lang === 'fr' ? `${cap} ${d.getDate()} ${mo}` : `${cap}, ${mo} ${d.getDate()}`;
}
function groupMatchesByDay(matches: Match[], lang: Lang): { key: string; label: string; matches: Match[] }[] {
  const groups: { key: string; label: string; matches: Match[] }[] = [];
  for (const m of matches) {
    if (!m.starts_at) continue;
    const d = new Date(m.starts_at);
    const k = dayKey(d);
    let group = groups.find((g) => g.key === k);
    if (!group) {
      group = { key: k, label: dayLabel(d, lang), matches: [] };
      groups.push(group);
    }
    group.matches.push(m);
  }
  return groups;
}

function ScheduleScreen({
  t,
  s,
  coords,
  phase,
}: {
  t: Theme;
  s: Styles;
  coords: { lat: number; lng: number } | null;
  phase: Phase;
}) {
  const { tr, lang } = useLang();
  const [radiusKm, setRadiusKm] = useState(25);
  const [sport, setSport] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (!coords) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    nearbyMatches(coords.lat, coords.lng, radiusKm * 1000, sport)
      .then((res) => {
        if (id === reqId.current) setMatches(res);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setMatches([]);
        setError(e instanceof ApiError ? e.message : tr('unexpectedError'));
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [coords, radiusKm, sport, tr]);

  const groups = useMemo(() => groupMatchesByDay(matches ?? [], lang), [matches, lang]);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={s.radiusLabel}>{tr('maxRadius')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      >
        {RADIUS_OPTIONS_KM.map((r) => (
          <RegionChip key={r} t={t} s={s} label={`${r} km`} active={radiusKm === r} onPress={() => setRadiusKm(r)} />
        ))}
      </ScrollView>

      <Text style={s.radiusLabel}>{tr('sport')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      >
        <RegionChip t={t} s={s} label={tr('all_m')} active={sport === null} onPress={() => setSport(null)} />
        {SPORTS.map((sp) => (
          <Pressable
            key={sp.key}
            onPress={() => setSport(sport === sp.key ? null : sp.key)}
            style={[s.sportChip, sport === sp.key && { backgroundColor: t.secondary, borderColor: t.secondary }]}
          >
            {sportIcon(sp.key, sport === sp.key ? t.onSecondary : t.primary, 16)}
            <Text style={[s.regionChipText, sport === sp.key && { color: t.onSecondary }]}>{sp.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!coords ? (
        <View style={s.stub}>
          <Ionicons name="location-outline" size={38} color={t.muted} />
          <Text style={s.placeholderSub}>
            {phase === 'error' ? tr('locationUnavailable') : tr('locating')}
          </Text>
        </View>
      ) : loading ? (
        <ActivityIndicator color={t.primary} style={{ marginTop: spacing.xl }} />
      ) : error ? (
        <View style={s.stub}>
          <Ionicons name="cloud-offline-outline" size={38} color={t.muted} />
          <Text style={s.placeholderSub}>{error}</Text>
        </View>
      ) : groups.length > 0 ? (
        <View style={{ gap: spacing.lg }}>
          {groups.map((g) => (
            <View key={g.key} style={{ gap: spacing.sm }}>
              <Text style={s.dayHeader}>{g.label}</Text>
                  {g.matches.map((m) => (
                    <MatchRow key={m.id} t={t} s={s} m={m} onOpenField={(f) => (f ? setSelectedField(f) : null)} />
                  ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={s.stub}>
          <Ionicons name="calendar-outline" size={42} color={t.muted} />
          <Text style={s.stubTitle}>{tr('noMatch')}</Text>
          <Text style={s.placeholderSub}>
            {tr('noMatchWithin', { n: radiusKm })}
            {sport ? ` · ${SPORTS.find((x) => x.key === sport)?.label ?? sport}` : ''}
          </Text>
        </View>
      )}

      <FieldDetailModal t={t} s={s} field={selectedField} onClose={() => setSelectedField(null)} />
    </View>
  );
}

function MatchRow({ t, s, m, onOpenField }: { t: Theme; s: Styles; m: Match; onOpenField?: (f: Field | null) => void }) {
  const { tr, lang } = useLang();
  const d = m.starts_at ? new Date(m.starts_at) : null;
  const dist = m.field?.distance_m ?? null;
  const badge = [m.sport_label, m.home_team?.category].filter(Boolean).join(' · ');
  return (
    <View style={s.matchRow}>
      <View style={s.matchTimeCol}>
        {sportIcon(m.sport, t.primary, 18)}
        <Text style={s.matchTimeText}>{d ? fmtTime(d, lang) : '--'}</Text>
        {m.status === 'live' && (
          <View style={s.liveBadge}>
            <Text style={s.liveBadgeText}>LIVE</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.matchTeams} numberOfLines={1}>
          {m.home_team?.name ?? '?'} <Text style={s.vsSmall}>vs</Text> {m.away_team?.name ?? '?'}
        </Text>
        {!!badge && <Text style={s.matchSport} numberOfLines={1}>{badge}</Text>}
        <View style={s.matchFieldRow}>
          <Ionicons name="location-sharp" size={12} color={t.muted} />
          <Pressable onPress={() => onOpenField?.(m.field ?? null)} style={{ flex: 1 }}>
            <Text style={s.matchField} numberOfLines={1}>
              {m.field?.name ?? tr('unknownField')}
              {dist != null ? ` · ${fmtDist(dist)}` : ''}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ---------- Alignements tab : teams (lineups) by region + sport ----------

function AlignementsScreen({ t, s }: { t: Theme; s: Styles }) {
  const { tr, trCount } = useLang();
  const [regions, setRegions] = useState<string[]>([]);
  const [region, setRegion] = useState<string | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Team | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Player zoom popup — owned here so it stacks ABOVE the roster sheet.
  const [zoomHit, setZoomHit] = useState<PlayerHit | null>(null);
  const [zoomProfile, setZoomProfile] = useState<PlayerProfile | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);

  const openZoom = useCallback((hit: PlayerHit) => {
    setZoomHit(hit);
    setZoomProfile(null);
    setZoomLoading(true);
    getPlayer(hit.player_id)
      .then(setZoomProfile)
      .catch(() => setZoomProfile(null))
      .finally(() => setZoomLoading(false));
  }, []);

  useEffect(() => {
    listRegions().then(setRegions).catch(() => setRegions([]));
  }, []);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const h = setTimeout(() => {
      searchTeams({ region, sport })
        .then((res) => {
          if (id === reqId.current) setTeams(res);
        })
        .catch((e) => {
          if (id !== reqId.current) return;
          setTeams([]);
          setError(e instanceof ApiError ? e.message : tr('unexpectedError'));
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    }, 150);
    return () => clearTimeout(h);
  }, [region, sport, tr]);

  const openRoster = useCallback((team: Team) => {
    setSelectedTeam(team);
    setRoster(null);
    setRosterLoading(true);
    getTeam(team.id)
      .then(setRoster)
      .catch(() => setRoster(null))
      .finally(() => setRosterLoading(false));
  }, []);

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={s.radiusLabel}>{tr('region')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
        <RegionChip t={t} s={s} label={tr('all_f')} active={region === null} onPress={() => setRegion(null)} />
        {regions.map((r) => (
          <RegionChip key={r} t={t} s={s} label={r} active={region === r} onPress={() => setRegion(r)} />
        ))}
      </ScrollView>

      <Text style={s.radiusLabel}>{tr('sport')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
        <RegionChip t={t} s={s} label={tr('all_m')} active={sport === null} onPress={() => setSport(null)} />
        {SPORTS.map((sp) => (
          <Pressable
            key={sp.key}
            onPress={() => setSport(sport === sp.key ? null : sp.key)}
            style={[s.sportChip, sport === sp.key && { backgroundColor: t.secondary, borderColor: t.secondary }]}
          >
            {sportIcon(sp.key, sport === sp.key ? t.onSecondary : t.primary, 16)}
            <Text style={[s.regionChipText, sport === sp.key && { color: t.onSecondary }]}>{sp.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={t.primary} style={{ marginTop: spacing.xl }} />
      ) : error ? (
        <View style={s.stub}>
          <Ionicons name="cloud-offline-outline" size={38} color={t.muted} />
          <Text style={s.placeholderSub}>{error}</Text>
        </View>
      ) : teams && teams.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={s.fieldCount}>{trCount(teams.length, 'wordLineup')}</Text>
          {teams.map((team) => (
            <Pressable
              key={team.id}
              style={({ pressed }) => [s.fieldCard, pressed && { opacity: 0.7 }]}
              onPress={() => openRoster(team)}
            >
              <View style={[s.crest, { backgroundColor: team.color_primary ?? t.secondary }]}>
                <Text style={s.crestText}>{initials(team.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldName} numberOfLines={1}>{team.name}</Text>
                <Text style={s.fieldMeta} numberOfLines={1}>
                  {[team.sport_label, team.category].filter(Boolean).join(' · ') || tr('teamFallback')}
                </Text>
                <Text style={s.fieldAddress}>{trCount(team.players_count ?? 0, 'wordPlayer')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={t.muted} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={s.stub}>
          <Ionicons name="people-outline" size={42} color={t.muted} />
          <Text style={s.stubTitle}>{tr('noLineup')}</Text>
          <Text style={s.placeholderSub}>{tr('noLineupHint')}</Text>
        </View>
      )}

      <RosterModal
        t={t}
        s={s}
        team={selectedTeam}
        roster={roster}
        loading={rosterLoading}
        onClose={() => setSelectedTeam(null)}
        onPlayer={(p) => {
          // Keep the roster sheet open underneath so the user can pick another
          // player after closing the zoom popup.
          if (selectedTeam) {
            openZoom({
              player_id: p.id,
              full_name: p.full_name,
              jersey_number: p.jersey_number,
              position: p.position,
              team: selectedTeam.name,
              team_id: selectedTeam.id,
              photo_path: p.photo_path,
            });
          }
        }}
      />

      {/* Declared AFTER the roster modal → renders on top of it. */}
      <PlayerDetailModal
        t={t}
        s={s}
        hit={zoomHit}
        profile={zoomProfile}
        loading={zoomLoading}
        onClose={() => setZoomHit(null)}
      />
    </View>
  );
}

function FieldDetailModal({ t, s, field, onClose }: { t: Theme; s: Styles; field: Field | null; onClose: () => void }) {
  const { tr } = useLang();
  if (!field) return null;
  return (
    <Modal visible={!!field} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={[s.modalSheet, { maxHeight: '85%' }]}>
          <View style={s.modalHandle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={[s.crest, { backgroundColor: t.secondary }]}>
              <Text style={s.crestText}>{initials(field.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle} numberOfLines={2}>{field.name}</Text>
              <Text style={s.placeholderSub}>{[field.city, field.region].filter(Boolean).join(' · ')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={t.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
            {field.photos && field.photos.length > 0 && (
              <Image source={{ uri: field.photos[0] }} style={{ width: '100%', height: 180, borderRadius: 8 }} />
            )}

            <View style={{ paddingTop: spacing.md, gap: spacing.sm }}>
              {field.address ? (
                <View style={s.fieldDetailRow}>
                  <Ionicons name="location-sharp" size={16} color={t.secondary} />
                  <Text style={s.fieldDetailText}>{field.address}</Text>
                </View>
              ) : null}
              {field.venue_type_label ? (
                <View style={s.fieldDetailRow}>
                  <MaterialCommunityIcons name="soccer-field" size={16} color={t.secondary} />
                  <Text style={s.fieldDetailText}>{field.venue_type_label}</Text>
                </View>
              ) : null}
              {field.surface_label ? (
                <View style={s.fieldDetailRow}>
                  <MaterialCommunityIcons name="grass" size={16} color={t.secondary} />
                  <Text style={s.fieldDetailText}>{field.surface_label}</Text>
                </View>
              ) : null}
            </View>

            <View style={{ paddingTop: spacing.md }}>
              <Text style={s.sectionTitle}>{tr('description') ?? 'Description'}</Text>
              <Text style={{ marginTop: spacing.sm, color: t.text }}>{field.description ?? '—'}</Text>
            </View>

            {field.photos && field.photos.length > 1 && (
              <View style={{ marginTop: spacing.md, flexDirection: 'row', gap: spacing.sm }}>
                {field.photos.slice(1).map((p, i) => (
                  <Image key={i} source={{ uri: p }} style={{ width: 120, height: 80, borderRadius: 6 }} />
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RosterModal({
  t,
  s,
  team,
  roster,
  loading,
  onClose,
  onPlayer,
}: {
  t: Theme;
  s: Styles;
  team: Team | null;
  roster: Team | null;
  loading: boolean;
  onClose: () => void;
  onPlayer: (p: RosterPlayer) => void;
}) {
  const { trCount } = useLang();
  const players = roster?.players ?? [];
  return (
    <Modal visible={!!team} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={[s.modalSheet, { maxHeight: '85%' }]}>
          <View style={s.modalHandle} />
          <View style={s.rosterHeader}>
            <View style={[s.crest, { backgroundColor: team?.color_primary ?? t.secondary }]}>
              <Text style={s.crestText}>{initials(team?.name ?? '?')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle} numberOfLines={1}>{team?.name ?? ''}</Text>
              <Text style={s.placeholderSub}>
                {[team?.sport_label, team?.category].filter(Boolean).join(' · ')} · {trCount(players.length, 'wordPlayer')}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={t.muted} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={t.primary} style={{ marginVertical: spacing.lg }} />
          ) : (
            <ScrollView style={{ marginTop: spacing.sm }} contentContainerStyle={{ paddingBottom: spacing.md }}>
              {players.map((p) => (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [s.rosterRow, pressed && { opacity: 0.7 }]}
                  onPress={() => onPlayer(p)}
                >
                  <View style={[s.rosterNum, { backgroundColor: t.secondary }]}>
                    <Text style={s.rosterNumText}>{p.jersey_number ?? '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rosterName} numberOfLines={1}>{p.full_name ?? '—'}</Text>
                    {!!p.position && <Text style={s.rosterPos} numberOfLines={1}>{p.position}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.muted} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StubScreen({ t, s, label }: { t: Theme; s: Styles; label: string }) {
  const { tr } = useLang();
  return (
    <View style={s.stub}>
      <MaterialCommunityIcons name="hammer-wrench" size={42} color={t.muted} />
      <Text style={s.stubTitle}>{label}</Text>
      <Text style={s.placeholderSub}>{tr('comingSoon')}</Text>
    </View>
  );
}

function ProfileModal({
  visible,
  onClose,
  onDemo,
}: {
  visible: boolean;
  onClose: () => void;
  onDemo: () => void;
}) {
  const { theme: t, palette, setPrimary, setSecondary, reset } = useTheme();
  const { tr, lang, setLang } = useLang();
  const s = useMemo(() => makeStyles(t), [t]);

  const langs: { key: Lang; label: string }[] = [
    { key: 'fr', label: 'Français' },
    { key: 'en', label: 'English' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />

          {/* Language switch */}
          <Text style={s.swatchLabel}>{tr('language')}</Text>
          <View style={s.langRow}>
            {langs.map((l) => {
              const active = lang === l.key;
              return (
                <Pressable
                  key={l.key}
                  onPress={() => setLang(l.key)}
                  style={[s.langBtn, active && { backgroundColor: t.primary, borderColor: t.primary }]}
                >
                  <Text style={[s.langBtnText, { color: active ? t.onPrimary : t.text }]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[s.modalTitle, { marginTop: spacing.lg }]}>{tr('teamColors')}</Text>
          <Text style={s.placeholderSub}>{tr('teamColorsSub')}</Text>

          {/* Live preview */}
          <View style={[s.preview, { backgroundColor: t.primary }]}>
            <Text style={[s.previewText, { color: t.onPrimary }]}>
              Who<Text style={{ color: t.secondary }}>Plays</Text>
            </Text>
            <View style={[s.previewChip, { backgroundColor: t.secondary }]}>
              <Text style={{ color: t.onSecondary, fontWeight: '800', fontSize: 12 }}>87</Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 320 }}>
            <Text style={s.swatchLabel}>{tr('primaryColor')}</Text>
            <SwatchGrid current={palette.primary} onSelect={setPrimary} />
            <Text style={s.swatchLabel}>{tr('secondaryColor')}</Text>
            <SwatchGrid current={palette.secondary} onSelect={setSecondary} />
          </ScrollView>

          <View style={s.modalActions}>
            <Pressable onPress={reset} style={[s.modalBtn, s.modalBtnGhost]}>
              <Text style={[s.modalBtnText, { color: t.primary }]}>{tr('reset')}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[s.modalBtn, { backgroundColor: t.primary }]}>
              <Text style={[s.modalBtnText, { color: t.onPrimary }]}>{tr('close')}</Text>
            </Pressable>
          </View>

          {__DEV__ && (
            <Pressable onPress={onDemo} style={{ marginTop: spacing.md, alignItems: 'center' }}>
              <Text style={{ color: t.muted, fontSize: 13 }}>{tr('loadDemoField')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SwatchGrid({ current, onSelect }: { current: string; onSelect: (hex: string) => void }) {
  const { theme: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={s.swatchGrid}>
      {SWATCHES.map((hex) => {
        const selected = hex.toLowerCase() === current.toLowerCase();
        return (
          <Pressable
            key={hex}
            onPress={() => onSelect(hex)}
            style={[
              s.swatch,
              { backgroundColor: hex },
              selected && { borderColor: t.text, borderWidth: 3 },
            ]}
          >
            {selected && (
              <Ionicons name="checkmark" size={18} color={hex === '#FFFFFF' ? '#000' : '#fff'} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Player zoom popup ----------

function initials(name?: string | null): string {
  return (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn % 12);
  return `${ft}'${inch}"`;
}

function PlayerDetailModal({
  t,
  s,
  hit,
  profile,
  loading,
  onClose,
}: {
  t: Theme;
  s: Styles;
  hit: PlayerHit | null;
  profile: PlayerProfile | null;
  loading: boolean;
  onClose: () => void;
}) {
  const { tr } = useLang();
  // Prefer the tapped context (hit) for the badge/team, profile for the rest.
  const number = hit?.jersey_number ?? profile?.jersey_number ?? null;
  const name = hit?.full_name ?? profile?.full_name ?? '—';
  const position = hit?.position ?? profile?.position ?? '';
  const team = hit?.team ?? profile?.team ?? '';
  const photo = profile?.photo_path ?? hit?.photo_path ?? null;

  const val = (v: string | number | null | undefined) =>
    v === null || v === undefined || v === '' ? '—' : String(v);

  const dob = profile?.birthdate
    ? `${profile.birthdate}${profile.age != null ? ` (${tr('yearsOld', { n: profile.age })})` : ''}`
    : '—';
  const numbers = profile?.numbers?.length
    ? profile.numbers.join(', ')
    : number != null
    ? String(number)
    : '—';

  return (
    <Modal visible={!!hit} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.zoomBackdrop} onPress={onClose}>
        <Pressable style={s.zoomCard} onPress={() => {}}>
          <Pressable style={s.zoomClose} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={18} color={t.onPrimary} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <View style={s.zoomHeader}>
              <View style={s.zoomAvatarWrap}>
                {photo ? (
                  <Image source={{ uri: photo }} style={s.zoomAvatar} />
                ) : (
                  <View style={[s.zoomAvatar, s.zoomAvatarFallback]}>
                    <Text style={s.zoomInitials}>{initials(name)}</Text>
                  </View>
                )}
                {number != null && (
                  <View style={s.zoomBadge}>
                    <Text style={s.zoomBadgeText}>{number}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.zoomName}>{name}</Text>
                {!!position && <Text style={s.zoomPosition}>{position}</Text>}
                {!!team && <Text style={s.zoomTeam}>{team}</Text>}
              </View>
            </View>

            <View style={s.zoomStats}>
              <StatItem s={s} label={tr('number')} value={val(number)} />
              <StatItem s={s} label={tr('age')} value={val(profile?.age)} />
              <StatItem s={s} label={tr('year')} value={val(profile?.school_year)} />
            </View>

            {loading && <ActivityIndicator color={t.primary} style={{ marginVertical: spacing.md }} />}

            <Section t={t} s={s} title={tr('measurements')}>
              <View style={s.infoRow}>
                <InfoItem t={t} s={s} flex icon={<MaterialCommunityIcons name="ruler" size={20} color={t.primary} />}
                  label={tr('height')}
                  value={profile?.height_cm != null ? `${profile.height_cm} cm` : '—'}
                  sub={profile?.height_cm != null ? cmToFtIn(profile.height_cm) : undefined} />
                <InfoItem t={t} s={s} flex icon={<MaterialCommunityIcons name="weight-kilogram" size={20} color={t.primary} />}
                  label={tr('weight')}
                  value={profile?.weight_kg != null ? `${profile.weight_kg} kg` : '—'}
                  sub={profile?.weight_kg != null ? `${Math.round(profile.weight_kg * 2.20462)} lb` : undefined} />
              </View>
            </Section>

            <Section t={t} s={s} title={tr('academicInfo')}>
              <InfoItem t={t} s={s} icon={<MaterialCommunityIcons name="book-open-variant" size={20} color={t.primary} />}
                label={tr('discipline')} value={val(profile?.discipline)} />
            </Section>

            <Section t={t} s={s} title={tr('otherInfo')}>
              <View style={s.infoGrid}>
                <InfoItem t={t} s={s} half icon={<MaterialCommunityIcons name="tshirt-crew-outline" size={20} color={t.primary} />}
                  label={tr('jerseyNumbers')} value={numbers} />
                <InfoItem t={t} s={s} half icon={<Ionicons name="calendar-outline" size={19} color={t.primary} />}
                  label={tr('birthdate')} value={dob} />
                <InfoItem t={t} s={s} half icon={<Ionicons name="home-outline" size={19} color={t.primary} />}
                  label={tr('hometown')} value={val(profile?.hometown)} />
              </View>
            </Section>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StatItem({ s, label, value }: { s: Styles; label: string; value: string }) {
  return (
    <View style={s.statItem}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Section({ t, s, title, children }: { t: Theme; s: Styles; title: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionLine} />
      {children}
    </View>
  );
}

function InfoItem({
  s,
  icon,
  label,
  value,
  sub,
  flex,
  half,
}: {
  t: Theme;
  s: Styles;
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  flex?: boolean;
  half?: boolean;
}) {
  return (
    <View style={[s.infoItem, flex && { flex: 1 }, half && { width: '48%' }]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel} numberOfLines={1}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
        {!!sub && <Text style={s.infoSub}>{sub}</Text>}
      </View>
    </View>
  );
}

// ---------- Styles (derived from the two team colors) ----------

type Styles = ReturnType<typeof makeStyles>;

function makeStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.screenBg },

    topPanel: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    topSide: { width: 36, justifyContent: 'center' },
    logo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    logoText: { fontSize: 22, fontWeight: '900' },
    logoIo: { fontSize: 12, fontWeight: '700' },
    teamsBtn: { alignItems: 'center' },
    teamsLabel: { color: t.secondary, fontSize: 10, fontWeight: '700', marginTop: 2 },

    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
    titleLine: { flex: 1, height: 1, backgroundColor: t.divider },
    title: { color: t.onPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 1, opacity: 0.95 },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: '#FFFFFF',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 52,
      marginTop: spacing.lg,
    },
    searchText: { flex: 1, color: t.text, fontSize: 18, fontWeight: '700' },
    searchPlaceholder: { color: t.muted, fontWeight: '500' },

    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
    locationText: { color: t.onPrimary, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    changeText: { color: t.secondary, fontSize: 14, fontWeight: '700' },

    // ---- Matchup banner (active match) ----
    matchup: {
      marginTop: spacing.md, paddingTop: spacing.md,
      borderTopWidth: 1, borderTopColor: t.divider, alignItems: 'center', gap: spacing.sm,
    },
    matchupRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
    matchTeam: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    crest: {
      width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: t.secondary, overflow: 'hidden',
    },
    crestImg: { width: 42, height: 42, borderRadius: 21 },
    crestText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
    crestSelected: { borderColor: t.onPrimary, borderWidth: 3 },
    crestCheck: {
      position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8,
      backgroundColor: t.secondary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: t.primary,
    },
    matchupHint: { color: t.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    teamName: { flex: 1, color: t.onPrimary, fontSize: 14, fontWeight: '800' },
    vsWrap: { paddingHorizontal: spacing.sm },
    vsText: { color: t.secondary, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    catBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1, borderColor: t.secondary, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: 3,
    },
    catBadgeText: { color: t.secondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

    body: { padding: spacing.lg, paddingBottom: spacing.xl },

    keypad: { gap: spacing.md },
    keyRow: { flexDirection: 'row', gap: spacing.md },
    key: { flex: 1, height: 66, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    keyPlain: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.cardBorder },
    keyNum: { fontSize: 30, fontWeight: '700', color: t.primary },
    keySearch: { backgroundColor: t.secondary, gap: 2 },
    keySearchLabel: { fontSize: 12, fontWeight: '800' },

    placeholder: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: t.placeholderBg,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    placeholderIcon: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center',
    },
    placeholderTitle: { color: t.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
    placeholderSub: { color: t.muted, fontSize: 13, marginTop: 2 },

    foundCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: t.placeholderBg, borderRadius: radius.lg, padding: spacing.md,
    },
    foundName: { color: t.text, fontSize: 18, fontWeight: '800' },
    foundMeta: { color: t.muted, fontSize: 13, marginTop: 2 },
    foundBadge: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: t.secondary,
      alignItems: 'center', justifyContent: 'center',
    },
    foundBadgeText: { color: t.onSecondary, fontSize: 16, fontWeight: '900' },

    recentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    recentsTitle: { color: t.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },
    seeAll: { color: t.secondary, fontSize: 13, fontWeight: '700' },
    recentCard: { width: 92, alignItems: 'center' },
    recentName: { color: t.text, fontSize: 13, fontWeight: '800', marginTop: 6 },
    recentPos: { color: t.muted, fontSize: 11 },
    recentTeam: { color: t.secondary, fontSize: 11, fontWeight: '600' },

    avatarWrap: { backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },
    avatarInitials: { color: t.onPrimary, fontWeight: '800' },
    avatarBadge: {
      position: 'absolute', top: -2, right: -2, minWidth: 22, height: 22, borderRadius: 11,
      backgroundColor: t.secondary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: t.screenBg, paddingHorizontal: 3,
    },
    avatarBadgeText: { color: t.onSecondary, fontSize: 11, fontWeight: '900' },

    tabBar: { flexDirection: 'row', backgroundColor: t.primary, paddingTop: spacing.sm, paddingBottom: 4 },
    tabItem: { flex: 1, alignItems: 'center', gap: 3 },
    tabActive: { backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
    tabIcon: { alignItems: 'center', justifyContent: 'center' },
    tabLabel: { fontSize: 9, fontWeight: '700' },

    stub: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl * 2 },
    stubTitle: { color: t.text, fontSize: 20, fontWeight: '800' },

    // ---- Terrain tab ----
    fieldSearchBar: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: '#FFFFFF', borderRadius: radius.md, borderWidth: 1, borderColor: t.cardBorder,
      paddingHorizontal: spacing.md, height: 50,
    },
    fieldSearchInput: { flex: 1, color: t.text, fontSize: 16, fontWeight: '600', paddingVertical: 0 },
    regionChip: {
      paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
      backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.cardBorder,
    },
    regionChipText: { color: t.text, fontSize: 13, fontWeight: '700' },
    sportChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
      backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.cardBorder,
    },
    fieldCount: { color: t.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },
    fieldCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: t.placeholderBg, borderRadius: radius.lg, padding: spacing.md,
    },
    fieldIcon: {
      width: 46, height: 46, borderRadius: 23, backgroundColor: t.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    fieldName: { color: t.text, fontSize: 16, fontWeight: '800' },
    fieldMeta: { color: t.secondary, fontSize: 13, fontWeight: '600', marginTop: 2 },
    fieldVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    fieldAddress: { color: t.muted, fontSize: 12 },
    sportTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    sportTag: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: t.screenBg, borderRadius: radius.sm,
      paddingHorizontal: 7, paddingVertical: 3,
    },
    sportTagText: { color: t.secondary, fontSize: 11, fontWeight: '700' },
    fieldDist: { alignItems: 'center', flexDirection: 'row', gap: 3 },
    fieldDistText: { color: t.secondary, fontSize: 12, fontWeight: '700' },

    // ---- Calendrier / cédule ----
    radiusLabel: { color: t.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
    dayHeader: {
      color: t.text, fontSize: 14, fontWeight: '900', letterSpacing: 0.5,
      textTransform: 'uppercase', marginTop: spacing.sm,
    },
    matchRow: {
      flexDirection: 'row', gap: spacing.md, alignItems: 'center',
      backgroundColor: t.placeholderBg, borderRadius: radius.lg, padding: spacing.md,
    },
    matchTimeCol: { alignItems: 'center', width: 58, gap: 3 },
    matchTimeText: { color: t.text, fontSize: 15, fontWeight: '900' },
    liveBadge: { backgroundColor: '#E11D48', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
    liveBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    matchTeams: { color: t.text, fontSize: 16, fontWeight: '800' },
    vsSmall: { color: t.muted, fontSize: 12, fontWeight: '700' },
    matchSport: { color: t.secondary, fontSize: 12, fontWeight: '700', marginTop: 2 },
    matchFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    matchField: { color: t.muted, fontSize: 12, flexShrink: 1 },

    // ---- Alignements / roster ----
    rosterHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    rosterRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: t.cardBorder,
    },
    rosterNum: {
      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    },
    rosterNumText: { color: t.onSecondary, fontSize: 16, fontWeight: '900' },
    rosterName: { color: t.text, fontSize: 16, fontWeight: '800' },
    rosterPos: { color: t.muted, fontSize: 13, marginTop: 1 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: '#FFFFFF', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
      padding: spacing.lg, paddingBottom: spacing.xl,
    },
    modalHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D5D5CE', marginBottom: spacing.md },
    modalTitle: { color: t.text, fontSize: 20, fontWeight: '900' },
    preview: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.md,
    },
    previewText: { fontSize: 18, fontWeight: '900', color: t.text },
    previewChip: { marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    swatchLabel: { color: t.text, fontSize: 14, fontWeight: '800', marginTop: spacing.md, marginBottom: spacing.sm },
    swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch: {
      width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: '#0002',
      alignItems: 'center', justifyContent: 'center',
    },
    langRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    langBtn: {
      flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md,
      backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.cardBorder,
    },
    langBtnText: { fontSize: 15, fontWeight: '800' },
    modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    modalBtn: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
    modalBtnGhost: { backgroundColor: '#EEEEE8' },
    modalBtnText: { fontSize: 16, fontWeight: '800' },

    // ---- Player zoom popup ----
    zoomBackdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
    },
    zoomCard: {
      width: '100%', maxWidth: 420, maxHeight: '88%',
      backgroundColor: '#FFFFFF', borderRadius: radius.lg, padding: spacing.lg,
    },
    zoomClose: {
      position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 2,
      width: 30, height: 30, borderRadius: 15, backgroundColor: t.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    zoomHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: 34 },
    zoomAvatarWrap: { width: 84, height: 84 },
    zoomAvatar: { width: 84, height: 84, borderRadius: 42 },
    zoomAvatarFallback: { backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },
    zoomInitials: { color: t.onPrimary, fontSize: 30, fontWeight: '800' },
    zoomBadge: {
      position: 'absolute', top: -4, right: -4, minWidth: 30, height: 30, borderRadius: 15,
      backgroundColor: t.secondary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#FFFFFF', paddingHorizontal: 4,
    },
    zoomBadgeText: { color: t.onSecondary, fontSize: 14, fontWeight: '900' },
    zoomName: { color: t.text, fontSize: 22, fontWeight: '900' },
    zoomPosition: { color: t.muted, fontSize: 14, marginTop: 2 },
    zoomTeam: { color: t.secondary, fontSize: 14, fontWeight: '700', marginTop: 2 },

    zoomStats: {
      flexDirection: 'row', marginTop: spacing.lg, paddingVertical: spacing.md,
      borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.cardBorder,
    },
    statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
    statLabel: { color: t.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    statValue: { color: t.text, fontSize: 14, fontWeight: '800', marginTop: 3, textAlign: 'center' },

    section: { marginTop: spacing.lg },
    sectionTitle: { color: t.secondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
    sectionLine: { height: 1, backgroundColor: t.cardBorder, marginTop: 6, marginBottom: spacing.md },

    infoRow: { flexDirection: 'row', gap: spacing.md },
    infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, rowGap: spacing.lg },
    infoItem: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    infoLabel: { color: t.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
    infoValue: { color: t.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
    infoSub: { color: t.muted, fontSize: 12, marginTop: 1 },
    fieldDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    fieldDetailText: { color: t.text, fontSize: 13, lineHeight: 18 },
  });
}
