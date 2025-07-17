// Дополнение к серверу для тестового интерфейса
const fs = require('fs');
const path = require('path');

// Добавляем в handleRequest функцию:
if (pathname === '/test') {
    const testPath = path.join(__dirname, 'test-interface.html');
    if (fs.existsSync(testPath)) {
        const content = fs.readFileSync(testPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(content);
    } else {
        this.sendError(res, 404, 'Test interface not found');
    }
    return;
}
