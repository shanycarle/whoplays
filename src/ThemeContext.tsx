import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  deriveTheme,
  type Palette,
  type Theme,
} from './theme';

const STORAGE_KEY = 'whoplays.teamColors.v1';

type ThemeContextValue = {
  theme: Theme;
  palette: Palette;
  setPrimary: (hex: string) => void;
  setSecondary: (hex: string) => void;
  reset: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState<Palette>({
    primary: DEFAULT_PRIMARY,
    secondary: DEFAULT_SECONDARY,
  });

  // Load saved team colors once on startup.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const saved = JSON.parse(raw) as Partial<Palette>;
        if (saved.primary && saved.secondary) {
          setPalette({ primary: saved.primary, secondary: saved.secondary });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((next: Palette) => {
    setPalette(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: deriveTheme(palette),
      palette,
      setPrimary: (hex) => persist({ ...palette, primary: hex }),
      setSecondary: (hex) => persist({ ...palette, secondary: hex }),
      reset: () => persist({ primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY }),
    }),
    [palette, persist],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
