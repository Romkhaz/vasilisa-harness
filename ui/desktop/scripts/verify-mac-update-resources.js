#!/usr/bin/env node

// Проверяет, что в собранном .app лежит описание источника обновлений и что оно
// совпадает с заданным в репозитории. Раньше ожидаемые значения были прописаны
// здесь строками (owner: aaif-goose, repo: goose), поэтому после переезда на свой
// репозиторий проверка падала на верной сборке. Теперь эталон читается из
// src/app-update.yml — расходиться они больше не могут.

const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const appPath = process.argv[2];
if (!appPath) {
  fail('Usage: node scripts/verify-mac-update-resources.js <path-to-app>');
}

const updateConfigPath = path.join(appPath, 'Contents', 'Resources', 'app-update.yml');
if (!fs.existsSync(updateConfigPath)) {
  fail(`Missing ${updateConfigPath}`);
}

const sourceConfigPath = path.join(__dirname, '..', 'src', 'app-update.yml');
if (!fs.existsSync(sourceConfigPath)) {
  fail(`Missing ${sourceConfigPath}`);
}

const parse = (contents) =>
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

const expected = parse(fs.readFileSync(sourceConfigPath, 'utf8'));
const packaged = parse(fs.readFileSync(updateConfigPath, 'utf8'));

if (expected.length === 0) {
  fail(`${sourceConfigPath} is empty`);
}

for (const key of ['provider', 'owner', 'repo', 'updaterCacheDirName']) {
  if (!expected.some((line) => line.startsWith(`${key}:`))) {
    fail(`${sourceConfigPath} is missing "${key}"`);
  }
}

for (const line of expected) {
  if (!packaged.includes(line)) {
    fail(`${updateConfigPath} is missing "${line}"`);
  }
}

console.log(`${updateConfigPath} is present and matches ${sourceConfigPath}`);
