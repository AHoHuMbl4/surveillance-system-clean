#!/bin/bash
echo "🌍 Сборка для всех платформ..."
./node_modules/.bin/electron-builder --win --linux --mac
echo "✅ Сборка завершена!"
echo "📁 Результаты:"
if [ -d "installers" ]; then
    ls -lah installers/
else
    echo "Папка installers не создана"
fi
