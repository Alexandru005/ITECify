import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:3001';

export default function CodeEditor() {
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');
    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false); // previne bucla infinită

    // Referințe noi pentru API-ul Monaco
    const editorRef = useRef(null);
    const monacoRef = useRef(null);

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

    // Funcția care capturează instanța editorului la încărcare
    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
    };

    const handleChange = (value) => {
        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
            return; // nu re-trimite ce ai primit
        }
        setCode(value);
        wsRef.current?.send(JSON.stringify({ type: 'code-update', code: value }));
    };

    const handleRun = async () => {
        const res = await fetch('http://localhost:3001/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, language: 'python' }),
        });
        const data = await res.json();
        setOutput(data.output);
    };

    // --- LOGICA PENTRU BLOCUL AI ---
    const askAI = async () => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        const position = editor.getPosition();
        const model = editor.getModel();

        // Extragem contextul
        const codeBefore = model.getValueInRange({
            startLineNumber: 1, startColumn: 1,
            endLineNumber: position.lineNumber, endColumn: position.column
        });
        const codeAfter = model.getValueInRange({
            startLineNumber: position.lineNumber, startColumn: position.column,
            endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount())
        });

        // Creăm elementul DOM o singură dată
        let viewZoneId = null;
        const domNode = document.createElement('div');
        domNode.className = 'ai-suggestion-block';
        domNode.innerHTML = `
            <div class="ai-header" style="color: #f38ba8; animation: pulse 1.5s infinite;">
                ⏳ AI-ul analizează codul...
            </div>
        `;

        // Afișăm Loading-ul
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
                body: JSON.stringify({ codeBefore, codeAfter, language: 'python' })
            });

            const data = await response.json();

            if (data.suggestion) {
                // Actualizăm interiorul blocului cu sugestia primită
                domNode.innerHTML = `
                    <div class="ai-header">✨ Sugestie AI</div>
                    <pre class="ai-code">${data.suggestion}</pre>
                    <div class="ai-actions">
                        <button class="ai-btn accept">✔️ Accept</button>
                        <button class="ai-btn reject">❌ Reject</button>
                    </div>
                `;

                // Recalculăm înălțimea pentru a încăpea tot codul
                const linesCount = data.suggestion.split('\n').length;
                editor.changeViewZones(accessor => {
                    accessor.removeZone(viewZoneId);
                    viewZoneId = accessor.addZone({
                        afterLineNumber: position.lineNumber,
                        heightInLines: linesCount + 3,
                        domNode: domNode,
                    });
                });

                // Setăm acțiunile folosind clase (metodă mult mai sigură)
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* Zona de butoane */}
            <div style={{ display: 'flex', gap: '10px', padding: '8px', background: '#1e1e1e' }}>
                <button onClick={handleRun} style={{ padding: '8px 16px', cursor: 'pointer' }}>
                    ▶ Run Code
                </button>
                <button onClick={askAI} style={{ padding: '8px 16px', background: '#9c27b0', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    ✨ Cere AI
                </button>
            </div>

            <Editor
                height="70vh"
                defaultLanguage="python"
                value={code}
                onChange={handleChange}
                onMount={handleEditorMount} // <- Am adăugat onMount aici
                theme="vs-dark"
            />

            <pre style={{ padding: '8px', background: '#1e1e1e', color: '#d4d4d4', flex: 1, margin: 0, borderTop: '1px solid #333' }}>
                {output || 'Output-ul apare aici...'}
            </pre>
        </div>
    );
}