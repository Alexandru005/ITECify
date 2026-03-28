import { Router } from 'express';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const router = Router();

const languageConfig = {
    python: { image: 'python:3.9-alpine', fileName: 'script.py', command: 'python script.py' },
    javascript: { image: 'node:18-alpine', fileName: 'script.js', command: 'node script.js' },
    cpp: { image: 'gcc:latest', fileName: 'script.cpp', command: 'sh -c "g++ script.cpp -o program && ./program"' },
    java: { image: 'eclipse-temurin:17-alpine', fileName: 'Main.java', command: 'sh -c "javac Main.java && java Main"' },
    c: { image: 'gcc:latest',fileName: 'script.c', command: 'gcc -Wall -o exe script.c && ./exe' }
};

router.post('/', async (req, res) => {
    // Acum primim și 'stdin' de la frontend
    const { code, language, stdin } = req.body;

    if (!code) return res.status(400).json({ error: 'Nu ai trimis cod!' });

    const config = languageConfig[language];
    if (!config) return res.status(400).json({ error: `Limbajul '${language}' nu este suportat.` });

    try {
        // Codificăm în Base64 pentru siguranță maximă pe Linux Bash
        const base64Code = Buffer.from(code).toString('base64');
        const base64Stdin = Buffer.from(stdin || '').toString('base64');

        // Comanda Docker face 3 lucruri:
        // 1. Decodifică codul și îl pune în script.py/cpp
        // 2. Decodifică input-ul și îl pune în input.txt
        // 3. Rulează programul, forțându-l să citească datele din input.txt (< input.txt)
        const dockerCmd = `docker run --rm --memory="256m" --cpus="0.5" --network none ${config.image} sh -c "echo ${base64Code} | base64 -d > ${config.fileName} && echo ${base64Stdin} | base64 -d > input.txt && ${config.command} < input.txt"`;

        const { stdout, stderr } = await execPromise(dockerCmd, { timeout: 8000 });

        res.json({ output: stdout || stderr });

    } catch (error) {
        if (error.killed) {
            return res.json({ error: 'Execuția a durat prea mult (Timeout 8 secunde). Posibil o buclă infinită, sau programul așteaptă Input și cutia de Input este goală!' });
        }
        res.json({ error: error.stderr || error.message });
    }
});

export default router;