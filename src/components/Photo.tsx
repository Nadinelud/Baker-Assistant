import { Image, StyleSheet, View } from 'react-native';

import { colors, radius, sizes } from '@/theme';

import { Icon } from './Icon';

type PhotoProps = {
  uri?: string | null;
  // thumbnail: kotak kecil di baris daftar; banner: foto lebar di atas kartu.
  shape: 'thumbnail' | 'tile' | 'banner';
};

// Foto hasil bake, atau tempat kosong yang tenang kalau belum ada foto.
export function Photo({ uri, shape }: PhotoProps) {
  const style = shape === 'banner' ? styles.banner : shape === 'tile' ? styles.tile : styles.thumbnail;
  if (uri) return <Image source={{ uri }} style={style} />;
  return (
    <View style={[style, styles.placeholder]}>
      {shape !== 'thumbnail' ? <Icon name="image-outline" color="textMuted" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: sizes.thumbnail,
    height: sizes.thumbnail,
    borderRadius: radius.card,
  },
  tile: {
    width: sizes.photoTile,
    height: sizes.photoTile,
    borderRadius: radius.card,
  },
  banner: {
    width: '100%',
    height: sizes.photo,
  },
  placeholder: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
