export function setupWsHandler(wss) {
    wss.on('connection', (ws) => {
        console.log('Client conectat, total:', wss.clients.size);

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw);

            for (const client of wss.clients) {
                if (client !== ws && client.readyState === 1) {
                    client.send(JSON.stringify(msg));
                }
            }
        });

        ws.on('close', () => {
            console.log('Client deconectat');
        });
    });
}