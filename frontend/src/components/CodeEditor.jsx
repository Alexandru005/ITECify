import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import './CodeEditor.css'; // Asigură-te că CSS-ul rămâne importat

const WS_URL = 'ws://192.168.168.128:3001';

export default function CodeEditor() {
    // --- STĂRI (STATES) ---
    const [language, setLanguage] = useState('python');
    const [isRunning, setIsRunning] = useState(false);
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');
    const [stdin, setStdin] = useState(''); // Date de intrare

    // Colaborare
    const [connectedUsers, setConnectedUsers] = useState(1);
    const [fileName, setFileName] = useState('fisier_nou.txt');

    // UI Modal & Drag
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // --- REFERINȚE (REFS) ---
    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const fileInputRef = useRef(null);

    // AI Refs
    const aiZoneIdRef = useRef(null);
    const oldDecorationsRef = useRef([]);

    // ==========================================
    // LOGICA AI: FUNCȚII VIZUALE
    // ==========================================
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

            // Inserăm codul în editor
            editorRef.current.executeEdits("AI_INSERT", [{
                range: new monacoRef.current.Range(line + 1, 1, line + 1, 1),
                text: text + '\n'
            }]);

            // Anunțăm pe toți și colorăm local
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

        // Efectul dispare după 3.5 secunde
        setTimeout(() => {
            if (editorRef.current) {
                oldDecorationsRef.current = editorRef.current.deltaDecorations(oldDecorationsRef.current, []);
            }
        }, 3500);
    };

    // ==========================================
    // WEBSOCKETS (CONEXIUNE ȘI SINCRONIZARE)
    // ==========================================
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

            // AI Syncing
            else if (msg.type === 'ai-loading') showAiLoading(msg.line);
            else if (msg.type === 'ai-suggestion') showAiSuggestion(msg.line, msg.text);
            else if (msg.type === 'ai-accepted') {
                removeAiZone();
                // Delay 100ms pentru a evita eroarea Monaco de care ne-am lovit anterior
                setTimeout(() => {
                    applyAiHighlight(msg.startLine, msg.endLine);
                }, 100);
            }
            else if (msg.type === 'ai-rejected') removeAiZone();
        };

        return () => ws.close();
    }, []);

    // ==========================================
    // LOGICĂ EDITOR ȘI EXECUȚIE COD
    // ==========================================
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
            const res = await fetch('http://192.168.168.128:3001/run', {
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

    const askAI = async () => {
        if (!editorRef.current || !monacoRef.current) return;
        const position = editorRef.current.getPosition();
        const model = editorRef.current.getModel();

        // Anunțăm colegii că AI-ul gândește
        wsRef.current?.send(JSON.stringify({ type: 'ai-loading', line: position.lineNumber }));
        showAiLoading(position.lineNumber);

        const codeBefore = model.getValueInRange({ startLineNumber: 1, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
        const codeAfter = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()) });

        try {
            const response = await fetch('http://192.168.168.128:3001/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codeBefore, codeAfter, language })
            });
            const data = await response.json();

            if (data.suggestion) {
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

    // ==========================================
    // LOGICĂ FIȘIERE (UPLOAD, DRAG & DROP MODAL, DOWNLOAD)
    // ==========================================
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

            setIsUploadModalOpen(false); // Închidem modalul automat
        };
        reader.readAsText(file);
    };

    // Evenimente DOAR pentru zona de drop din modal
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); };

    const handleUploadClick = () => setIsUploadModalOpen(true);
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

    // ==========================================
    // RANDARE INTERFAȚĂ (JSX)
    // ==========================================
    return (
        <div className="editor-container">

            {/* MODALUL PENTRU UPLOAD / DRAG & DROP */}
            {isUploadModalOpen && (
                <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
                    <div className="upload-modal" onClick={(e) => e.stopPropagation()}>

                        <div className="modal-header">
                            <h3 className="modal-title">Încarcă un fișier</h3>
                            <button className="btn-close" onClick={() => setIsUploadModalOpen(false)}>✖</button>
                        </div>

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

            {/* TOOLBAR */}
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

                <button className="btn btn-run" onClick={handleRun} disabled={isRunning}>
                    {isRunning ? '⏳ Se execută...' : '▶ Run Code'}
                </button>

                <button className="btn btn-ai" onClick={askAI}>
                    ✨ Cere AI
                </button>

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

            {/* EDITOR */}
            <div style={{ flex: 1 }}>
                <Editor height="100%" language={language} value={code} onChange={handleChange} onMount={handleEditorMount} theme="vs-dark" />
            </div>

            {/* ZONA DE INPUT / OUTPUT TERMINAL */}
            <div className="io-container">
                <div className="io-box input-box">
                    <div className="io-header">📥 Date de intrare (Input)</div>
                    <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Dacă programul cere date (ex: cin >> x), scrie-le aici..." className="io-textarea" />
                </div>
                <div className="io-box">
                    <div className="io-header">📤 Rezultat (Output)</div>
                    <pre className="io-pre">{output || '> Aștept cod pentru execuție...'}</pre>
                </div>
            </div>
        </div>
    );
}