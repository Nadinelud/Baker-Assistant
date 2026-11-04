import { router } from 'expo-router';
import { View } from 'react-native';

import { ListRow, Screen, Text } from '@/components';

export default function MoreScreen() {
  return (
    <Screen>
      <Text variant="title">Lainnya</Text>
      <View>
        <ListRow icon="time-outline" title="Riwayat bake" onPress={() => router.push('/more/bake-logs')} />
        <ListRow
          icon="settings-outline"
          title="Pengaturan"
          subtitle="API key, model, ekspor dan impor data"
          onPress={() => router.push('/more/settings')}
          showDivider={false}
        />
      </View>
    </Screen>
  );
}
