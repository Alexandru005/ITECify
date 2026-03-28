import { Router } from 'express';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import util from 'util';

const execPromise = util.promisify(exec);
const router = Router();

// Aici e magia! Definim cum se comportă fiecare limbaj.
// Pentru limbajele compilate (C++, Java), folosim 'sh -c' pentru a înlănțui
// comanda de compilare (ex: g++) cu cea de execuție (ex: ./program) folosind &&
const languageConfig = {
    python: {
        image: 'python:3.9-alpine',
        fileName: 'script.py',
        command: 'python script.py'
    },
    javascript: {
        image: 'node:18-alpine',
        fileName: 'script.js',
        command: 'node script.js'
    },
    cpp: {
        image: 'gcc:latest',
        fileName: 'script.cpp',
        command: 'sh -c "g++ script.cpp -o program && ./program"'
    },
    java: {
        image: 'eclipse-temurin:17-alpine', // AICI AM MODIFICAT
        fileName: 'Main.java',
        command: 'sh -c "javac Main.java && java Main"'
    },
    c: {
        image: 'gcc:latest',
        fileName: 'script.c',
        command: 'gcc -Wall -o exe script.c && ./exe'
    }
};

router.post('/', async (req, res) => {
    const { code, language } = req.body;

    if (!code) return res.status(400).json({ error: 'Nu ai trimis cod!' });

    // Verificăm dacă suportăm limbajul cerut
    const config = languageConfig[language];
    if (!config) {
        return res.status(400).json({ error: `Limbajul '${language}' nu este suportat încă.` });
    }

    const executionId = crypto.randomUUID();
    const tempDirPath = path.join(process.cwd(), 'temp', executionId);

    try {
        await fs.mkdir(tempDirPath, { recursive: true });

        // Folosim datele din dicționarul de mai sus
        const filePath = path.join(tempDirPath, config.fileName);
        await fs.writeFile(filePath, code);

        // Construim comanda Docker folosind imaginea și comanda specifice limbajului
        const dockerCmd = `docker run --rm --memory="256m" --cpus="0.5" --network none -v "${tempDirPath}:/usr/src/app" -w /usr/src/app ${config.image} ${config.command}`;

        const { stdout, stderr } = await execPromise(dockerCmd, { timeout: 8000 }); // Am crescut timeout-ul la 8s pentru compilările grele (ex: C++)

        res.json({ output: stdout || stderr });

    } catch (error) {
        if (error.killed) {
            return res.json({ error: 'Execuția a durat prea mult (Timeout 8 secunde). Posibilă buclă infinită?' });
        }
        res.json({ error: error.stderr || error.message });
    } finally {
        try {
            await fs.rm(tempDirPath, { recursive: true, force: true });
        } catch (cleanupError) {
            console.error('Eroare la curățare:', cleanupError);
        }
    }
});

export default router;