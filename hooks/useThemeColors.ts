import { useColorScheme } from '@/hooks/use-color-scheme';
import { lightColors, darkColors } from '@/constants/colors';

export function useThemeColors() {
  const theme = useColorScheme() ?? 'light';
  return theme === 'dark' ? darkColors : lightColors;
}
