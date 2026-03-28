import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

export default function HomePage() {
    // 1. Inițializăm hook-ul de navigare
    const navigate = useNavigate();

    // 2. Creăm funcția care declanșează navigarea
    const mergiLaEditor = () => {
        // Aici pui exact calea (path-ul) definită în App.jsx
        navigate('/editor');
    };

    return(
        <div className="container-fundal">
            <h1 className="title-home-page"> 💻 ITECify 💻 </h1>
            <p className="motto-home-page"> ,,A peaceful space to code together"</p>

            {/* 3. Atașăm funcția la evenimentul onClick al unui buton */}
            <button onClick={mergiLaEditor} className="btn-start-coding">
                Start Coding
            </button>
        </div>
    );
}