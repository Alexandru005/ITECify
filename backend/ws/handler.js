export function setupWsHandler(wss) {
    let currentCode = 'print("Hello World!")';
    let currentLanguage = 'python';
    let currentFileName = 'fisier_nou.txt';
    let currentOutput = '';
    let currentAiHighlight = null; // Memorează liniile colorate de AI

    const broadcastUserCount = () => {
        const count = wss.clients.size;
        const msg = JSON.stringify({ type: 'users-count', count });
        for (const client of wss.clients) {
            if (client.readyState === 1) {
                client.send(msg);
            }
        }
    };

    wss.on('connection', (ws) => {
        console.log('Client conectat, total:', wss.clients.size);
        broadcastUserCount();

        // Trimitem starea inițială inclusiv highlight-ul de AI
        ws.send(JSON.stringify({ type: 'code-update', code: currentCode }));
        ws.send(JSON.stringify({ type: 'language-update', language: currentLanguage }));
        ws.send(JSON.stringify({ type: 'file-name-update', fileName: currentFileName }));
        if (currentOutput) ws.send(JSON.stringify({ type: 'output-update', output: currentOutput }));
        if (currentAiHighlight) ws.send(JSON.stringify({ type: 'ai-accepted', startLine: currentAiHighlight.startLine, endLine: currentAiHighlight.endLine }));

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw);

            if (msg.type === 'code-update') {
                currentCode = msg.code;
            } else if (msg.type === 'language-update') {
                currentLanguage = msg.language;
            } else if (msg.type === 'file-name-update') {
                currentFileName = msg.fileName;
            } else if (msg.type === 'output-update') {
                currentOutput = msg.output;
            } else if (msg.type === 'ai-accepted') {
                // Salvăm ce linii a generat AI-ul
                currentAiHighlight = { startLine: msg.startLine, endLine: msg.endLine };
            }

            // Trimitem tuturor celorlalți
            for (const client of wss.clients) {
                if (client !== ws && client.readyState === 1) {
                    client.send(JSON.stringify(msg));
                }
            }
        });

        ws.on('close', () => {
            console.log('Client deconectat');
            broadcastUserCount();
        });
    });
}