#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"
IOS_DIR="$PROJECT_DIR/ios"
GOOGLE_SERVICES_SOURCE="$PROJECT_DIR/google-services.json"
GOOGLE_SERVICES_TARGET="$ANDROID_DIR/app/google-services.json"

# --- Android SDK detection ---
if [ -z "$ANDROID_HOME" ]; then
  if [ -d ~/Library/Android/sdk ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [ -d ~/Android/Sdk ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  fi
fi
echo "ANDROID_HOME=$ANDROID_HOME"

echo ""
echo "========================================"
echo "  BUILD VHORTOSECRETO (Android + iOS)"
echo "========================================"
echo ""

echo "=== 1. Prebuild (clean) ==="
npx expo prebuild --clean

# Prebuild borra local.properties, lo recreamos con el SDK detectado
if [ -n "$ANDROID_HOME" ] && [ ! -f "$ANDROID_DIR/local.properties" ]; then
  echo "sdk.dir=$ANDROID_HOME" > "$ANDROID_DIR/local.properties"
  echo "  + local.properties creado"
fi

echo ""
echo "--- Android ---"
echo ""

echo "=== 2. Aplicando Google Services Gradle plugin ==="
ROOT_BUILD="$ANDROID_DIR/build.gradle"
if ! grep -q "google-services" "$ROOT_BUILD"; then
  sed -i '' "s/classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')/classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath('com.google.gms:google-services:4.4.2')/" "$ROOT_BUILD"
  echo "  + classpath añadido a build.gradle (root)"
fi

APP_BUILD="$ANDROID_DIR/app/build.gradle"
if ! grep -q "apply plugin.*google-services" "$APP_BUILD"; then
  sed -i '' "s/apply plugin: \"com.facebook.react\"/apply plugin: \"com.facebook.react\"\napply plugin: \"com.google.gms.google-services\"/" "$APP_BUILD"
  echo "  + apply plugin añadido a app/build.gradle"
fi

echo "=== 3. Aplicando signing config (release.keystore) ==="
node -e "
const fs = require('fs');
const content = fs.readFileSync('$APP_BUILD', 'utf8');
let out = content;

const releaseCfg = \`
        release {
            storeFile file('../../release.keystore')
            storePassword 'julian1234'
            keyAlias 'vhortosecreto'
            keyPassword 'julian1234'
        }\`;

if (!out.includes('signingConfigs.release')) {
  out = out.replace('signingConfigs {', 'signingConfigs {' + releaseCfg);
}

const btIdx = out.indexOf('buildTypes {');
if (btIdx !== -1) {
  const relIdx = out.indexOf('release {', btIdx);
  if (relIdx !== -1) {
    const before = out.substring(0, relIdx);
    const after = out.substring(relIdx);
    out = before + after.replace(
      'signingConfig signingConfigs.debug',
      'signingConfig signingConfigs.release'
    );
  }
}

fs.writeFileSync('$APP_BUILD', out, 'utf8');
console.log('  + release signingConfig aplicado');
"

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
echo "  ✅ Android build complete!"
echo "  AAB: android/app/build/outputs/bundle/release/app-release.aab"
echo "  APK: android/app/build/outputs/apk/release/app-release.apk"

echo ""
echo "--- iOS ---"
echo ""

echo "=== 6. Pod install ==="
cd "$IOS_DIR"
pod install

echo ""
echo "========================================"
echo "  ✅ BUILD COMPLETE"
echo "========================================"
echo ""
echo "  Android AAB:  $ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
echo "  Android APK:  $ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
echo ""
echo "  iOS: abre VotoSecreto.xcworkspace en Xcode, selecciona tu iPhone, y Cmd+R"
