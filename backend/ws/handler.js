export function setupWsHandler(wss) {
    // --- STOCARE STARE CURENTĂ (Sursa Adevărului) ---
    // Serverul ține minte mereu ultima stare a editorului
    let currentCode = '# scrie cod aici\n';
    let currentLanguage = 'python';
    let currentFileName = 'fisier_nou.txt';
    let currentOutput = '';

    const broadcastUserCount = () => {
        const count = wss.clients.size;
        const msg = JSON.stringify({ type: 'users-count', count });
        for (const client of wss.clients) {
            if (client.readyState === 1) { // 1 înseamnă OPEN
                client.send(msg);
            }
        }
    };

    wss.on('connection', (ws) => {
        console.log('Client conectat, total:', wss.clients.size);
        broadcastUserCount();

        // --- SINCRONIZARE INIȚIALĂ PENTRU NOUL VENIT ---
        // Imediat cum se conectează, îi trimitem starea la zi a proiectului
        ws.send(JSON.stringify({ type: 'code-update', code: currentCode }));
        ws.send(JSON.stringify({ type: 'language-update', language: currentLanguage }));
        ws.send(JSON.stringify({ type: 'file-name-update', fileName: currentFileName }));
        if (currentOutput) {
            ws.send(JSON.stringify({ type: 'output-update', output: currentOutput }));
        }

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw);

            // --- ACTUALIZĂM "CAIETUL DE NOTIȚE" AL SERVERULUI ---
            // Când primim o modificare de la cineva, o salvăm în memorie
            if (msg.type === 'code-update') {
                currentCode = msg.code;
            } else if (msg.type === 'language-update') {
                currentLanguage = msg.language;
            } else if (msg.type === 'file-name-update') {
                currentFileName = msg.fileName;
            } else if (msg.type === 'output-update') {
                currentOutput = msg.output;
            }

            // Retrimitem mesajul tuturor CELORLALȚI colegi
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