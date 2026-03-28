import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import './CodeEditor.css';

// Șterge const WS_URL = 'ws://localhost:3001'; și pune asta:
const HOST = window.location.hostname; // Va lua automat IP-ul corect
const WS_URL = `ws://${HOST}:3001`;
const API_URL = `http://${HOST}:3001/run`;

export default function CodeEditor() {
    const [language, setLanguage] = useState('python');
    const [isRunning, setIsRunning] = useState(false);
    const [code, setCode] = useState('print("Hello World")');
    const [output, setOutput] = useState('');
    const [stdin, setStdin] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [connectedUsers, setConnectedUsers] = useState(1);
    const [fileName, setFileName] = useState('fisier_nou.txt');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const fileInputRef = useRef(null);

    // --- REFERINȚE NOI PENTRU AI ---
    const aiZoneIdRef = useRef(null); // ID-ul pop-up-ului AI
    const oldDecorationsRef = useRef([]); // ID-ul culorilor de pe text

    // FUNCȚII PENTRU RANDAREA AI-ULUI (Pot fi apelate de oricine prin WebSockets)
    const removeAiZone = () => {
        if (aiZoneIdRef.current && editorRef.current) {
            editorRef.current.changeViewZones(accessor => accessor.removeZone(aiZoneIdRef.current));
            aiZoneIdRef.current = null;
        }
    };

    const showAiLoading = (line) => {
        removeAiZone();
        const domNode = document.createElement('div');
        domNode.className = 'ai-suggestion-block';
        domNode.innerHTML = `<div class="ai-header" style="color: #f38ba8; animation: pulse 1.5s infinite;">⏳ AI-ul analizează codul...</div>`;
        editorRef.current?.changeViewZones(accessor => {
            aiZoneIdRef.current = accessor.addZone({ afterLineNumber: line, heightInLines: 3, domNode });
        });
    };

    const showAiSuggestion = (line, text) => {
        removeAiZone();
        const domNode = document.createElement('div');
        domNode.className = 'ai-suggestion-block';
        domNode.innerHTML = `
            <div class="ai-header">✨ Sugestie AI</div>
            <pre class="ai-code">${text}</pre>
            <div class="ai-actions">
                <button class="ai-btn accept">✔️ Accept</button>
                <button class="ai-btn reject">❌ Reject</button>
            </div>
        `;

        domNode.querySelector('.accept').onclick = () => {
            removeAiZone();
            const linesCount = text.split('\n').length;

            // Inserăm codul
            editorRef.current.executeEdits("AI_INSERT", [{
                range: new monacoRef.current.Range(line + 1, 1, line + 1, 1),
                text: text + '\n'
            }]);

            // Anunțăm pe TOȚI (inclusiv pe noi) să aplice culoarea!
            wsRef.current?.send(JSON.stringify({ type: 'ai-accepted', startLine: line + 1, endLine: line + linesCount }));
            applyAiHighlight(line + 1, line + linesCount);
        };

        domNode.querySelector('.reject').onclick = () => {
            removeAiZone();
            wsRef.current?.send(JSON.stringify({ type: 'ai-rejected' }));
        };

        editorRef.current?.changeViewZones(accessor => {
            const linesCount = text.split('\n').length;
            aiZoneIdRef.current = accessor.addZone({ afterLineNumber: line, heightInLines: linesCount + 3, domNode });
        });
    };

    const applyAiHighlight = (startLine, endLine) => {
        if (!editorRef.current || !monacoRef.current) return;

        // Aplicăm culoarea
        oldDecorationsRef.current = editorRef.current.deltaDecorations(oldDecorationsRef.current, [
            {
                range: new monacoRef.current.Range(startLine, 1, endLine, 1),
                options: {
                    isWholeLine: true,
                    className: 'ai-highlight',
                    marginClassName: 'ai-highlight-margin'
                }
            }
        ]);

        // Ștergem culoarea automat după 3.5 secunde (efect vizual mult mai plăcut!)
        setTimeout(() => {
            if (editorRef.current) {
                oldDecorationsRef.current = editorRef.current.deltaDecorations(oldDecorationsRef.current, []);
            }
        }, 3500);
    };

    // --- EFECTUL DE WEBSOCKETS ---
    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);

            if (msg.type === 'code-update') {
                isRemoteUpdate.current = true;
                setCode(msg.code);
            } else if (msg.type === 'users-count') setConnectedUsers(msg.count);
            else if (msg.type === 'language-update') setLanguage(msg.language);
            else if (msg.type === 'file-name-update') setFileName(msg.fileName);
            else if (msg.type === 'output-update') setOutput(msg.output);

            // ASCULTĂM EVENIMENTELE AI
            else if (msg.type === 'ai-loading') showAiLoading(msg.line);
            else if (msg.type === 'ai-suggestion') showAiSuggestion(msg.line, msg.text);
            else if (msg.type === 'ai-accepted') {
                removeAiZone();
                // Așteptăm 100ms ca să fim siguri că textul nou a fost randat în editor înainte să-l colorăm
                setTimeout(() => {
                    applyAiHighlight(msg.startLine, msg.endLine);
                }, 100);
            }
            else if (msg.type === 'ai-rejected') removeAiZone();
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

    // --- FUNCȚIA DE CERERE AI ---
    const askAI = async () => {
        if (!editorRef.current || !monacoRef.current) return;
        const position = editorRef.current.getPosition();
        const model = editorRef.current.getModel();

        // 1. Anunțăm pe toți că AI-ul se gândește
        wsRef.current?.send(JSON.stringify({ type: 'ai-loading', line: position.lineNumber }));
        showAiLoading(position.lineNumber);

        const codeBefore = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const codeAfter = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()) });

        try {
            const response = await fetch('http://localhost:3001/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codeBefore, codeAfter, language })
            });
            const data = await response.json();

            if (data.suggestion) {
                // 2. Anunțăm pe toți că a venit sugestia
                wsRef.current?.send(JSON.stringify({ type: 'ai-suggestion', line: position.lineNumber, text: data.suggestion }));
                showAiSuggestion(position.lineNumber, data.suggestion);
            } else {
                removeAiZone();
                wsRef.current?.send(JSON.stringify({ type: 'ai-rejected' }));
            }
        } catch (error) {
            removeAiZone();
            wsRef.current?.send(JSON.stringify({ type: 'ai-rejected' }));
            alert("Eroare la AI.");
        }
    };

    const handleLanguageChange = (e) => {
        const newLang = e.target.value;
        setLanguage(newLang);
        wsRef.current?.send(JSON.stringify({ type: 'language-update', language: newLang }));
    };

    const handleRun = async () => {
        setIsRunning(true);
        const startMsg = '> Compiling code...\n';
        setOutput(startMsg);
        wsRef.current?.send(JSON.stringify({ type: 'output-update', output: startMsg }));

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, language, stdin })
            });

            if (!res.ok) throw new Error(`Eroare de la server (Status: ${res.status})`);
            const data = await res.json();
            const finalOutput = data.error ? `Eroare de execuție:\n${data.error}` : (data.output || 'S-a executat cu succes.');

            setOutput(finalOutput);
            wsRef.current?.send(JSON.stringify({ type: 'output-update', output: finalOutput }));
        } catch (err) {
            const errorMsg = `Eroare de conexiune: (${err.message})`;
            setOutput(errorMsg);
            wsRef.current?.send(JSON.stringify({ type: 'output-update', output: errorMsg }));
        } finally {
            setIsRunning(false);
        }
    };

    const processFile = (file) => {
        if (!file) return;
        setFileName(file.name);
        wsRef.current?.send(JSON.stringify({ type: 'file-name-update', fileName: file.name }));

        const ext = file.name.split('.').pop().toLowerCase();
        const extMap = { 'py': 'python', 'js': 'javascript', 'cpp': 'cpp', 'c': 'c', 'java': 'java' };
        if (extMap[ext]) {
            setLanguage(extMap[ext]);
            wsRef.current?.send(JSON.stringify({ type: 'language-update', language: extMap[ext] }));
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const fileContent = event.target.result;
            setCode(fileContent);
            wsRef.current?.send(JSON.stringify({ type: 'code-update', code: fileContent }));

            // DUPĂ CE FIȘIERUL S-A ÎNCĂRCAT, ÎNCHIDEM FEREASTRA AUTOMAT!
            setIsUploadModalOpen(false);
        };
        reader.readAsText(file);
    };

    // Evenimentele de Drag & Drop acum se aplică DOAR pe fereastra mică
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        processFile(e.dataTransfer.files[0]);
    };

    // Butonul principal "Încarcă" nu mai dă click pe input, ci deschide fereastra
    const handleUploadClick = () => setIsUploadModalOpen(true);

    // Când dăm click pe zona punctată din fereastră, declanșăm exploratorul de fișiere
    const handleDropZoneClick = () => fileInputRef.current?.click();

    const handleFileSelect = (e) => { processFile(e.target.files[0]); e.target.value = null; };

    const handleDownload = () => {
        const extMap = { 'python': 'py', 'javascript': 'js', 'cpp': 'cpp', 'c': 'c', 'java': 'java' };
        const currentExt = extMap[language] || 'txt';
        let baseName = fileName;
        if (baseName.includes('.')) baseName = baseName.substring(0, baseName.lastIndexOf('.'));

        const finalFileName = `${baseName}.${currentExt}`;
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFileName;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        // 1. AM SCOS EVENIMENTELE DE DRAG DE AICI
        <div className="editor-container">

            {/* 2. ADAUGĂ MODALUL DE UPLOAD AICI */}
            {isUploadModalOpen && (
                <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
                    {/* Oprim click-ul să nu închidă modalul dacă apăsăm pe centrul lui */}
                    <div className="upload-modal" onClick={(e) => e.stopPropagation()}>

                        <div className="modal-header">
                            <h3 className="modal-title">Încarcă un fișier</h3>
                            <button className="btn-close" onClick={() => setIsUploadModalOpen(false)}>✖</button>
                        </div>

                        {/* Asta e zona în care tragi fișiere SAU dai click */}
                        <div
                            className={`drop-zone ${isDragging ? 'active' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={handleDropZoneClick}
                        >
                            <span className="drop-icon">📂</span>
                            <div>
                                <strong>Trage un fișier aici</strong> (Drag & Drop)
                                <br/>
                                <span style={{fontSize: '13px', opacity: 0.7}}>sau dă click pentru a răsfoi fișierele</span>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* --- TOOLBAR --- */}
            <div className="toolbar">
                <div className="online-badge">
                    <span className="status-dot"></span>
                    {connectedUsers} {connectedUsers === 1 ? 'persoană' : 'persoane'} online
                </div>

                <div className="file-name">
                    📄 {fileName}
                </div>

                <div className="divider"></div>

                <select className="lang-select" value={language} onChange={handleLanguageChange}>
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript (Node.js)</option>
                    <option value="c">C</option>
                    <option value="cpp">C++</option>
                    <option value="java">Java</option>
                </select>

                {/* --- BUTOANELE TALE SUNT AICI --- */}
                <button className="btn btn-run" onClick={handleRun} disabled={isRunning}>
                    {isRunning ? '⏳ Se execută...' : '▶ Run Code'}
                </button>

                <button className="btn btn-ai" onClick={askAI}>
                    ✨ Cere AI
                </button>
                {/* -------------------------------- */}

                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden-input" accept=".py,.js,.cpp,.c,.java,.txt" />

                <div className="action-group">
                    <button className="btn btn-upload" onClick={handleUploadClick}>
                        📂 Încarcă
                    </button>
                    <button className="btn btn-download" onClick={handleDownload}>
                        ⬇️ Descarcă
                    </button>
                </div>
            </div>
            <div style={{ flex: 1, pointerEvents: isDragging ? 'none' : 'auto' }}>
                <Editor height="100%" language={language} value={code} onChange={handleChange} onMount={handleEditorMount} theme="vs-dark" />
            </div>

            <div className="io-container">
                <div className="io-box input-box">
                    <div className="io-header">📥 Date de intrare (Input)</div>
                    <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Dacă programul cere date, scrie-le aici..." className="io-textarea" />
                </div>
                <div className="io-box">
                    <div className="io-header">📤 Rezultat (Output)</div>
                    <pre className="io-pre">{output || '> Aștept cod pentru execuție...'}</pre>
                </div>
            </div>
        </div>
    );
}