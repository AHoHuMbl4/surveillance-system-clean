#!/bin/bash

echo "🧪 Тест видео стриминга после исправлений"
echo "========================================"

# Проверка структуры
echo "📁 Проверка структуры проекта..."
echo "temp_streams/: $([ -d temp_streams ] && echo '✅ Существует' || echo '❌ Отсутствует')"
echo "rtsp-decoder.js: $([ -f rtsp-decoder.js ] && echo '✅ Существует' || echo '❌ Отсутствует')"
echo "index.html: $([ -f index.html ] && echo '✅ Существует' || echo '❌ Отсутствует')"

# Проверка прав
echo ""
echo "🔐 Проверка прав доступа..."
echo "temp_streams права: $(stat -c %a temp_streams/ 2>/dev/null || echo 'н/д')"
echo "Запись в temp_streams: $([ -w temp_streams ] && echo '✅ Разрешена' || echo '❌ Запрещена')"

# Проверка FFmpeg
echo ""
echo "🎬 Проверка FFmpeg..."
if command -v ffmpeg &> /dev/null; then
    echo "FFmpeg: ✅ $(ffmpeg -version 2>/dev/null | head -n 1)"
    echo "HLS поддержка: $(ffmpeg -formats 2>/dev/null | grep -q hls && echo '✅ Есть' || echo '❌ Нет')"
else
    echo "FFmpeg: ❌ Не найден в системе"
fi

# Запуск приложения для теста
echo ""
echo "🚀 Запуск приложения для теста..."
echo "Приложение запустится в фоне на 30 секунд для тестирования..."

npm start &
APP_PID=$!

sleep 5

echo ""
echo "🔬 Тестирование API..."

# Тест API статуса
echo "📊 Статус сервера:"
curl -s http://localhost:3000/api/cameras | jq . 2>/dev/null || echo "API недоступен"

# Тест запуска потока
echo ""
echo "📡 Запуск тестового потока..."
response=$(curl -s -X POST http://localhost:3000/api/stream/start \
     -H "Content-Type: application/json" \
     -d '{"streamId": "test_480p", "rtspUrl": "rtsp://185.70.184.101:8554/cam91-99", "quality": "low"}' || echo "error")

echo "Ответ API: $response"

sleep 15

# Проверка создания файлов
echo ""
echo "📁 Проверка HLS файлов..."
if [ -d "temp_streams/test_480p" ]; then
    echo "✅ Директория потока создана"
    echo "Содержимое:"
    ls -la temp_streams/test_480p/ || echo "Директория пуста"
    
    if [ -f "temp_streams/test_480p/playlist.m3u8" ]; then
        echo ""
        echo "✅ Playlist найден, первые строки:"
        head -n 5 temp_streams/test_480p/playlist.m3u8
    else
        echo "❌ Playlist.m3u8 не создан"
    fi
else
    echo "❌ Директория потока не создана"
fi

# Остановка
echo ""
echo "🛑 Остановка тестового приложения..."
kill $APP_PID 2>/dev/null

echo ""
echo "📊 Тест завершен!"
echo ""
echo "🎯 Ожидаемые результаты:"
echo "  ✅ Директория temp_streams/test_480p создана"
echo "  ✅ Файл playlist.m3u8 существует"
echo "  ✅ HLS сегменты (.ts) присутствуют"
echo "  ✅ Нет ошибок 'Failed to open file'"
