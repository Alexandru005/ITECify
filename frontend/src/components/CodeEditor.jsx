import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:3001';

export default function CodeEditor() {
    // State-uri
    const [language, setLanguage] = useState('python');
    const [isRunning, setIsRunning] = useState(false);
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');

    // Referințe
    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const editorRef = useRef(null); // Adăugat pentru AI
    const monacoRef = useRef(null); // Adăugat pentru AI
    const myId = useRef(Math.random().toString(36).substring(7)); // Generăm un ID rapid pentru test
    const remoteCursors = useRef(new Map()); // Map pentru a ține evidența decorațiunilor (cursoarelor)

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);

            if (msg.type === 'code-update') {
                if (editorRef.current && editorRef.current.getValue() !== msg.code) {
                    isRemoteUpdate.current = true;
                    setCode(msg.code);
                }
            }
            else if (msg.type === 'cursor-move') {
                updateRemoteCursor(msg.userId, msg.username, msg.position);
            }
            else if (msg.type === 'user-disconnected') {
                removeRemoteCursor(msg.userId);
            }
            // --- NOI ADĂUGĂRI PENTRU TERMINAL COMUN ---
            else if (msg.type === 'terminal-start') {
                setOutput(`> 💻 ${msg.username} execută codul...\n`);
                setIsRunning(true); // Blocăm butonul de Run și la noi
            }
            else if (msg.type === 'terminal-output') {
                setOutput(msg.output);
                setIsRunning(false); // Deblocăm butonul
            }
        };

        return () => ws.close();
    }, []);

    // Funcția care capturează instanța editorului pentru AI
    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Când tu muți cursorul, trimitem poziția către toți ceilalți
        editor.onDidChangeCursorPosition((e) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'cursor-move',
                    userId: myId.current,
                    username: `Hacker-${myId.current.substring(0, 3)}`, // Nume generat
                    position: e.position
                }));
            }
        });
    };

    const handleChange = (value) => {
        if (isRemoteUpdate.current) {
            // Resetăm flag-ul AICI, sincron, exact când Monaco a terminat de updatat interfața
            isRemoteUpdate.current = false;
            return;
        }
        setCode(value);
        wsRef.current?.send(JSON.stringify({ type: 'code-update', code: value }));
    };

    // Funcția de Run
    const handleRun = async () => {
        setIsRunning(true);
        setOutput('> Se execută codul...\n');

        // 1. Anunțăm colegii că AM PORNIT execuția
        wsRef.current?.send(JSON.stringify({
            type: 'terminal-start',
            username: `Hacker-${myId.current.substring(0, 3)}` // Numele generat la fel ca la cursoare
        }));

        try {
            const res = await fetch('http://localhost:3001/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language })
            });

            if (!res.ok) {
                throw new Error(`Eroare de la server (Status: ${res.status})`);
            }

            const data = await res.json();

            // Formatăm rezultatul
            const finalOutput = data.error
                ? `❌ Eroare de execuție:\n${data.error}`
                : (data.output || '✅ S-a executat cu succes, dar nu există output.');

            setOutput(finalOutput);

            // 2. Trimitem REZULTATUL (output-ul de la Docker) către toți colegii
            wsRef.current?.send(JSON.stringify({
                type: 'terminal-output',
                output: finalOutput
            }));

        } catch (err) {
            const errorMsg = `⚠️ Eroare de conexiune:\nNu m-am putut conecta la serverul de execuție. (${err.message})`;
            setOutput(errorMsg);

            // Trimitem și eroarea către colegi ca să fim sincronizați
            wsRef.current?.send(JSON.stringify({
                type: 'terminal-output',
                output: errorMsg
            }));
        } finally {
            setIsRunning(false);
        }
    };

    // Funcția de AI
    const askAI = async () => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        const position = editor.getPosition();
        const model = editor.getModel();

        const codeBefore = model.getValueInRange({
            startLineNumber: 1, startColumn: 1,
            endLineNumber: position.lineNumber, endColumn: position.column
        });
        const codeAfter = model.getValueInRange({
            startLineNumber: position.lineNumber, startColumn: position.column,
            endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount())
        });

        // --- 1. NOU: CREĂM CURSORUL AI-ULUI LOCAL ---
        const aiDecoration = editor.createDecorationsCollection();
        aiDecoration.set([{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            options: {
                className: 'ai-cursor',
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        }]);

        // --- 2. NOU: ANUNȚĂM ȘI COLEGII PRIN WEBSOCKET CĂ AI-UL SE GÂNDEȘTE ---
        wsRef.current?.send(JSON.stringify({
            type: 'cursor-move',
            userId: 'ai-agent-123', // ID fals pentru AI
            username: '🤖 AI',
            position: position
        }));

        let viewZoneId = null;
        const domNode = document.createElement('div');
        domNode.className = 'ai-suggestion-block';
        domNode.innerHTML = `
            <div class="ai-header" style="color: #f38ba8; animation: pulse 1.5s infinite;">
                ⏳ AI-ul analizează codul...
            </div>
        `;

        editor.changeViewZones((changeAccessor) => {
            viewZoneId = changeAccessor.addZone({
                afterLineNumber: position.lineNumber,
                heightInLines: 3,
                domNode: domNode,
            });
        });

        try {
            const response = await fetch('http://localhost:3001/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Am adăugat variabila `language` aici ca AI-ul să respecte dropdown-ul!
                body: JSON.stringify({ codeBefore, codeAfter, language })
            });

            const data = await response.json();

            // --- 3. NOU: ȘTERGEM CURSORUL AI-ULUI (Răspunsul a venit) ---
            aiDecoration.clear();
            wsRef.current?.send(JSON.stringify({
                type: 'user-disconnected',
                userId: 'ai-agent-123' // Îi spunem serverului să scoată cursorul AI-ului și de la colegi
            }));

            if (data.suggestion) {
                domNode.innerHTML = `
                    <div class="ai-header">✨ Sugestie AI</div>
                    <pre class="ai-code">${data.suggestion}</pre>
                    <div class="ai-actions">
                        <button class="ai-btn accept">✔️ Accept</button>
                        <button class="ai-btn reject">❌ Reject</button>
                    </div>
                `;

                const linesCount = data.suggestion.split('\n').length;
                editor.changeViewZones(accessor => {
                    accessor.removeZone(viewZoneId);
                    viewZoneId = accessor.addZone({
                        afterLineNumber: position.lineNumber,
                        heightInLines: linesCount + 3,
                        domNode: domNode,
                    });



                });

                domNode.querySelector('.accept').onclick = () => {
                    // 1. Inserăm codul în editor exact unde e cursorul
                    editor.executeEdits("AI_INSERT", [{
                        range: new monaco.Range(position.lineNumber + 1, 1, position.lineNumber + 1, 1),
                        text: data.suggestion + '\n'
                    }]);

                    // 2. Închidem block-ul vizual
                    editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
                };

                domNode.querySelector('.reject').onclick = () => {
                    editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
                };
            }
        } catch (error) {
            console.error("Eroare la procesarea AI:", error);

            // --- 4. NOU: ȘTERGEM CURSORUL AI-ULUI ȘI ÎN CAZ DE EROARE ---
            aiDecoration.clear();
            wsRef.current?.send(JSON.stringify({
                type: 'user-disconnected',
                userId: 'ai-agent-123'
            }));

            editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
            alert("A apărut o problemă. Apasă F12 și uită-te în tab-ul Console pentru detalii.");
        }
    };

    const updateRemoteCursor = (userId, username, position) => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        // Dacă acest utilizator nu are o colecție de decorațiuni, îi creăm una
        if (!remoteCursors.current.has(userId)) {
            remoteCursors.current.set(userId, editor.createDecorationsCollection());
        }

        const collection = remoteCursors.current.get(userId);

        // Actualizăm poziția decorațiunii (cursorului) pe ecran
        collection.set([{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            options: {
                className: 'remote-cursor', // Numele clasei CSS
                hoverMessage: { value: `**${username}**` }, // Numele apare când ții mouse-ul pe cursor
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        }]);
    };

    const removeRemoteCursor = (userId) => {
        if (remoteCursors.current.has(userId)) {
            remoteCursors.current.get(userId).clear(); // Șterge vizual
            remoteCursors.current.delete(userId);      // Șterge din memorie
        }
    };

    return (



        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e' }}>

            {/* INJECTĂM CSS-UL PENTRU CURSOARE DIRECT AICI */}
            <style>{`
                .remote-cursor {
                    border-left: 2px solid #00ff00; /* Verde electric */
                    position: absolute;
                    z-index: 10;
                    pointer-events: none; /* Previne interceptarea click-urilor tale */
                    animation: blink 1s step-end infinite;
                }

                @keyframes blink {
                    50% { border-color: transparent; }
                }
                
                .ai-cursor {
                    border-left: 2px solid #a855f7; /* Un mov specific inteligenței artificiale */
                    position: absolute;
                    z-index: 15;
                    pointer-events: none;
                    animation: blink 1s step-end infinite;
                }
                
                /* Eticheta care apare deasupra cursorului mov */
                .ai-cursor::after {
                    content: '🤖 AI Gândește...';
                    position: absolute;
                    top: -20px;
                    left: 0;
                    background: #a855f7;
                    color: white;
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 4px;
                    white-space: nowrap;
                    font-weight: bold;
                }
            `}</style>

            {/* Toolbar cu elementele lui Alex și butonul nostru AI */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px', gap: '15px', color: 'white', borderBottom: '1px solid #333' }}>
                <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', backgroundColor: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer' }}
                >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript (Node.js)</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                </select>

                <button
                    onClick={handleRun}
                    disabled={isRunning}
                    style={{
                        padding: '8px 16px',
                        cursor: isRunning ? 'wait' : 'pointer',
                        opacity: isRunning ? 0.7 : 1,
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: 'bold'
                    }}
                >
                    {isRunning ? '⏳ Se execută...' : '▶ Run Code'}
                </button>

                <button onClick={askAI} style={{ padding: '8px 16px', background: '#9c27b0', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
                    ✨ Cere AI
                </button>
            </div>

            {/* Editorul Monaco */}
            <div style={{ flex: 1 }}>
                <Editor
                    height="100%"
                    language={language}
                    value={code}
                    onChange={handleChange}
                    onMount={handleEditorMount} // Foarte important pentru AI!
                    theme="vs-dark"
                />
            </div>

            {/* Consola de Output */}
            <pre style={{ height: '20vh', padding: '15px', background: '#000', color: '#00ff00', margin: 0, overflowY: 'auto', borderTop: '2px solid #333' }}>
                {output || '> Aștept cod pentru execuție...'}
            </pre>
        </div>
    );
}