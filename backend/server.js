import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { setupWsHandler } from './ws/handler.js';
import runRouter from './routes/run.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/run', runRouter);

const server = createServer(app);
const wss = new WebSocketServer({ server });
setupWsHandler(wss);

server.listen(3001, () => console.log('Backend pornit pe portul 3001'));