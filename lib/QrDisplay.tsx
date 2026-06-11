import { useMemo } from 'react';
import { View } from 'react-native';
import QRCode from 'qrcode';

type Props = {
  value: string;
  size: number;
};

export default function QrDisplay({ value, size }: Props) {
  const qr = useMemo(() => QRCode.create(value), [value]);
  const modules = qr.modules;
  const cellSize = size / modules.size;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden', backgroundColor: '#FFF' }}>
      {Array.from({ length: modules.size }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: modules.size }, (_, col) => (
            <View
              key={col}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: modules.get(row, col) ? '#000' : '#FFF',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
