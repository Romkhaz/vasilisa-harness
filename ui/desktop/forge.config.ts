const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { basename, resolve } = require('path');

const packagedApps = [];

let cfg = {
  asar: true,
  // Явный bundle id: иначе Electron вывел бы его из имени пакета и он совпал бы
  // с идентификатором оригинального goose.
  appBundleId: 'ru.vasilisa.agent',
  extraResource: ['src/bin', 'src/images', 'src/app-update.yml'],
  icon: 'src/images/icon',
  // Метаданные exe: без них Windows показывает в свойствах файла заготовку Electron
  // («GitHub, Inc.»).
  win32metadata: {
    CompanyName: 'Агент Василиса',
    FileDescription: 'Агент Василиса',
    ProductName: 'Агент Василиса',
    InternalName: 'Vasilisa',
    OriginalFilename: 'Vasilisa.exe',
  },
  // Windows specific configuration
  win32: {
    icon: 'src/images/icon.ico',
    certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
    signingRole: process.env.WINDOW_SIGNING_ROLE,
    rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    signWithParams: '/fd sha256 /tr http://timestamp.digicert.com /td sha256',
  },
  // Protocol registration
  protocols: [
    {
      name: 'VasilisaProtocol',
      schemes: ['vasilisa'],
    },
  ],
  // macOS Info.plist extensions for drag-and-drop support
  extendInfo: {
    // Имя бандла остаётся латиницей (Vasilisa.app), а в Dock и Finder macOS
    // показывает отображаемое имя.
    CFBundleDisplayName: 'Агент Василиса',
    // Document types for drag-and-drop support onto dock icon
    CFBundleDocumentTypes: [
      {
        CFBundleTypeName: 'Folders',
        CFBundleTypeRole: 'Viewer',
        LSHandlerRank: 'Alternate',
        LSItemContentTypes: ['public.directory', 'public.folder'],
      },
    ],
    // Usage descriptions for macOS TCC (Transparency, Consent, and Control)
    NSMicrophoneUsageDescription: 'Василисе нужен доступ к микрофону для голосового ввода.',
    NSAppleEventsUsageDescription:
      'Василисе нужен доступ к Apple Events, чтобы управлять другими приложениями от вашего имени.',
  },
};

const signingIdentity = process.env.APPLE_SIGNING_IDENTITY || 'Developer ID Application';

// Учётные данные notarytool: ключ App Store Connect, если он выдан, иначе
// Apple ID с паролем приложения. Тот же набор нужен и для образа .dmg, который
// собирается уже после форджа, поэтому вынесен в функцию.
function notarytoolArgs() {
  if (process.env.APPLE_API_KEY_PATH) {
    return [
      '--key',
      process.env.APPLE_API_KEY_PATH,
      '--key-id',
      process.env.APPLE_API_KEY_ID,
      '--issuer',
      process.env.APPLE_API_ISSUER,
    ];
  }
  return [
    '--apple-id',
    process.env.APPLE_ID,
    '--password',
    process.env.APPLE_ID_PASSWORD,
    '--team-id',
    process.env.APPLE_TEAM_ID,
  ];
}

// macOS code signing and notarization via Electron Forge
// Activated when APPLE_TEAM_ID is set (CI signing builds)
if (process.env.APPLE_TEAM_ID) {
  cfg.osxSign = {
    keychain: process.env.KEYCHAIN_PATH || undefined,
    identity: process.env.APPLE_SIGNING_IDENTITY || undefined,
    entitlements: 'entitlements.plist',
    'entitlements-inherit': 'entitlements.plist',
  };
  cfg.osxNotarize = process.env.APPLE_API_KEY_PATH
    ? {
        appleApiKey: process.env.APPLE_API_KEY_PATH,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      }
    : {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_ID_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      };
}

