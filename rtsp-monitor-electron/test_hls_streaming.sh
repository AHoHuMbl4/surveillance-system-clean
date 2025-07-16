#!/bin/bash

echo "🧪 Тестирование HLS потоков"
echo "=========================="

# Базовый URL
BASE_URL="http://localhost:3000"

# 1. Получение списка камер
echo -e "\n📹 Получение списка камер..."
cameras=$(curl -s $BASE_URL/api/cameras)
echo "$cameras" | jq '.[0]' || echo "$cameras"

# 2. Запуск тестового потока
echo -e "\n🚀 Запуск тестового RTSP потока..."
test_stream_id="test_hls_$(date +%s)"
response=$(curl -s -X POST $BASE_URL/api/stream/start \
    -H "Content-Type: application/json" \
    -d "{
        \"streamId\": \"$test_stream_id\",
        \"rtspUrl\": \"rtsp://185.70.184.101:8554/cam91-99\",
        \"quality\": \"low\"
    }")

echo "Ответ сервера: $response"

# 3. Ожидание инициализации
echo -e "\n⏳ Ожидание создания HLS файлов (15 секунд)..."
sleep 15

# 4. Проверка директории
echo -e "\n📁 Проверка директории потока..."
stream_dir="temp_streams/$test_stream_id"
if [ -d "$stream_dir" ]; then
    echo "✅ Директория создана: $stream_dir"
    echo "Содержимое:"
    ls -la "$stream_dir/"
else
    echo "❌ Директория не создана"
fi

# 5. Проверка плейлиста
echo -e "\n📄 Проверка HLS плейлиста..."
if [ -f "$stream_dir/playlist.m3u8" ]; then
    echo "✅ Плейлист создан"
    echo "Первые строки:"
    head -n 10 "$stream_dir/playlist.m3u8"
else
    echo "❌ Плейлист не создан"
fi

# 6. Тест HTTP доступа к плейлисту
echo -e "\n🌐 Проверка HTTP доступа..."
playlist_url="$BASE_URL/stream/$test_stream_id/playlist.m3u8"
echo "URL: $playlist_url"

http_response=$(curl -s -o /dev/null -w "%{http_code}" "$playlist_url")
echo "HTTP код: $http_response"

if [ "$http_response" = "200" ]; then
    echo "✅ Плейлист доступен по HTTP"
    echo "Содержимое:"
    curl -s "$playlist_url" | head -n 10
else
    echo "❌ Плейлист недоступен (код $http_response)"
fi

# 7. Проверка сегментов
echo -e "\n📹 Проверка TS сегментов..."
first_segment=$(ls "$stream_dir"/*.ts 2>/dev/null | head -n 1)
if [ -n "$first_segment" ]; then
    segment_name=$(basename "$first_segment")
    segment_url="$BASE_URL/stream/$test_stream_id/$segment_name"
    echo "Проверка сегмента: $segment_url"
    
    segment_response=$(curl -s -o /dev/null -w "%{http_code}" "$segment_url")
    echo "HTTP код сегмента: $segment_response"
    
    if [ "$segment_response" = "200" ]; then
        echo "✅ Сегменты доступны по HTTP"
    else
        echo "❌ Сегменты недоступны"
    fi
else
    echo "❌ TS сегменты не найдены"
fi

# 8. Остановка потока
echo -e "\n🛑 Остановка тестового потока..."
curl -s -X POST $BASE_URL/api/stream/stop \
    -H "Content-Type: application/json" \
    -d "{\"streamId\": \"$test_stream_id\"}"

echo -e "\n✅ Тест завершен!"
echo ""
echo "📊 Итоги теста:"
echo "  - Директория потока: $([ -d "$stream_dir" ] && echo "✅" || echo "❌")"
echo "  - HLS плейлист: $([ -f "$stream_dir/playlist.m3u8" ] && echo "✅" || echo "❌")"
echo "  - HTTP доступ: $([ "$http_response" = "200" ] && echo "✅" || echo "❌")"
echo "  - TS сегменты: $([ -n "$first_segment" ] && echo "✅" || echo "❌")"
