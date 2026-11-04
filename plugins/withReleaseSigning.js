// Config plugin untuk build APK di GitHub Actions (lihat .github/workflows/release-apk.yml).
// - Versi: APP_VERSION_NAME (dari tag, misalnya 1.2.0) dan APP_VERSION_CODE (harus selalu naik).
// - Tanda tangan: APK release ditandatangani kunci dari environment ANDROID_KEYSTORE_PATH,
//   ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. Tanpa itu tetap pakai
//   kunci debug (untuk build lokal). Kunci harus selalu sama, kalau tidak APK baru tidak bisa
//   memperbarui app yang sudah terpasang.
const { withAppBuildGradle } = require('expo/config-plugins');

// signingConfig di dalam buildTypes.release (bukan buildTypes.debug).
const DEBUG_RELEASE = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;

const RELEASE_CONFIG = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  if (process.env.APP_VERSION_NAME) config.version = process.env.APP_VERSION_NAME;
  if (process.env.APP_VERSION_CODE) {
    config.android = { ...config.android, versionCode: Number(process.env.APP_VERSION_CODE) };
  }

  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes("System.getenv('ANDROID_KEYSTORE_PATH')")) return mod;
    if (!gradle.includes('signingConfigs {') || !DEBUG_RELEASE.test(gradle)) {
      throw new Error('withReleaseSigning: bentuk android/app/build.gradle berubah, plugin perlu disesuaikan.');
    }
    gradle = gradle.replace(
      DEBUG_RELEASE,
      "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );
    gradle = gradle.replace('signingConfigs {', `signingConfigs {${RELEASE_CONFIG}`);
    mod.modResults.contents = gradle;
    return mod;
  });
};
