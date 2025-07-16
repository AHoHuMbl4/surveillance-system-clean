#!/bin/bash
echo "🐧 Сборка для Linux..."
./node_modules/.bin/electron-builder --linux
echo "✅ Linux сборка завершена!"
echo "📁 Файлы в: installers/"
ls -la installers/ | grep -E "\.(deb|rpm|AppImage)$" || echo "Нет Linux файлов"
