// App.jsx
import { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import './index.css';

// Math to convert Latitude/Longitude to 3D space (X, Y, Z)
const latLongToVector3 = (lat, lon, radius) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new THREE.Vector3(x, y, z);
};

// The 3D Earth Component
const EarthScene = ({ issData, onNodeClick }) => {
  const earthRef = useRef();
  
  // Rotate the earth slowly
  useFrame(() => {
    if (earthRef.current) earthRef.current.rotation.y += 0.0005;
  });

  const issPosition = issData ? latLongToVector3(issData.latitude, issData.longitude, 2.1) : new THREE.Vector3(0,0,0);

  return (
    <group ref={earthRef}>
      {/* Volumetric Hologram Light from below */}
      <SpotLight position={[0, -5, 0]} angle={0.6} penumbra={1} intensity={50} color="#00ffff" castShadow />
      <ambientLight intensity={0.1} />

      {/* The Earth */}
      <Sphere args={[2, 64, 64]}>
        <meshStandardMaterial color="#0a1930" roughness={0.7} metalness={0.2} wireframe={false} />
      </Sphere>

      {/* The ISS Node (Magenta Target) */}
      {issData && (
        <mesh position={issPosition} onClick={() => onNodeClick('International Space Station')}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshBasicMaterial color="#ff00ff" />
          {/* Add a glowing aura to the node */}
          <pointLight color="#ff00ff" intensity={2} distance={1} />
        </mesh>
      )}
    </group>
  );
};

// Main App Dashboard
export default function App() {
  const [issData, setIssData] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState("CLICK A NODE ON THE GLOBE TO INITIATE DEEP AI ANALYSIS.");

  // Poll the backend for ISS data every 5 seconds
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const res = await fetch('https://astrosight-api-xyz.onrender.com/api/iss')
        const data = await res.json();
        setIssData(data);
      } catch (err) { console.error("Telemetry error:", err); }
    };
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleNodeClick = async (satelliteName) => {
    setAiAnalysis("ANALYZING TARGET NODE...");
    try {
      const res = await fetch('http://localhost:3001/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ satelliteName })
      });
      const data = await res.json();
      setAiAnalysis(data.explanation);
    } catch (err) {
      setAiAnalysis("ERROR: AI ENGINE OFFLINE.");
    }
  };

  return (
    <>
      {/* The 3D Canvas Base Layer */}
      <Canvas camera={{ position: [0, 2, 6], fov: 45 }}>
        <OrbitControls enableZoom={true} enablePan={false} />
        <EarthScene issData={issData} onNodeClick={handleNodeClick} />
      </Canvas>

      {/* Glassmorphism UI Overlay */}
      <div className="sci-fi-panel header">
        <h2>ORBITAL_CMD_V4.2 // ASTROSIGHT</h2>
      </div>

      <div className="sci-fi-panel left-panel">
        <h3 className="magenta-text">• ACTIVE TRACK // ISS</h3>
        <p>LATITUDE: {issData ? issData.latitude.toFixed(4) : 'SYNCING...'}° N</p>
        <p>LONGITUDE: {issData ? issData.longitude.toFixed(4) : 'SYNCING...'}° W</p>
        <p>ALTITUDE: {issData ? issData.altitude.toFixed(2) : 'SYNCING...'} KM</p>
        <p>VELOCITY: {issData ? (issData.velocity / 3600).toFixed(2) : 'SYNCING...'} KM/S</p>
      </div>

      <div className="sci-fi-panel right-panel">
        <h3>SATELLITE INSIGHTS</h3>
        <div style={{ fontSize: '0.9rem', lineHeight: '1.5', opacity: 0.9 }}>
          {aiAnalysis}
        </div>
      </div>

      <div className="footer">
        CONNECTION: SECURE | GEMINI ENGINE: ONLINE | © 2174 ASTROSIGHT CORP
      </div>
    </>
  );
}