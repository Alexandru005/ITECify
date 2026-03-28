import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from '../src/components/HomePage.jsx';
import CodeEditor from '../src/components/CodeEditor.jsx';

function App() {
  return (
      <BrowserRouter>
        <Routes>
          {/* Ruta principală care afișează HomePage */}
          <Route path="/" element={<HomePage />} />

          {/* Ruta către editorul de cod */}
          <Route path="/editor" element={<CodeEditor />} />
        </Routes>
      </BrowserRouter>
  );
}

export default App;