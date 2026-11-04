import { router } from 'expo-router';

import { ListRow, Photo, Text } from '@/components';
import type { BakeLogSummary } from '@/db/bakeLogs';
import { formatDateTime } from '@/lib/dates';
import { formatMultiplier } from '@/lib/scaling';

type BakeLogRowProps = {
  log: BakeLogSummary;
  // Di halaman resep, nama resep tidak perlu diulang.
  showRecipe?: boolean;
  showDivider?: boolean;
};

function subtitle(log: BakeLogSummary, showRecipe: boolean): string {
  const parts = [formatDateTime(new Date(log.bakedAt)), `v${log.versionNumber}`];
  if (log.multiplier !== 1) parts.push(formatMultiplier(log.multiplier));
  if (!showRecipe && log.resultNote) parts.push(log.resultNote);
  return parts.join(' · ');
}

export function BakeLogRow({ log, showRecipe = true, showDivider = true }: BakeLogRowProps) {
  return (
    <ListRow
      leading={<Photo uri={log.photoUri} shape="thumbnail" />}
      title={showRecipe ? log.recipeName : log.resultNote ? 'Catatan' : 'Belum ada catatan'}
      subtitle={subtitle(log, showRecipe)}
      right={
        log.rating !== null ? (
          <Text variant="bodyStrong" accessibilityLabel={`Nilai ${log.rating} dari 5`}>
            {log.rating}/5
          </Text>
        ) : null
      }
      onPress={() => router.push({ pathname: '/bake-note', params: { id: log.id } })}
      showDivider={showDivider}
    />
  );
}
