#!/bin/bash

# Тест запуска реального RTSP потока
# Проверяем что всё работает и запускаем камеру

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_step() { echo -e "${BLUE}🔧 $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo "🎥 Тест реального RTSP потока"
echo "============================"

cd rtsp-monitor-electron

# 1. Проверка что сервер запущен
check_server() {
    log_step "Проверка сервера..."
    
    if curl -s http://localhost:3000/api/system-status > /dev/null; then
        log_info "Сервер работает на порту 3000"
        
        # Получаем статус
        status=$(curl -s http://localhost:3000/api/system-status)
        echo "📊 Статус: $status"
    else
        log_warn "Сервер не отвечает на порту 3000"
        echo "💡 Убедитесь что Electron приложение запущено"
        exit 1
    fi
}

# 2. Получение списка камер
get_cameras() {
    log_step "Получение списка камер..."
    
    cameras=$(curl -s http://localhost:3000/api/cameras)
    echo "📹 Камеры: $cameras"
    
    # Проверяем что есть тестовая камера
    if echo "$cameras" | grep -q "185.70.184.101"; then
        log_info "Тестовая камера найдена"
    else
        log_warn "Тестовая камера не найдена в списке"
    fi
}

# 3. Запуск RTSP потока через API
start_rtsp_stream() {
    log_step "Запуск RTSP потока через API..."
    
    echo "🚀 Запуск потока камеры ID=1 (качество=low)..."
    
    response=$(curl -s -X POST http://localhost:3000/api/stream/start \
        -H "Content-Type: application/json" \
        -d '{"cameraId": 1, "quality": "low"}')
    
    echo "📊 Ответ сервера: $response"
    
    if echo "$response" | grep -q '"success":true'; then
        log_info "RTSP поток запущен успешно!"
        
        # Извлекаем streamId и streamUrl
        streamId=$(echo "$response" | grep -o '"streamId":"[^"]*"' | cut -d'"' -f4)
        streamUrl=$(echo "$response" | grep -o '"streamUrl":"[^"]*"' | cut -d'"' -f4)
        
        echo "🎬 Stream ID: $streamId"
        echo "🔗 Stream URL: $streamUrl"
        
        # Ждем немного для генерации HLS файлов
        log_step "Ожидание генерации HLS файлов (10 секунд)..."
        sleep 10
        
        # Проверяем создание файлов
        check_hls_files "$streamId"
        
    else
        log_warn "Ошибка запуска RTSP потока"
        echo "❌ Ответ: $response"
    fi
}

# 4. Проверка создания HLS файлов
check_hls_files() {
    local streamId=$1
    log_step "Проверка HLS файлов для потока $streamId..."
    
    local streamDir="./temp_streams/$streamId"
    
    if [ -d "$streamDir" ]; then
        log_info "Директория потока создана: $streamDir"
        
        # Проверяем playlist.m3u8
        if [ -f "$streamDir/playlist.m3u8" ]; then
            log_info "Playlist файл создан"
            echo "📄 Содержимое playlist.m3u8:"
            head -n 10 "$streamDir/playlist.m3u8"
        else
            log_warn "Playlist файл не найден"
        fi
        
        # Проверяем сегменты
        local segment_count=$(ls "$streamDir"/*.ts 2>/dev/null | wc -l)
        if [ "$segment_count" -gt 0 ]; then
            log_info "Найдено $segment_count HLS сегментов"
        else
            log_warn "HLS сегменты не найдены"
        fi
        
        # Показываем содержимое директории
        echo "📁 Содержимое $streamDir:"
        ls -la "$streamDir"
        
    else
        log_warn "Директория потока не создана: $streamDir"
    fi
}

# 5. Проверка статуса потоков
check_streams_status() {
    log_step "Проверка статуса всех потоков..."
    
    status=$(curl -s http://localhost:3000/api/streams/status)
    echo "📊 Статус потоков: $status"
    
    if echo "$status" | grep -q '"status":"streaming"'; then
        log_info "Есть активные потоки в режиме streaming"
    elif echo "$status" | grep -q '"status":"connecting"'; then
        log_warn "Потоки в режиме подключения, ждите..."
    else
        log_warn "Нет активных потоков"
    fi
}

# 6. Тест прямого доступа к HLS потоку
test_hls_access() {
    log_step "Тест прямого доступа к HLS потоку..."
    
    # Пробуем получить HLS плейлист
    local stream_url="http://localhost:3000/stream/1_low/playlist.m3u8"
    
    if curl -s "$stream_url" > /dev/null; then
        log_info "HLS поток доступен по адресу: $stream_url"
        
        echo "📄 Первые строки плейлиста:"
        curl -s "$stream_url" | head -n 5
        
    else
        log_warn "HLS поток недоступен по адресу: $stream_url"
    fi
}

# 7. Показ FFmpeg процессов
show_ffmpeg_processes() {
    log_step "Проверка FFmpeg процессов..."
    
    local ffmpeg_count=$(ps aux | grep ffmpeg | grep -v grep | wc -l)
    
    if [ "$ffmpeg_count" -gt 0 ]; then
        log_info "Найдено $ffmpeg_count активных FFmpeg процессов"
        echo "🎬 FFmpeg процессы:"
        ps aux | grep ffmpeg | grep -v grep | while read line; do
            echo "  $line"
        done
    else
        log_warn "Активные FFmpeg процессы не найдены"
    fi
}

# 8. Инструкции для браузера
show_browser_instructions() {
    echo ""
    log_step "📋 Инструкции для тестирования в браузере:"
    echo ""
    echo "1. Откройте браузер: http://localhost:3000"
    echo "2. Нажмите кнопку '▶️ Запустить (480p)' для камеры"
    echo "3. Через 5-10 секунд должно появиться видео"
    echo ""
    echo "🔗 Прямая ссылка на HLS поток:"
    echo "   http://localhost:3000/stream/1_low/playlist.m3u8"
    echo ""
    echo "🎥 Если видео не появляется:"
    echo "   - Проверьте консоль браузера (F12)"
    echo "   - Проверьте логи в терминале Electron"
    echo "   - Убедитесь что FFmpeg процесс запущен"
}

# Основная функция
main() {
    check_server
    get_cameras
    start_rtsp_stream
    sleep 5
    check_streams_status
    test_hls_access
    show_ffmpeg_processes
    show_browser_instructions
    
    echo ""
    log_info "🎉 Тест завершен!"
    echo ""
    echo "🎯 Ожидаемый результат:"
    echo "  ✅ FFmpeg процесс должен быть запущен"
    echo "  ✅ HLS файлы должны генерироваться"
    echo "  ✅ В Electron окне должно появиться видео"
    echo ""
    echo "📊 Если видео не появилось, проверьте логи выше"
}

# Запуск теста
main
