import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

type GlassTint = React.ComponentProps<typeof BlurView>['tint'];

type Props = ViewProps & {
  children: ReactNode;
  intensity?: number;
  tint?: GlassTint;
};

export function GlassView({ children, intensity = 60, tint = 'systemChromeMaterial', style, ...props }: Props) {
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
