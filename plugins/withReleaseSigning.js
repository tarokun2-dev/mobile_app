// リリースビルドを、自分の署名キー（アップロードキー）で署名するための Expo 設定プラグイン。
//
// 鍵の場所とパスワードは Git に入れず、各自の PC の ~/.gradle/gradle.properties に置く:
//   PACHI_UPLOAD_STORE_FILE=C:/Users/xxx/pachi-keystore/pachi-upload.keystore
//   PACHI_UPLOAD_STORE_PASSWORD=...
//   PACHI_UPLOAD_KEY_ALIAS=upload
//   PACHI_UPLOAD_KEY_PASSWORD=...
// 未設定のときは、従来どおりデバッグ鍵で署名する（鍵の無い PC でもビルドだけは通る）。
// ただしデバッグ鍵で署名したものは Google Play に登録できない。
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = 'PACHI_UPLOAD_STORE_FILE';

const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('PACHI_UPLOAD_STORE_FILE')) {
                storeFile file(PACHI_UPLOAD_STORE_FILE)
                storePassword PACHI_UPLOAD_STORE_PASSWORD
                keyAlias PACHI_UPLOAD_KEY_ALIAS
                keyPassword PACHI_UPLOAD_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: app/build.gradle が Groovy 形式ではありません');
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg; // 適用済み

    // 1) buildTypes.release の署名を、自分の鍵（あれば）に切り替える。
    //    signingConfigs に release を足す前にやる（"release {" が二つになるため）。
    const useRelease = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!useRelease.test(src)) {
      throw new Error('withReleaseSigning: buildTypes.release の署名設定が見つかりません（テンプレートが変わった可能性）');
    }
    src = src.replace(
      useRelease,
      `$1signingConfig project.hasProperty('${MARKER}') ? signingConfigs.release : signingConfigs.debug`,
    );

    // 2) signingConfigs に release を追加する（debug ブロックの直後）
    const afterDebug = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
    if (!afterDebug.test(src)) {
      throw new Error('withReleaseSigning: signingConfigs.debug が見つかりません（テンプレートが変わった可能性）');
    }
    src = src.replace(afterDebug, `$1${RELEASE_SIGNING_CONFIG}`);

    cfg.modResults.contents = src;
    return cfg;
  });
};
