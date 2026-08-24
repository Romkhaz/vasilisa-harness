#!/usr/bin/env bash
# Удаляет то, что осталось от upstream-проекта goose и не используется Василисой.
#
# Скрипт нужен потому, что массовое удаление приходится делать одной командой.
# Каждый путь ниже проверен: на него не ссылаются ни сборочные workflow, ни Justfile,
# ни манифесты Cargo и package.json.
#
# Запуск из корня репозитория:
#   bash scripts/cleanup-upstream.sh
#
# Скрипт только удаляет и коммитит. Отправку в GitHub делайте сами: git push origin main

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Рабочее дерево не чистое — закоммитьте или отложите изменения перед чисткой." >&2
  git status --short >&2
  exit 1
fi

# Сайт документации goose: 828 файлов, 171 страница и 112 статей блога про чужой продукт.
# Своя документация лежит в docs/.
PATHS=(
  documentation

  # Сервисы и утилиты инфраструктуры upstream
  services            # бот «спроси ИИ» для сайта документации
  oidc-proxy          # прокси OIDC для Anthropic
  recipe-scanner      # сканер рецептов для CI-бота
  workflow_recipes    # рецепты для ботов репозитория
  evals               # бенчмарки harbor
  examples            # примеры расширений и подрецептов
  .intersect          # конфиг стороннего сервиса
  .devcontainer       # dev-контейнер upstream

  # Сборки, которые мы не выпускаем
  Dockerfile
  .dockerignore
  flake.nix
  flake.lock

  # Разовые скрипты и самопроверки upstream
  goose-self-test.yaml
  test_acp_client.py
  scripts/README.md
  scripts/bench-postprocess-scripts
  scripts/run-benchmarks.sh
  scripts/parse-benchmark-results.sh
  scripts/pre-release.sh
  scripts/build-windows.ps1
  scripts/diagnostics-viewer.py
  scripts/goose-db-helper.sh
  scripts/provider-error-proxy
  scripts/test-subrecipes-examples
  scripts/test_compaction.sh
  scripts/test_local_model_smoke.sh
  scripts/test_mcp.sh
  scripts/test_openrouter_toolcalls.sh
  scripts/test_subagents.sh
  scripts/test_subrecipes.sh
)

echo "Удаляю ${#PATHS[@]} путей..."
removed=0
for path in "${PATHS[@]}"; do
  if git ls-files --error-unmatch "$path" >/dev/null 2>&1 || [ -e "$path" ]; then
    git rm -r -q --ignore-unmatch "$path"
    removed=$((removed + 1))
    echo "  удалено: $path"
  else
    echo "  пропущено (нет в репозитории): $path"
  fi
done

echo
echo "Удалено путей: $removed"
echo "Файлов в индексе к удалению: $(git diff --cached --name-only --diff-filter=D | wc -l)"

git commit -q -m "Удалить неиспользуемое наследие goose

Сайт документации (828 файлов про чужой продукт), сервисы и утилиты
инфраструктуры upstream, dev-контейнер, сборка в Docker и Nix, бенчмарки,
примеры и разовые скрипты. Ничто из перечисленного не участвует в сборке
Василисы: ни сборочные workflow, ни Justfile, ни манифесты на это не ссылаются.

Своя документация осталась в docs/, из upstream-руководств переведено на русский
то, что относится к нашей сборке: расширения и рецепты.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"

echo
echo "Готово. Проверьте результат и отправьте:"
echo "  git show --stat HEAD | tail -5"
echo "  git push origin main"
