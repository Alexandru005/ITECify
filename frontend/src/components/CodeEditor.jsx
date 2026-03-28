import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import './CodeEditor.css'; // <-- Importul noului fișier CSS

const WS_URL = 'ws://localhost:3001';

export default function CodeEditor() {
    const [language, setLanguage] = useState('python');
    const [isRunning, setIsRunning] = useState(false);
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [stdin, setStdin] = useState(''); // Starea pentru datele de intrare

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

            if (msg.type === 'code-update') {
                isRemoteUpdate.current = true;
                setCode(msg.code);
            } else if (msg.type === 'users-count') {
                setConnectedUsers(msg.count);
            } else if (msg.type === 'language-update') {
                setLanguage(msg.language);
            } else if (msg.type === 'file-name-update') {
                setFileName(msg.fileName);
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

    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        setLanguage(newLang);
        wsRef.current?.send(JSON.stringify({ type: 'language-update', language: newLang }));
    };

    const handleRun = async () => {
        setIsRunning(true);

        const startMsg = '> Se execută codul...\n';
        setOutput(startMsg);
        wsRef.current?.send(JSON.stringify({ type: 'output-update', output: startMsg }));

        try {
            const res = await fetch('http://localhost:3001/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language, stdin })
            });

            if (!res.ok) throw new Error(`Eroare de la server (Status: ${res.status})`);

            const data = await res.json();

            const finalOutput = data.error
                ? `Eroare de execuție:\n${data.error}`
                : (data.output || 'S-a executat cu succes, dar nu există output.');

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
        // Aici am înlocuit style inline cu clasa din CSS care conține animația
        domNode.innerHTML = `<div class="ai-header-pulse">⏳ AI-ul analizează codul...</div>`;

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

    const processFile = (file) => {
        if (!file) return;

        setFileName(file.name);
        wsRef.current?.send(JSON.stringify({ type: 'file-name-update', fileName: file.name }));

        const ext = file.name.split('.').pop().toLowerCase();
        const extMap = { 'py': 'python', 'js': 'javascript', 'cpp': 'cpp', 'c': 'cpp', 'java': 'java' };
        if (extMap[ext]) {
            setLanguage(extMap[ext]);
            wsRef.current?.send(JSON.stringify({ type: 'language-update', language: extMap[ext] }));
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const fileContent = event.target.result;
            setCode(fileContent);
            wsRef.current?.send(JSON.stringify({ type: 'code-update', code: fileContent }));
        };
        reader.readAsText(file);
    };

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        processFile(e.dataTransfer.files[0]);
    };

    const handleUploadClick = () => fileInputRef.current?.click();
    const handleFileSelect = (e) => {
        processFile(e.target.files[0]);
        e.target.value = null;
    };

    const handleDownload = () => {
        // 1. Găsim extensia corectă pentru limbajul selectat acum
        const extMap = { 'python': 'py', 'javascript': 'js', 'cpp': 'cpp', 'c': 'c', 'java': 'java' };
        const currentExt = extMap[language] || 'txt';

        // 2. Extragem numele de bază al fișierului (fără extensia veche)
        let baseName = fileName;
        if (baseName.includes('.')) {
            // Tăiem tot de la ultimul punct încolo (ex: "script.vechi.py" devine "script.vechi")
            baseName = baseName.substring(0, baseName.lastIndexOf('.'));
        }

        // 3. Lipim numele de bază cu extensia nouă
        const finalFileName = `${baseName}.${currentExt}`;

        // 4. Generăm și descărcăm fișierul
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFileName;
        a.click();

        // Curățăm memoria
        URL.revokeObjectURL(url);
    };
    return (
        <div
            className="editor-container"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div className="drag-overlay">
                    📂 Lasă fișierul aici pentru a-l încărca!
                </div>
            )}

            <div className="toolbar">
                <div className="users-indicator">
                    <span className="status-dot"></span>
                    {connectedUsers} {connectedUsers === 1 ? 'persoană' : 'persoane'} online
                </div>

                <div className="file-name">
                    📄 {fileName}
                </div>

                <div className="divider"></div>

                <select
                    value={language}
                    onChange={handleLanguageChange}
                    className="lang-select"
                >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript (Node.js)</option>
                    <option value="cpp">C++</option>
                    <option value="c">C</option>
                    <option value="java">Java</option>
                </select>

                <button
                    onClick={handleRun}
                    disabled={isRunning}
                    className={`btn-run ${isRunning ? 'running' : ''}`}
                >
                    {isRunning ? '⏳ Se execută...' : '▶ Run Code'}
                </button>

                <button onClick={askAI} className="btn-ai">
                    ✨ Cere AI
                </button>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden-input"
                    accept=".py,.js,.cpp,.c,.java,.txt"
                />

                <div className="file-actions">
                    <button onClick={handleUploadClick} className="btn-upload">
                        📂 Încarcă
                    </button>
                    <button onClick={handleDownload} className="btn-download">
                        ⬇️ Descarcă
                    </button>
                </div>
            </div>

            <div className={`monaco-wrapper ${isDragging ? 'dragging' : ''}`}>
                <Editor
                    height="100%"
                    language={language}
                    value={code}
                    onChange={handleChange}
                    onMount={handleEditorMount}
                    theme="vs-dark"
                />
            </div>
            {/* Secțiunea de jos: Input și Output */}
            <div className="io-container">

                {/* Cutia de INPUT */}
                <div className="io-box input-box">
                    <div className="io-header">
                        📥 Date de intrare (Input)
                    </div>
                    <textarea
                        value={stdin}
                        onChange={(e) => setStdin(e.target.value)}
                        placeholder="Dacă programul cere date (ex: cin >> x), scrie-le aici..."
                        className="io-textarea"
                    />
                </div>

                {/* Cutia de OUTPUT */}
                <div className="io-box">
                    <div className="io-header">
                        📤 Rezultat (Output)
                    </div>
                    <pre className="io-pre">
                        {output || '> Aștept cod pentru execuție...'}
                    </pre>
                </div>

            </div>
        </div>
    );
}