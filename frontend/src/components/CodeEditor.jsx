import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:3001';

export default function CodeEditor() {
    const [language, setLanguage] = useState('python');
    const [isRunning, setIsRunning] = useState(false);
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    // --- STĂRI NOI PENTRU COLABORARE ---
    const [connectedUsers, setConnectedUsers] = useState(1);
    const [fileName, setFileName] = useState('fisier_nou.txt');

    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);

            // Ascultăm noile tipuri de mesaje
            if (msg.type === 'code-update') {
                isRemoteUpdate.current = true;
                setCode(msg.code);
            } else if (msg.type === 'users-count') {
                setConnectedUsers(msg.count);
            } else if (msg.type === 'language-update') {
                setLanguage(msg.language); // Se schimbă limba automat dacă cineva o schimbă
            } else if (msg.type === 'file-name-update') {
                setFileName(msg.fileName); // Se schimbă numele fișierului automat
            } else if (msg.type === 'output-update') {
                setOutput(msg.output);
            }
        };

        return () => ws.close();
    }, []);

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

    // Funcție care se ocupă de schimbarea limbajului din Dropdown și anunță pe toată lumea
    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        setLanguage(newLang);
        wsRef.current?.send(JSON.stringify({ type: 'language-update', language: newLang }));
    };

    const handleRun = async () => {
        setIsRunning(true);

        // 1. Anunțăm pe toți că execuția a început
        const startMsg = '> Se execută codul...\n';
        setOutput(startMsg);
        wsRef.current?.send(JSON.stringify({ type: 'output-update', output: startMsg }));

        try {
            const res = await fetch('http://localhost:3001/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language })
            });

            if (!res.ok) throw new Error(`Eroare de la server (Status: ${res.status})`);

            const data = await res.json();

            // 2. Pregătim rezultatul final
            const finalOutput = data.error
                ? `Eroare de execuție:\n${data.error}`
                : (data.output || 'S-a executat cu succes, dar nu există output.');

            // 3. Afișăm la noi și trimitem la restul!
            setOutput(finalOutput);
            wsRef.current?.send(JSON.stringify({ type: 'output-update', output: finalOutput }));

        } catch (err) {
            const errorMsg = `Eroare de conexiune:\nNu m-am putut conecta la serverul de execuție. (${err.message})`;
            setOutput(errorMsg);
            wsRef.current?.send(JSON.stringify({ type: 'output-update', output: errorMsg }));
        } finally {
            setIsRunning(false);
        }
    };

    const askAI = async () => {
        // ... Logica ta de AI rămâne neschimbată
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        const position = editor.getPosition();
        const model = editor.getModel();

        const codeBefore = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const codeAfter = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()) });

        let viewZoneId = null;
        const domNode = document.createElement('div');
        domNode.className = 'ai-suggestion-block';
        domNode.innerHTML = `<div class="ai-header" style="color: #f38ba8; animation: pulse 1.5s infinite;">⏳ AI-ul analizează codul...</div>`;

        editor.changeViewZones((changeAccessor) => { viewZoneId = changeAccessor.addZone({ afterLineNumber: position.lineNumber, heightInLines: 3, domNode: domNode }); });

        try {
            const response = await fetch('http://localhost:3001/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                    viewZoneId = accessor.addZone({ afterLineNumber: position.lineNumber, heightInLines: linesCount + 3, domNode: domNode });
                });

                domNode.querySelector('.accept').onclick = () => {
                    editor.executeEdits("AI_INSERT", [{ range: new monaco.Range(position.lineNumber + 1, 1, position.lineNumber + 1, 1), text: data.suggestion + '\n' }]);
                    editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
                };

                domNode.querySelector('.reject').onclick = () => {
                    editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
                };
            }
        } catch (error) {
            console.error("Eroare la AI:", error);
            editor.changeViewZones(accessor => accessor.removeZone(viewZoneId));
            alert("A apărut o problemă cu AI-ul.");
        }
    };

    // --- PROCESARE FIȘIERE (ACUM ANUNȚĂ PE TOȚI DE NUME ȘI LIMBAJ) ---
    const processFile = (file) => {
        if (!file) return;

        // Setăm și trimitem noul nume de fișier
        setFileName(file.name);
        wsRef.current?.send(JSON.stringify({ type: 'file-name-update', fileName: file.name }));

        // Detectăm limbajul și anunțăm pe toți ceilalți
        const ext = file.name.split('.').pop().toLowerCase();
        const extMap = { 'py': 'python', 'js': 'javascript', 'cpp': 'cpp', 'c': 'cpp', 'java': 'java' };
        if (extMap[ext]) {
            setLanguage(extMap[ext]);
            wsRef.current?.send(JSON.stringify({ type: 'language-update', language: extMap[ext] }));
        }

        // Citim conținutul și îl trimitem
        const reader = new FileReader();
        reader.onload = (event) => {
            const fileContent = event.target.result;
            setCode(fileContent);
            wsRef.current?.send(JSON.stringify({ type: 'code-update', code: fileContent }));
        };
        reader.readAsText(file);
    };

    // Evenimente Drag & Drop
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        processFile(e.dataTransfer.files[0]);
    };

    // Evenimente Upload
    const handleUploadClick = () => fileInputRef.current?.click();
    const handleFileSelect = (e) => {
        processFile(e.target.files[0]);
        e.target.value = null;
    };

    // Descărcarea folosește acum numele real al fișierului!
    const handleDownload = () => {
        const extMap = { 'python': 'py', 'javascript': 'js', 'cpp': 'cpp', 'java': 'java' };
        const fallbackExt = extMap[language] || 'txt';

        // Dacă fișierul are deja o extensie în nume, o păstrăm. Altfel punem extensia default.
        const finalFileName = fileName.includes('.') ? fileName : `${fileName}.${fallbackExt}`;

        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFileName;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e', position: 'relative' }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)', color: '#4CAF50',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    fontSize: '32px', fontWeight: 'bold', zIndex: 1000, border: '4px dashed #4CAF50'
                }}>
                    📂 Lasă fișierul aici pentru a-l încărca!
                </div>
            )}

            {/* TOOLBAR */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 15px', gap: '15px', backgroundColor: '#252526', color: 'white', borderBottom: '1px solid #3c3c3c', flexWrap: 'wrap' }}>

                {/* Indicator persoane conectate */}
                <div style={{ display: 'flex', alignItems: 'center', background: '#333', padding: '6px 12px', borderRadius: '20px', fontSize: '14px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#4CAF50', borderRadius: '50%', marginRight: '8px', boxShadow: '0 0 8px #4CAF50' }}></span>
                    {connectedUsers} {connectedUsers === 1 ? 'persoană' : 'persoane'} online
                </div>

                {/* Numele fișierului */}
                <div style={{ fontWeight: 'bold', color: '#d4d4d4', fontSize: '15px', marginLeft: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    📄 {fileName}
                </div>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#555', margin: '0 5px' }}></div>

                <select
                    value={language}
                    onChange={handleLanguageChange} // Folosim noua funcție aici!
                    style={{ padding: '6px', borderRadius: '4px', backgroundColor: '#3c3c3c', color: '#d4d4d4', border: '1px solid #555', cursor: 'pointer' }}
                >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript (Node.js)</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                </select>

                <button
                    onClick={handleRun}
                    disabled={isRunning}
                    style={{ padding: '8px 16px', cursor: isRunning ? 'wait' : 'pointer', opacity: isRunning ? 0.7 : 1, backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
                >
                    {isRunning ? '⏳ Se execută...' : '▶ Run Code'}
                </button>

                <button onClick={askAI} style={{ padding: '8px 16px', background: '#9c27b0', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
                    ✨ Cere AI
                </button>

                <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept=".py,.js,.cpp,.c,.java,.txt" />

                <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                    <button onClick={handleUploadClick} style={{ padding: '8px 16px', background: '#FF9800', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
                        📂 Încarcă
                    </button>
                    <button onClick={handleDownload} style={{ padding: '8px 16px', background: '#2196F3', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>
                        ⬇️ Descarcă
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, pointerEvents: isDragging ? 'none' : 'auto' }}>
                <Editor
                    height="100%"
                    language={language}
                    value={code}
                    onChange={handleChange}
                    onMount={handleEditorMount}
                    theme="vs-dark"
                />
            </div>

            <pre style={{ height: '20vh', padding: '15px', background: '#000', color: '#00ff00', margin: 0, overflowY: 'auto', borderTop: '2px solid #333' }}>
                {output || '> Aștept cod pentru execuție...'}
            </pre>
        </div>
    );
}