import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:3001';

export default function CodeEditor() {
    const [language, setLanguage] = useState('python');
    const [isRunning, setIsRunning] = useState(false);
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');
    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false);

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

    const handleChange = (value) => {
        if (isRemoteUpdate.current) {
            isRemoteUpdate.current = false;
            return;
        }
        setCode(value);
        wsRef.current?.send(JSON.stringify({ type: 'code-update', code: value }));
    };

    const handleRun = async () => {
        setIsRunning(true);
        setOutput('Se execută codul...\n');

        try {
            const res = await fetch('http://localhost:3001/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Corectat: am sters parantezele in plus
                body: JSON.stringify({ code, language: language })
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e' }}>

            {/* Toolbar: Dropdown și Buton */}
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
            </div>

            {/* Editorul Monaco */}
            <div style={{ flex: 1 }}>
                <Editor
                    height="100%"
                    language={language} // Se actualizează automat când schimbi din dropdown
                    value={code}
                    onChange={handleChange}
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