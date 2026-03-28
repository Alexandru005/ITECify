export function setupWsHandler(wss) {
    // Funcție ajutătoare care trimite tuturor numărul curent de utilizatori
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
        broadcastUserCount(); // Când cineva intră, actualizăm numărătoarea la toți

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw);

            // Retrimitem mesajul tuturor celorlalți (fie că e cod, schimbare de limbaj, etc.)
            for (const client of wss.clients) {
                if (client !== ws && client.readyState === 1) {
                    client.send(JSON.stringify(msg));
                }
            }
        });

        ws.on('close', () => {
            console.log('Client deconectat');
            broadcastUserCount(); // Când cineva iese, actualizăm numărătoarea
        });
    });
}