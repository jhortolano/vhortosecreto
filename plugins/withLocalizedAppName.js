const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const localizedNames = {
  es: 'Voto Secreto',
  en: 'Secret Poll',
  it: 'Sondaggio Segreto',
  fr: 'Sondage Secret',
  de: 'Geheime Umfrage',
};

function withLocalizedAppName(config) {
  config = withLocalizedAppNameIOS(config);
  config = withLocalizedAppNameAndroid(config);
  return config;
}

function withLocalizedAppNameIOS(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const bundleName = 'VhortoSecreto';

      for (const [lang, appName] of Object.entries(localizedNames)) {
        const lprojDir = path.join(projectRoot, bundleName, `${lang}.lproj`);
        fs.mkdirSync(lprojDir, { recursive: true });
        fs.writeFileSync(
          path.join(lprojDir, 'InfoPlist.strings'),
          `CFBundleDisplayName = "${appName}";\n`
        );
      }
      return cfg;
    },
  ]);
}

function withLocalizedAppNameAndroid(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const resDir = path.join(projectRoot, 'app/src/main/res');

      for (const [lang, appName] of Object.entries(localizedNames)) {
        const valuesDir = path.join(resDir, `values-${lang}`);
        fs.mkdirSync(valuesDir, { recursive: true });
        fs.writeFileSync(
          path.join(valuesDir, 'strings.xml'),
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">${appName}</string>\n</resources>\n`
        );
      }
      return cfg;
    },
  ]);
}

module.exports = withLocalizedAppName;
