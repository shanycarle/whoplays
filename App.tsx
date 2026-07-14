import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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
import { SWATCHES, spacing, radius, withAlpha, type Theme } from './src/theme';
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
  // A match picked from the Calendrier tab overrides the geo-detected active match.
  const [overrideMatch, setOverrideMatch] = useState<Match | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [installPromptVisible, setInstallPromptVisible] = useState(false);
  const installPromptRef = useRef<any>(null);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  // Terrain the user explicitly picked from the header dropdown (overrides geo).
  const [manualField, setManualField] = useState<Field | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
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
    setManualField(null);
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

  // A match chosen in the Calendrier tab wins over the geo-detected one.
  const activeMatch: Match | null = overrideMatch ?? geo?.active_match ?? null;

  // The field shown in the header: a manual pick wins over the geo-detected one.
  const activeField: Field | null =
    manualField ?? activeMatch?.field ?? geo?.field ?? null;

  // Fields the user can switch between via the header dropdown (deduped).
  const fieldChoices: Field[] = useMemo(() => {
    const list = [
      geo?.field,
      activeMatch?.field,
      ...(geo?.candidates ?? []),
    ].filter((f): f is Field => !!f);
    const seen = new Set<number>();
    return list.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
  }, [geo, activeMatch]);

  // Called when the user picks a game in the Calendrier: make it the active
  // match and jump to the search tab so they can look up its players.
  const activateMatch = useCallback((m: Match) => {
    setOverrideMatch(m);
    setSelectedTeamId(null); // previous team filter belongs to another game
    setNumber('');
    setHits(null);
    setTab('search');
  }, []);

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
    else if (number.length < 2) setNumber((n) => n + key);
  };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="dark-content" />

      {/* ---- Light top panel (green/gold used as accents) ---- */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: t.headerBg }}>
        <View style={s.topPanel}>
          {/* Header line: logo · stadium selector · profile — all on one row */}
          <View style={s.headerRow}>
            <Logo t={t} s={s} />
            <HeaderLocation
              t={t}
              s={s}
              field={activeField}
              phase={phase}
              onOpenMaps={() => activeField && openInMaps(activeField)}
              onOpenField={() => activeField && setSelectedField(activeField)}
              onPickField={() => {
                hapticSelect();
                setFieldPickerOpen(true);
              }}
            />
            <Pressable onPress={() => setProfileOpen(true)} hitSlop={10} style={s.profileBtn}>
              <Ionicons name="person-circle" size={32} color={t.primary} />
            </Pressable>
          </View>

          {/* Active match, shown as its own block */}
          {(phase === 'ready' || overrideMatch) && activeMatch && (
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

          {/* Title + search bar (unchanged) */}
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
        </View>
      </SafeAreaView>

      {/* ---- White body ---- */}
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {tab === 'field' ? (
          <FieldsScreen t={t} s={s} />
        ) : tab === 'calendar' ? (
          <ScheduleScreen t={t} s={s} coords={coords} phase={phase} onActivateMatch={activateMatch} />
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

      <FieldPickerModal
        t={t}
        s={s}
        visible={fieldPickerOpen}
        fields={fieldChoices}
        activeId={activeField?.id ?? null}
        onClose={() => setFieldPickerOpen(false)}
        onSelect={(f) => {
          hapticSelect();
          setManualField(f);
          setFieldPickerOpen(false);
        }}
        onRelocate={() => {
          setFieldPickerOpen(false);
          void locate();
        }}
      />

      <BetaWelcomeModal
        visible={installPromptVisible}
        onClose={() => setInstallPromptVisible(false)}
        t={t}
        s={s}
      />
    </View>
  );
}

function BetaWelcomeModal({ visible, onClose, t, s }: { visible: boolean; onClose: () => void; t: Theme; s: Styles }) {
  if (Platform.OS !== 'web') return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[s.modalSheet, { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '90%' }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={s.modalHandle} />

          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}
          >
            {/* Brand header */}
            <View
              style={{
                backgroundColor: t.primary,
                borderRadius: radius.md,
                paddingVertical: spacing.lg,
                paddingHorizontal: spacing.lg,
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <Text style={{ fontSize: 30, fontWeight: '900', letterSpacing: 0.5 }}>
                <Text style={{ color: t.onPrimary }}>Who</Text>
                <Text style={{ color: t.secondary }}>Plays</Text>
                <Text style={{ color: t.onPrimary, fontSize: 18 }}>.io</Text>
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: t.secondary,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                }}
              >
                <Ionicons name="flask" size={14} color={t.onSecondary} />
                <Text style={{ color: t.onSecondary, fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>VERSION BÊTA</Text>
              </View>
            </View>

            {/* Welcome + presentation */}
            <Text style={{ color: t.text, fontSize: 21, fontWeight: '900' }}>Bienvenue sur WhoPlays 👋</Text>
            <Text style={{ color: t.text, fontSize: 15, lineHeight: 22 }}>
              WhoPlays te permet de <Text style={{ fontWeight: '800' }}>retrouver un joueur par son numéro</Text> en un
              instant, et de consulter les alignements des équipes, les terrains et les parties qui se jouent près de toi.
            </Text>
            <Text style={{ color: t.text, fontSize: 15, lineHeight: 22 }}>
              L’application est encore en <Text style={{ fontWeight: '800', color: t.primary }}>version bêta</Text>, et
              aujourd’hui marque son <Text style={{ fontWeight: '800', color: t.primary }}>tout premier test officiel</Text>.
              Merci de faire partie de l’aventure ! 🎉
            </Text>

            {/* Coming soon on stores */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                backgroundColor: withAlpha(t.secondary, 0.14),
                borderRadius: radius.md,
                padding: spacing.md,
                borderWidth: 1,
                borderColor: withAlpha(t.secondary, 0.4),
              }}
            >
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Ionicons name="logo-apple" size={22} color={t.text} />
                <Ionicons name="logo-google-playstore" size={20} color={t.text} />
              </View>
              <Text style={{ flex: 1, color: t.text, fontSize: 14, lineHeight: 20 }}>
                Bientôt disponible sur <Text style={{ fontWeight: '800' }}>iOS</Text> et{' '}
                <Text style={{ fontWeight: '800' }}>Android</Text>.
              </Text>
            </View>

            {/* Add-to-home-screen tip */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: spacing.md,
                backgroundColor: t.placeholderBg,
                borderRadius: radius.md,
                padding: spacing.md,
              }}
            >
              <Ionicons name="add-circle" size={24} color={t.primary} />
              <Text style={{ flex: 1, color: t.text, fontSize: 14, lineHeight: 20 }}>
                Astuce : <Text style={{ fontWeight: '800' }}>ajoute le raccourci à ton écran d’accueil</Text> pour profiter
                du plein écran et faire disparaître la barre d’adresse du navigateur.
              </Text>
            </View>
          </ScrollView>

          <Pressable
            style={{ borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', backgroundColor: t.primary, marginTop: spacing.md }}
            onPress={onClose}
          >
            <Text style={[s.modalBtnText, { color: t.onPrimary }]}>C’est parti !</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------- Presentational pieces ----------

/** Open the field in Google Maps (by coordinates when known, else by name/address). */
function openInMaps(field: Field) {
  const query =
    field.latitude != null && field.longitude != null
      ? `${field.latitude},${field.longitude}`
      : encodeURIComponent([field.name, field.address].filter(Boolean).join(' '));
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {});
}

function Logo({ t, s }: { t: Theme; s: Styles }) {
  return (
    <View style={s.logo}>
      <Text style={s.logoText}>
        <Text style={{ color: t.primary }}>Who</Text>
        <Text style={{ color: t.secondary }}>Plays</Text>
        <Text style={[s.logoIo, { color: t.primary }]}>.io</Text>
      </Text>
    </View>
  );
}

/**
 * Stadium selector pill sitting on the header line. Three independent tap zones:
 *  📍 pin  → Google Maps · stadium name → field page · ▾ chevron → field picker.
 */
function HeaderLocation({
  t,
  s,
  field,
  phase,
  onOpenMaps,
  onOpenField,
  onPickField,
}: {
  t: Theme;
  s: Styles;
  field: Field | null;
  phase: Phase;
  onOpenMaps: () => void;
  onOpenField: () => void;
  onPickField: () => void;
}) {
  const { tr } = useLang();
  const label =
    phase === 'ready'
      ? field?.name ?? tr('noFieldNearby')
      : phase === 'error'
      ? tr('locationUnavailable')
      : tr('locating');
  const hasField = !!field;

  return (
    <View style={s.locPill}>
      <Pressable onPress={onOpenMaps} disabled={!hasField} hitSlop={6} style={s.locZone}>
        <Ionicons name="location-sharp" size={16} color={t.primary} />
      </Pressable>
      <Pressable onPress={onOpenField} disabled={!hasField} hitSlop={6} style={s.locNameZone}>
        <Text style={s.locName} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable onPress={onPickField} hitSlop={6} style={s.locZone}>
        <Ionicons name="chevron-down" size={16} color={t.primary} />
      </Pressable>
    </View>
  );
}

/** Bottom sheet to switch which nearby field is active, or re-detect by GPS. */
function FieldPickerModal({
  t,
  s,
  visible,
  fields,
  activeId,
  onSelect,
  onRelocate,
  onClose,
}: {
  t: Theme;
  s: Styles;
  visible: boolean;
  fields: Field[];
  activeId: number | null;
  onSelect: (f: Field) => void;
  onRelocate: () => void;
  onClose: () => void;
}) {
  const { tr, lang } = useLang();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable style={[s.modalSheet, { maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
          <View style={s.modalHandle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[s.modalTitle, { flex: 1 }]}>
              {lang === 'fr' ? 'Choisir le terrain' : 'Choose the field'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={t.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.sm }}>
            {fields.length === 0 ? (
              <Text style={[s.placeholderSub, { paddingVertical: spacing.md }]}>
                {tr('noFieldNearby')}
              </Text>
            ) : (
              fields.map((f) => {
                const active = f.id === activeId;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => onSelect(f)}
                    style={({ pressed }) => [s.pickerRow, active && s.pickerRowActive, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[s.pickerIcon, { backgroundColor: active ? t.secondary : t.primary }]}>
                      {sportIcon(f.sport_type ?? f.sports[0]?.key ?? null, active ? t.onSecondary : t.onPrimary, 18)}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.pickerName} numberOfLines={1}>{f.name}</Text>
                      <Text style={s.pickerMeta} numberOfLines={1}>
                        {[f.city, f.region].filter(Boolean).join(' · ') || tr('regionUnknown')}
                        {f.distance_m != null ? ` · ${fmtDist(f.distance_m)}` : ''}
                      </Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={22} color={t.secondary} />}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <Pressable
            style={({ pressed }) => [s.relocateBtn, pressed && { opacity: 0.85 }]}
            onPress={onRelocate}
          >
            <Ionicons name="locate" size={18} color={t.onPrimary} />
            <Text style={[s.modalBtnText, { color: t.onPrimary }]}>
              {lang === 'fr' ? 'Me relocaliser (GPS)' : 'Detect my location'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
  const { tr, lang } = useLang();
  const home = match.home_team ?? null;
  const away = match.away_team ?? null;
  if (!home && !away) return null;
  const category = home?.category ?? away?.category ?? null;
  const startTime = match.starts_at ? fmtTime(new Date(match.starts_at), lang) : null;
  const badge = [match.sport_label, category, startTime].filter(Boolean).join(' · ');
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
  onActivateMatch,
}: {
  t: Theme;
  s: Styles;
  coords: { lat: number; lng: number } | null;
  phase: Phase;
  onActivateMatch: (m: Match) => void;
}) {
  const { tr, lang } = useLang();
  const [radiusKm, setRadiusKm] = useState(25);
  const [sport, setSport] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
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
                    <MatchRow key={m.id} t={t} s={s} m={m} onOpen={setSelectedMatch} />
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

      <MatchDetailModal
        t={t}
        s={s}
        matches={matches ?? []}
        match={selectedMatch}
        onSelect={setSelectedMatch}
        onClose={() => setSelectedMatch(null)}
        onOpenField={(f) => (f ? setSelectedField(f) : null)}
        onActivate={(m) => {
          setSelectedMatch(null);
          onActivateMatch(m);
        }}
      />

      <FieldDetailModal t={t} s={s} field={selectedField} onClose={() => setSelectedField(null)} />
    </View>
  );
}

function MatchRow({ t, s, m, onOpen }: { t: Theme; s: Styles; m: Match; onOpen?: (m: Match) => void }) {
  const { tr, lang } = useLang();
  const d = m.starts_at ? new Date(m.starts_at) : null;
  const dist = m.field?.distance_m ?? null;
  const badge = [m.sport_label, m.home_team?.category].filter(Boolean).join(' · ');
  return (
    <Pressable
      style={({ pressed }) => [s.matchRow, pressed && { opacity: 0.7 }]}
      onPress={() => onOpen?.(m)}
    >
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
          <Text style={s.matchField} numberOfLines={1}>
            {m.field?.name ?? tr('unknownField')}
            {dist != null ? ` · ${fmtDist(dist)}` : ''}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.muted} />
    </Pressable>
  );
}

// Match detail sheet: shows one game and lets you flip between the day's games
// (e.g. Juniors ↔ Senior) via the chips at the top.
function MatchDetailModal({
  t,
  s,
  matches,
  match,
  onSelect,
  onClose,
  onOpenField,
  onActivate,
}: {
  t: Theme;
  s: Styles;
  matches: Match[];
  match: Match | null;
  onSelect: (m: Match) => void;
  onClose: () => void;
  onOpenField: (f: Field | null) => void;
  onActivate: (m: Match) => void;
}) {
  const { tr, lang } = useLang();
  if (!match) return null;
  const d = match.starts_at ? new Date(match.starts_at) : null;
  const home = match.home_team;
  const away = match.away_team;
  const catBadge = [match.sport_label, home?.category].filter(Boolean).join(' · ');

  const TeamCol = ({ team }: { team: Team | null | undefined }) => (
    <View style={{ alignItems: 'center', flex: 1, gap: spacing.sm }}>
      <View style={[s.crest, { backgroundColor: team?.color_primary ?? t.secondary, width: 56, height: 56, borderRadius: 28 }]}>
        <Text style={s.crestText}>{initials(team?.name ?? '?')}</Text>
      </View>
      <Text style={[s.matchTeams, { textAlign: 'center' }]} numberOfLines={2}>{team?.name ?? '?'}</Text>
    </View>
  );

  return (
    <Modal visible={!!match} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={[s.modalSheet, { maxHeight: '85%' }]}>
          <View style={s.modalHandle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[s.modalTitle, { flex: 1 }]}>{lang === 'fr' ? 'Partie' : 'Match'}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={t.muted} />
            </Pressable>
          </View>

          {matches.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
              {matches.map((mm) => {
                const md = mm.starts_at ? new Date(mm.starts_at) : null;
                const label = `${mm.home_team?.category ?? mm.sport_label ?? ''}${md ? ` · ${fmtTime(md, lang)}` : ''}`;
                return (
                  <RegionChip key={mm.id} t={t} s={s} label={label} active={mm.id === match.id} onPress={() => onSelect(mm)} />
                );
              })}
            </ScrollView>
          )}

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.md, marginTop: spacing.lg }}>
              <TeamCol team={home} />
              <Text style={[s.vsSmall, { fontSize: 18, marginTop: spacing.lg }]}>VS</Text>
              <TeamCol team={away} />
            </View>

            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              <View style={s.fieldDetailRow}>
                <Ionicons name="time-outline" size={16} color={t.secondary} />
                <Text style={s.fieldDetailText}>{d ? fmtTime(d, lang) : '--'}</Text>
              </View>
              {!!catBadge && (
                <View style={s.fieldDetailRow}>
                  {sportIcon(match.sport, t.secondary, 16)}
                  <Text style={s.fieldDetailText}>{catBadge}</Text>
                </View>
              )}
              <Pressable style={s.fieldDetailRow} onPress={() => onOpenField(match.field ?? null)}>
                <Ionicons name="location-sharp" size={16} color={t.secondary} />
                <Text style={[s.fieldDetailText, { flex: 1, textDecorationLine: 'underline' }]} numberOfLines={1}>
                  {match.field?.name ?? tr('unknownField')}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={t.muted} />
              </Pressable>
            </View>
          </ScrollView>

          <Pressable
            style={({ pressed }) => [
              { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                backgroundColor: t.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => onActivate(match)}
          >
            <Ionicons name="search" size={18} color={t.onPrimary} />
            <Text style={[s.modalBtnText, { color: t.onPrimary }]}>
              {lang === 'fr' ? 'Rechercher dans cette partie' : 'Search this game'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  const photo = profile?.photo_path ?? hit?.photo_path ?? null;

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
              </View>
            </View>

            {loading && <ActivityIndicator color={t.primary} style={{ marginVertical: spacing.md }} />}

            <View style={[s.infoRow, { marginTop: spacing.lg }]}>
              <InfoItem t={t} s={s} flex icon={<MaterialCommunityIcons name="tshirt-crew-outline" size={20} color={t.primary} />}
                label={tr('number')} value={number != null ? String(number) : '—'} />
              <InfoItem t={t} s={s} flex icon={<Ionicons name="home-outline" size={19} color={t.primary} />}
                label={tr('hometown')} value="Trois-Rivières" />
            </View>
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

    topPanel: {
      backgroundColor: t.headerBg,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      paddingTop: spacing.sm,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    logo: { flexDirection: 'row', alignItems: 'center' },
    logoText: { fontSize: 20, fontWeight: '900' },
    logoIo: { fontSize: 11, fontWeight: '700' },
    profileBtn: { justifyContent: 'center', alignItems: 'flex-end' },

    // ---- Stadium selector (header line) — flat on the cream panel ----
    locPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 34,
    },
    locZone: { paddingHorizontal: 3, height: '100%', justifyContent: 'center' },
    locNameZone: { flexShrink: 1, height: '100%', justifyContent: 'center', paddingHorizontal: 2 },
    locName: { color: t.text, fontSize: 14, fontWeight: '700' },

    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
    titleLine: { flex: 1, height: 1, backgroundColor: t.divider },
    title: { color: t.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: t.cardBg,
      borderWidth: 1,
      borderColor: t.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 52,
      marginTop: spacing.lg,
    },
    searchText: { flex: 1, color: t.text, fontSize: 18, fontWeight: '700' },
    searchPlaceholder: { color: t.muted, fontWeight: '500' },

    // ---- Matchup block (active match) ----
    matchup: {
      marginTop: spacing.lg,
      backgroundColor: t.cardBg,
      borderWidth: 1,
      borderColor: withAlpha(t.secondary, 0.35),
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      gap: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
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
    teamName: { flex: 1, color: t.text, fontSize: 14, fontWeight: '800' },
    vsWrap: { paddingHorizontal: spacing.sm },
    vsText: { color: t.secondary, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    catBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderWidth: 1, borderColor: t.secondary, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: 3,
    },
    catBadgeText: { color: t.secondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

    // ---- Field picker sheet ----
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: t.placeholderBg, borderRadius: radius.md,
      padding: spacing.md, marginBottom: spacing.sm,
      borderWidth: 1, borderColor: 'transparent',
    },
    pickerRowActive: { borderColor: t.secondary, backgroundColor: withAlpha(t.secondary, 0.12) },
    pickerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    pickerName: { color: t.text, fontSize: 15, fontWeight: '800' },
    pickerMeta: { color: t.muted, fontSize: 12, marginTop: 2 },
    relocateBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: t.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm,
    },

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
