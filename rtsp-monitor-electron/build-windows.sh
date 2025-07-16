#!/bin/bash
echo "🪟 Сборка для Windows..."
./node_modules/.bin/electron-builder --win
echo "✅ Windows сборка завершена!"
echo "📁 Файлы в: installers/"
ls -la installers/ | grep -E "\.(exe|msi)$" || echo "Нет Windows файлов"
