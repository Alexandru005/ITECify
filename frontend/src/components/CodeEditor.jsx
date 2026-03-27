import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:3001';

export default function CodeEditor() {
    const [code, setCode] = useState('# scrie cod aici\n');
    const [output, setOutput] = useState('');
    const wsRef = useRef(null);
    const isRemoteUpdate = useRef(false); // previne bucla infinită

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Editor
                height="70vh"
                defaultLanguage="python"
                value={code}
                onChange={handleChange}
                theme="vs-dark"
            />
            <button onClick={handleRun} style={{ margin: '8px', padding: '8px 16px' }}>
                Run
            </button>
            <pre style={{ padding: '8px', background: '#1e1e1e', color: '#d4d4d4', flex: 1 }}>
        {output || 'Output-ul apare aici...'}
      </pre>
        </div>
    );
}