module.exports = {
  packagerConfig: cfg,
  rebuildConfig: {},
  // Собираем список готовых бандлов для сборки .dmg в postMake.
  //
  // Без сертификата Apple бандл остаётся с подписью самого Electron, но packager
  // и FusesPlugin правят его уже после неё: в Info.plist дописывается хеш asar,
  // в бинаре переключаются fuse-биты. Подпись перестаёт сходиться, и скачанное
  // приложение macOS считает повреждённым («переместите в Корзину») — правый клик
  // → «Открыть» в этом случае не спасает. Подписываем бандл ad-hoc сами, последним
  // шагом: тогда остаётся обычный Gatekeeper про неизвестного разработчика.
  // С сертификатом бандл уже подписан и заверен самим форджем — трогать его не нужно.
  hooks: {
    postPackage: async (_forgeConfig, options) => {
      if (options.platform !== 'darwin') return;
      const { execFileSync } = require('child_process');
      const { readdirSync } = require('fs');
      for (const dir of options.outputPaths) {
        for (const entry of readdirSync(dir)) {
          if (!entry.endsWith('.app')) continue;
          const app = resolve(dir, entry);
          packagedApps.push(app);
          if (process.env.APPLE_TEAM_ID) continue;
          console.log(`Ad-hoc подпись ${app}`);
          execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
        }
      }
    },
    // Установщик для macOS: образ с приложением и ярлыком «Программы» рядом, куда
    // его перетаскивают. Собран на hdiutil из состава системы, а не мейкером
    // @electron-forge/maker-dmg: тот тянет appdmg с нативными fs-xattr и
    // macos-alias, а fs-xattr (у него в манифесте `os: ['!win32']`) при чистой
    // установке pnpm просто не ставит, и сборка падает на раннере.
    postMake: async (_forgeConfig, results) => {
      if (process.platform !== 'darwin' || packagedApps.length === 0) return results;
      const { execFileSync } = require('child_process');
      const { mkdtempSync, mkdirSync, rmSync, symlinkSync, existsSync } = require('fs');
      const { tmpdir } = require('os');
      const outDir = resolve(__dirname, 'out', 'make');
      mkdirSync(outDir, { recursive: true });
      for (const app of packagedApps) {
        const staging = mkdtempSync(resolve(tmpdir(), 'vasilisa-dmg-'));
        const mountPoint = mkdtempSync(resolve(tmpdir(), 'vasilisa-mnt-'));
        const dmg = resolve(outDir, 'Vasilisa.dmg');
        const rwDmg = resolve(outDir, 'Vasilisa-rw.dmg');
        try {
          // ditto, а не cp: он переносит бандл со всеми расширенными атрибутами,
          // включая тикет нотаризации, который прикрепляет stapler.
          execFileSync('ditto', [app, resolve(staging, basename(app))], { stdio: 'inherit' });
          symlinkSync('/Applications', resolve(staging, 'Applications'));

          // Иконка тома. Finder рисует её и на самом файле .dmg, поэтому в
          // «Загрузках» лежит Василиса, а не серая болванка образа.
          const volumeIcon = resolve(staging, '.VolumeIcon.icns');
          execFileSync('cp', [resolve(__dirname, 'src', 'images', 'icon.icns'), volumeIcon]);
          execFileSync('SetFile', ['-c', 'icnC', volumeIcon]);

          if (existsSync(dmg)) rmSync(dmg);
          if (existsSync(rwDmg)) rmSync(rwDmg);
          console.log(`Собираю образ ${dmg}`);
          // Через промежуточный read-write образ: флаг «своя иконка» ставится на
          // смонтированном томе, а с -srcfolder он до тома не доезжает —
          // hdiutil переносит содержимое папки, но не её атрибуты Finder.
          execFileSync(
            'hdiutil',
            ['create', '-volname', 'Агент Василиса', '-srcfolder', staging, '-fs', 'HFS+', '-format', 'UDRW', '-ov', rwDmg],
            { stdio: 'inherit' }
          );
          execFileSync('hdiutil', ['attach', rwDmg, '-nobrowse', '-mountpoint', mountPoint], {
            stdio: 'inherit',
          });
          try {
            execFileSync('SetFile', ['-a', 'C', mountPoint]);
          } finally {
            execFileSync('hdiutil', ['detach', mountPoint, '-quiet'], { stdio: 'inherit' });
          }
          execFileSync('hdiutil', ['convert', rwDmg, '-format', 'UDZO', '-o', dmg], {
            stdio: 'inherit',
          });
          rmSync(rwDmg);
          if (process.env.APPLE_TEAM_ID) {
            // Образ — самостоятельный артефакт: приложение внутри уже заверено,
            // но сам .dmg скачивает пользователь, и Gatekeeper проверяет его
            // отдельно. Поэтому подписываем и заверяем образ тоже, а тикет
            // прикрепляем к файлу, чтобы проверка работала без сети.
            const keychain = process.env.KEYCHAIN_PATH ? ['--keychain', process.env.KEYCHAIN_PATH] : [];
            execFileSync('codesign', ['--force', '--timestamp', '--sign', signingIdentity, ...keychain, dmg], {
              stdio: 'inherit',
            });
            execFileSync('xcrun', ['notarytool', 'submit', dmg, ...notarytoolArgs(), '--wait'], {
              stdio: 'inherit',
            });
            execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
          }
        } finally {
          rmSync(staging, { recursive: true, force: true });
          rmSync(mountPoint, { recursive: true, force: true });
          rmSync(rwDmg, { force: true });
        }
      }
      return results;
    },
  },
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: process.env.GITHUB_OWNER || 'Romkhaz',
          name: process.env.GITHUB_REPO || 'vasilisa-harness',
        },
        prerelease: false,
        draft: true,
      },
    },
  ],
  makers: [
    {
      // Установщик для Windows. Приложение уже умеет отрабатывать события Squirrel
      // (см. electron-squirrel-startup в src/main.ts), не хватало только мейкера.
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'Vasilisa',
        authors: 'Агент Василиса',
        description: 'Агент Василиса — десктоп-агент для работы с кодом',
        setupIcon: 'src/images/icon.ico',
        setupExe: 'Vasilisa-setup.exe',
        noMsi: true,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux'],
      config: {
        arch: process.env.ELECTRON_ARCH === 'x64' ? ['x64'] : ['arm64'],
        options: {
          icon: 'src/images/icon.ico',
        },
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        name: 'Vasilisa',
        bin: 'Vasilisa',
        maintainer: 'Агент Василиса',
        homepage: 'https://github.com/Romkhaz/vasilisa-harness',
        categories: ['Development'],
        desktopTemplate: './forge.deb.desktop',
        options: {
          icon: 'src/images/icon.png',
          prefix: '/opt',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.ts',
            config: 'vite.main.config.mts',
          },
          {
            entry: 'src/preload.ts',
            config: 'vite.preload.config.mts',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mts',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
