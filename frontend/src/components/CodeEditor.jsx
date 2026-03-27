import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:3001';

export default function CodeEditor() {
    // State-uri combinate (Alex + Noi)
    const [language, setLanguage] = useState('python');
    const [isRunning, setIsRunning] = useState(false);
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');

    // Referințe combinate
    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const editorRef = useRef(null); // Adăugat pentru AI
    const monacoRef = useRef(null); // Adăugat pentru AI

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'code-update') {
                isRemoteUpdate.current = true;
                setCode(msg.code);
            }
        };

        return () => ws.close();
    }, []);

    // Funcția care capturează instanța editorului pentru AI
    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
    };

    const handleChange = (value) => {
        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
            return;
        }
        setCode(value);
        wsRef.current?.send(JSON.stringify({ type: 'code-update', code: value }));
    };

    // Funcția de Run a lui Alex (cu stări și erori mai bune)
    const handleRun = async () => {
        setIsRunning(true);
        setOutput('Se execută codul...\n');

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

            if (data.error) {
                setOutput(`Eroare de execuție:\n${data.error}`);
            } else {
                setOutput(data.output || 'S-a executat cu succes, dar nu există output.');
            }

        } catch (err) {
            setOutput(`Eroare de conexiune:\nNu m-am putut conecta la serverul de execuție. (${err.message})`);
        } finally {
            setIsRunning(false);
        }
    };

    // Funcția noastră de AI
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
                    editor.executeEdits("AI_INSERT", [{
                        range: new monaco.Range(position.lineNumber + 1, 1, position.lineNumber + 1, 1),
                        text: data.suggestion + '\n'
                    }]);
                    editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
                };

                domNode.querySelector('.reject').onclick = () => {
                    editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
                };
            }
        } catch (error) {
            console.error("Eroare la procesarea AI:", error);
            editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
            alert("A apărut o problemă. Apasă F12 și uită-te în tab-ul Console pentru detalii.");
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e' }}>

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