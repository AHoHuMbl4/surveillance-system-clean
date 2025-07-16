#!/bin/bash

# Проверка готовности к Windows сборке
# Запускать на OpenSUSE перед копированием на Windows

echo "🔍 Проверка готовности автономной системы для Windows..."
echo "=================================================="

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_ok() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# 1. Проверка структуры файлов
echo -e "\n📁 Проверка файловой структуры:"

files=(
    "autonomous-server.js"
    "autonomous-rtsp-manager.js" 
    "index.html"
    "package.json"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        log_ok "Найден: $file"
    else
        log_error "Отсутствует: $file"
    fi
done

# 2. Проверка FFmpeg бинарников для Windows
echo -e "\n🎬 Проверка FFmpeg бинарников:"

if [ -d "ffmpeg" ]; then
    log_ok "Папка ffmpeg существует"
    
    # Windows 64-bit
    if [ -f "ffmpeg/win64/ffmpeg.exe" ]; then
        log_ok "Windows FFmpeg найден: ffmpeg/win64/ffmpeg.exe"
        size=$(du -h "ffmpeg/win64/ffmpeg.exe" | cut -f1)
        echo "   📊 Размер: $size"
    else
        log_error "Windows FFmpeg отсутствует: ffmpeg/win64/ffmpeg.exe"
        echo "   💡 Скачайте с: https://github.com/BtbN/FFmpeg-Builds/releases"
    fi
    
    # Проверка других платформ
    platforms=("linux-x64" "macos-x64" "macos-arm64")
    for platform in "${platforms[@]}"; do
        if [ -f "ffmpeg/$platform/ffmpeg" ]; then
            log_ok "Найден: ffmpeg/$platform/ffmpeg"
        else
            log_warn "Отсутствует: ffmpeg/$platform/ffmpeg"
        fi
    done
else
    log_error "Папка ffmpeg не найдена"
fi

# 3. Проверка package.json
echo -e "\n📦 Проверка package.json:"

if [ -f "package.json" ]; then
    # Проверка что нет внешних зависимостей
    deps=$(grep -c '"dependencies"' package.json 2>/dev/null || echo "0")
    if [ "$deps" -eq 0 ] || grep -q '"dependencies": {}' package.json; then
        log_ok "Без внешних зависимостей (автономная система)"
    else
        log_warn "Найдены зависимости в package.json"
        grep -A 10 '"dependencies"' package.json
    fi
    
    # Проверка скриптов
    if grep -q '"start"' package.json; then
        log_ok "Скрипт запуска найден"
    else
        log_warn "Скрипт запуска отсутствует"
    fi
else
    log_error "package.json не найден"
fi

# 4. Тест автономной системы на Linux
echo -e "\n🧪 Тест системы на OpenSUSE:"

if command -v node >&/dev/null; then
    node_version=$(node --version)
    log_ok "Node.js доступен: $node_version"
    
    # Проверка FFmpeg
    if [ -f "ffmpeg/linux-x64/ffmpeg" ]; then
        if [ -x "ffmpeg/linux-x64/ffmpeg" ]; then
            log_ok "FFmpeg исполняемый"
            
            # Тест версии
            version_output=$(./ffmpeg/linux-x64/ffmpeg -version 2>&1 | head -n 1)
            echo "   🎬 Версия: $version_output"
        else
            log_error "FFmpeg не исполняемый (chmod +x ffmpeg/linux-x64/ffmpeg)"
        fi
    else
        log_error "Linux FFmpeg отсутствует"
    fi
    
    # Быстрый тест сервера (без запуска)
    if node -c autonomous-server.js 2>/dev/null; then
        log_ok "autonomous-server.js синтаксически корректен"
    else
        log_error "Ошибка синтаксиса в autonomous-server.js"
    fi
    
else
    log_error "Node.js не установлен"
fi

# 5. Создание архива для Windows
echo -e "\n📦 Подготовка архива для Windows:"

archive_name="rtsp-monitor-windows-$(date +%Y%m%d).zip"

if command -v zip >&/dev/null; then
    echo "Создание архива $archive_name..."
    
    # Создаем временную папку
    temp_dir="rtsp-monitor-portable"
    mkdir -p "$temp_dir"
    
    # Копируем файлы
    cp autonomous-server.js "$temp_dir/"
    cp autonomous-rtsp-manager.js "$temp_dir/"
    cp index.html "$temp_dir/"
    cp package.json "$temp_dir/"
    
    # Копируем FFmpeg для Windows
    if [ -d "ffmpeg" ]; then
        cp -r ffmpeg "$temp_dir/"
    fi
    
    # Создаем стартовый скрипт для Windows
    cat > "$temp_dir/start.bat" << 'EOF'
@echo off
echo Starting RTSP Monitor System...
echo ================================

rem Проверка Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

rem Проверка FFmpeg
if not exist "ffmpeg\win64\ffmpeg.exe" (
    echo ERROR: Windows FFmpeg not found!
    echo Please download FFmpeg and place in ffmpeg\win64\
    pause
    exit /b 1
)

rem Запуск сервера
echo Starting server on http://localhost:3000
echo Login: admin/admin123 or operator/operator123
echo Press Ctrl+C to stop
node autonomous-server.js

pause
EOF

    # Создаем README для Windows
    cat > "$temp_dir/README.txt" << 'EOF'
RTSP Monitor - Система видеонаблюдения
=====================================

ТРЕБОВАНИЯ:
- Windows 7/8/10/11 (64-bit)
- Node.js 16+ (https://nodejs.org)

УСТАНОВКА:
1. Установите Node.js если не установлен
2. Распакуйте все файлы в папку
3. Запустите start.bat

ИСПОЛЬЗОВАНИЕ:
- Откройте браузер: http://localhost:3000
- Логин: admin / admin123 (администратор)
- Логин: operator / operator123 (оператор)

СТРУКТУРА:
- autonomous-server.js - основной сервер
- autonomous-rtsp-manager.js - обработка RTSP
- index.html - веб-интерфейс
- ffmpeg/win64/ffmpeg.exe - обработка видео
- config.json - автоматически создается

ПОДДЕРЖКА:
- Тестовая камера: rtsp://185.70.184.101:8554/cam91-99
- Логи в консоли
- Конфигурация через веб-интерфейс
EOF

    # Создаем архив
    zip -r "$archive_name" "$temp_dir" >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_ok "Архив создан: $archive_name"
        archive_size=$(du -h "$archive_name" | cut -f1)
        echo "   📊 Размер архива: $archive_size"
        
        # Показываем содержимое
        echo -e "\n📋 Содержимое архива:"
        unzip -l "$archive_name" | tail -n +4 | head -n -2
    else
        log_error "Ошибка создания архива"
    fi
    
    # Очистка
    rm -rf "$temp_dir"
else
    log_warn "zip не установлен, архив не создан"
    echo "   💡 Установите: zypper install zip"
fi

# 6. Инструкции для Windows тестирования
echo -e "\n🚀 Готовность к Windows тестированию:"
echo "======================================"

if [ -f "$archive_name" ]; then
    log_ok "Система готова к переносу на Windows"
    echo ""
    echo "📋 Следующие шаги:"
    echo "1. Скопируйте $archive_name на Windows машину"
    echo "2. Распакуйте архив в любую папку"
    echo "3. Установите Node.js если не установлен"
    echo "4. Запустите start.bat"
    echo "5. Откройте http://localhost:3000"
    echo ""
    echo "🔐 Тестовые учетные записи:"
    echo "   admin / admin123 (полный доступ)"
    echo "   operator / operator123 (только просмотр)"
    echo ""
    echo "📹 Тестовая RTSP камера:"
    echo "   rtsp://185.70.184.101:8554/cam91-99"
else
    log_warn "Архив не создан, скопируйте файлы вручную"
fi

echo -e "\n✨ Проверка завершена!"
