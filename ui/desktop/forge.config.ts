const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { resolve } = require('path');

const isLinuxVulkanBuild = process.env.GOOSE_DESKTOP_LINUX_VARIANT === 'vulkan';

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

// macOS code signing and notarization via Electron Forge
// Activated when APPLE_TEAM_ID is set (CI signing builds)
if (process.env.APPLE_TEAM_ID) {
  cfg.osxSign = {
    keychain: process.env.KEYCHAIN_PATH || undefined,
    entitlements: 'entitlements.plist',
    'entitlements-inherit': 'entitlements.plist',
  };
  cfg.osxNotarize = {
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  };
}

module.exports = {
  packagerConfig: cfg,
  rebuildConfig: {},
  // Без сертификата Apple бандл остаётся с подписью самого Electron, но packager
  // и FusesPlugin правят его уже после неё: в Info.plist дописывается хеш asar,
  // в бинаре переключаются fuse-биты. Подпись перестаёт сходиться, и скачанное
  // приложение macOS считает повреждённым («переместите в Корзину») — правый клик
  // → «Открыть» в этом случае не спасает. Подписываем бандл ad-hoc сами, последним
  // шагом: тогда остаётся обычный Gatekeeper про неизвестного разработчика.
  hooks: {
    postPackage: async (_forgeConfig, options) => {
      if (options.platform !== 'darwin' || process.env.APPLE_TEAM_ID) return;
      const { execFileSync } = require('child_process');
      const { readdirSync } = require('fs');
      for (const dir of options.outputPaths) {
        for (const entry of readdirSync(dir)) {
          if (!entry.endsWith('.app')) continue;
          const app = resolve(dir, entry);
          console.log(`Ad-hoc подпись ${app}`);
          execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
        }
      }
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
      // Установщик для macOS: окно с иконкой приложения и ярлыком «Программы»,
      // куда её перетаскивают. Zip оставлен рядом — им пользуется автообновление.
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        name: 'Vasilisa',
        title: 'Агент Василиса',
        icon: 'src/images/icon.icns',
        overwrite: true,
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
          ...(isLinuxVulkanBuild ? { depends: ['libvulkan1'] } : {}),
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        name: 'Vasilisa',
        bin: 'Vasilisa',
        maintainer: 'Агент Василиса',
        homepage: 'https://github.com/Romkhaz/vasilisa-harness',
        categories: ['Development'],
        desktopTemplate: './forge.rpm.desktop',
        options: {
          icon: 'src/images/icon.png',
          prefix: '/opt',
          ...(isLinuxVulkanBuild ? { requires: ['vulkan-loader'] } : {}),
        },
      },
    },
    {
      name: '@electron-forge/maker-flatpak',
      config: {
        options: {
          id: 'ru.vasilisa.Agent',
          categories: ['Development'],
          mimeType: ['x-scheme-handler/vasilisa'],
          icon: {
            scalable: 'src/images/icon.svg',
            '512x512': 'src/images/icon-512.png',
          },
          homepage: 'https://github.com/Romkhaz/vasilisa-harness',
          runtimeVersion: '25.08',
          baseVersion: '25.08',
          bin: 'Vasilisa',
          modules: [
            {
              name: 'libbz2-shim',
              buildsystem: 'simple',
              'build-commands': [
                // Create the lib directory in the app bundle
                'mkdir -p /app/lib',
                // Point to the actual library in the 25.08 runtime
                // We use a wildcard to handle multi-arch paths (x86_64-linux-gnu, etc)
                'ln -s $(find /usr/lib -name "libbz2.so.1" | head -n 1) /app/lib/libbz2.so.1.0',
              ],
            },
            {
              name: 'git',
              buildsystem: 'simple',
              'build-commands': [
                'mkdir -p /app/bin /app/libexec/git-core',
                'cp /usr/bin/git /app/bin/git',
                'cp /usr/libexec/git-core/git-remote-https /app/libexec/git-core/git-remote-https 2>/dev/null || true',
              ],
            },
          ],
          finishArgs: [
            '--share=ipc',
            '--socket=x11',
            '--socket=wayland',
            '--device=dri',
            '--share=network',
            '--filesystem=home',
            '--talk-name=org.freedesktop.Notifications',
            '--socket=session-bus',
            '--socket=system-bus',
            // This ensures the app looks in our shim folder first
            '--env=LD_LIBRARY_PATH=/app/lib',
            '--env=GIT_EXEC_PATH=/app/libexec/git-core',
          ],
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
