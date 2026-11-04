import { View } from 'react-native';

import { EmptyState, Screen, Text } from '@/components';
import { listBakeLogs } from '@/db/bakeLogs';
import type { Db } from '@/db/types';
import { BakeLogRow } from '@/features/bakes/BakeLogRow';
import { useFocusData } from '@/lib/useFocusData';

function loadAll(db: Db) {
  return listBakeLogs(db);
}

export default function BakeLogsScreen() {
  const { data: logs } = useFocusData(loadAll);

  if (logs === null) return <Screen hasHeader>{null}</Screen>;

  return (
    <Screen hasHeader>
      {logs.length === 0 ? (
        <EmptyState
          icon="time-outline"
          message="Belum ada catatan bake. Buka resep, tekan Bake ini, lalu catat hasilnya."
        />
      ) : (
        <>
          <Text color="textMuted">Ketuk catatan untuk menambah foto, nilai, atau ide perbaikan.</Text>
          <View>
            {logs.map((log, index) => (
              <BakeLogRow key={log.id} log={log} showDivider={index < logs.length - 1} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
