import { Router } from 'express';
const router = Router();

router.post('/', async (req, res) => {
    const { code, language } = req.body;
    // Faza 2: aici vine Docker
    res.json({ output: `[mock] Ai trimis ${code.length} caractere de ${language}` });
});

export default router;