#!/bin/bash

# Имя backup-ветки по текущей дате и времени
backup_branch="backup-$(date +%Y%m%d-%H%M%S)"

# Сохраняем текущее имя ветки (например, main)
current_branch=$(git rev-parse --abbrev-ref HEAD)

# Создание backup-ветки и пуш в GitHub
git checkout -b "$backup_branch"
git push -u origin "$backup_branch"

# Возврат на исходную ветку
git checkout "$current_branch"

# Добавление всех новых/удалённых/изменённых файлов
git add -A

# Ввод комментария
read -p "Введите комментарий к коммиту: " comment

# Коммит и пуш
git commit -m "$comment"
git push
