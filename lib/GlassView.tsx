import type { ReactNode } from 'react';
import { StyleSheet, View, useColorScheme, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

type GlassTint = React.ComponentProps<typeof BlurView>['tint'];

type Props = ViewProps & {
  children: ReactNode;
  intensity?: number;
  tint?: GlassTint;
};

export function GlassView({ children, intensity = 60, tint: propTint, style, ...props }: Props) {
  const colorScheme = useColorScheme();
  const tint = propTint ?? (colorScheme === 'dark' ? 'dark' : 'systemChromeMaterial');
  return (
    <View style={[styles.container, style]} {...props}>
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
