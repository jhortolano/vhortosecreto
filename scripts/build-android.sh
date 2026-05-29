#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
GOOGLE_SERVICES_SOURCE="$PROJECT_DIR/google-services.json"
GOOGLE_SERVICES_TARGET="$ANDROID_DIR/app/google-services.json"

# Detectar Android SDK
if [ -z "$ANDROID_HOME" ]; then
  if [ -d ~/Library/Android/sdk ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [ -d ~/Android/Sdk ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi
echo "ANDROID_HOME=$ANDROID_HOME"

echo "=== 1. Prebuild (clean) ==="
npx expo prebuild --clean

# Prebuild borra local.properties, lo recreamos con el SDK detectado
if [ -n "$ANDROID_HOME" ] && [ ! -f "$ANDROID_DIR/local.properties" ]; then
  echo "sdk.dir=$ANDROID_HOME" > "$ANDROID_DIR/local.properties"
  echo "  + local.properties creado"
fi

echo "=== 2. Aplicando Google Services Gradle plugin ==="

# Add classpath to root build.gradle
ROOT_BUILD="$ANDROID_DIR/build.gradle"
if ! grep -q "google-services" "$ROOT_BUILD"; then
  sed -i '' "s/classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')/classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath('com.google.gms:google-services:4.4.2')/" "$ROOT_BUILD"
  echo "  + classpath añadido a build.gradle (root)"
fi

# Add apply plugin to app build.gradle
APP_BUILD="$ANDROID_DIR/app/build.gradle"
if ! grep -q "apply plugin.*google-services" "$APP_BUILD"; then
  sed -i '' "s/apply plugin: \"com.facebook.react\"/apply plugin: \"com.facebook.react\"\napply plugin: \"com.google.gms.google-services\"/" "$APP_BUILD"
  echo "  + apply plugin añadido a app/build.gradle"
fi

echo "=== 3. Aplicando signing config (release.keystore) ==="

APP_BUILD="$ANDROID_DIR/app/build.gradle"

cat > /tmp/fix-signing.js << 'EOF'
const fs = require('fs');
const buildGradle = process.argv[2];
let content = fs.readFileSync(buildGradle, 'utf8');

const releaseCfg = `
        release {
            storeFile file('../../release.keystore')
            storePassword 'julian1234'
            keyAlias 'vhortosecreto'
            keyPassword 'julian1234'
        }`;

if (!content.includes('signingConfigs.release')) {
  content = content.replace('signingConfigs {', 'signingConfigs {' + releaseCfg);
}

const btIdx = content.indexOf('buildTypes {');
if (btIdx !== -1) {
  const relIdx = content.indexOf('release {', btIdx);
  if (relIdx !== -1) {
    const before = content.substring(0, relIdx);
    const after = content.substring(relIdx);
    content = before + after.replace(
      'signingConfig signingConfigs.debug',
      'signingConfig signingConfigs.release'
    );
  }
}

fs.writeFileSync(buildGradle, content, 'utf8');
console.log('  + release signingConfig aplicado');
EOF
node /tmp/fix-signing.js "$APP_BUILD"
rm -f /tmp/fix-signing.js

echo "=== 4. Copiando google-services.json ==="


if [ -f "$GOOGLE_SERVICES_SOURCE" ]; then
  cp "$GOOGLE_SERVICES_SOURCE" "$GOOGLE_SERVICES_TARGET"
  echo "  + google-services.json copiado"
else
  echo "  ! google-services.json no encontrado en raíz del proyecto"
fi

echo "=== 5. Build Release (AAB + APK) ==="
cd "$ANDROID_DIR"
./gradlew bundleRelease assembleRelease

echo ""
echo "=== Done! ==="
echo "  AAB: android/app/build/outputs/bundle/release/app-release.aab  (para Play Store)"
echo "  APK: android/app/build/outputs/apk/release/app-release.apk    (para pruebas)"
