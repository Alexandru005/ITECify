import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { setupWsHandler } from './ws/handler.js';
import runRouter from './routes/run.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/run', runRouter);

const server = createServer(app);
const wss = new WebSocketServer({ server });
setupWsHandler(wss);

app.post('/ai', async (req, res) => {
    // Acum primim codul împărțit în două
    const { codeBefore, codeAfter, language } = req.body;

    // Prompt inteligent care folosește contextul de sus și de jos
    const prompt = `Ești un asistent de programare expert. Utilizatorul scrie cod în ${language}.
    Trebuie să completezi codul care lipsește exact la poziția cursorului.
    
    --- CODUL DE DEASUPRA CURSORULUI ---
    ${codeBefore}

    --- CODUL DE SUB CURSOR ---
    ${codeAfter}

    Generează DOAR codul care trebuie inserat la mijloc.
    REGULĂ STRICTĂ: Răspunde STRICT doar cu codul necesar. NU folosi formatare markdown (ex: \`\`\`python).
    NU scrie texte introductive sau explicații.`;

    try {
        console.log(`Se generează sugestia AI...`);

        const response = await fetch('http://127.0.0.1:11434/api/generate', {            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen2.5-coder:7b', // Sau modelul tău
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) throw new Error("Eroare de la Ollama");

        const data = await response.json();

        let cleanSuggestion = data.response.trim();
        if (cleanSuggestion.startsWith('```')) {
            cleanSuggestion = cleanSuggestion.replace(/```[a-z]*\n/g, '').replace(/```/g, '');
        }

        res.json({ suggestion: cleanSuggestion });

    } catch (error) {
        console.error("Eroare Ollama:", error);
        res.status(500).json({ error: "Eroare la generarea codului" });
    }
});

server.listen(3001, () => console.log('Backend pornit pe portul 3001'));