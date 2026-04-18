import { useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE?.trim() || 'http://localhost:3001';
const apiUrl = (path) => `${API_BASE}${path}`;
const EARTH_TEXTURE_URL = `${import.meta.env.BASE_URL}earth-map.jpg`;
const EARTH_RADIUS = 2.15;
const EARTH_RADIUS_KM = 6371;
const KM_TO_WORLD = EARTH_RADIUS / EARTH_RADIUS_KM;

const latLongToVector3 = (lat, lon, radius) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    (radius * Math.cos(phi)),
    (radius * Math.sin(phi) * Math.sin(theta))
  );
};

const SAT_RENDER_LIMIT = 80;

const Controls = () => {
  const { invalidate } = useThree();
  return (
    <OrbitControls
      enableZoom={true}
      enablePan={false}
      minPolarAngle={1.4}
      maxPolarAngle={1.6}
      enableDamping
      dampingFactor={0.08}
      onChange={() => invalidate()}
    />
  );
};

const EarthScene = ({ issData, satellites, selectedId, onNodeClick }) => {
  const earthTexture = useTexture(EARTH_TEXTURE_URL);
  const visibleSatellites = useMemo(
    () => satellites.slice(0, SAT_RENDER_LIMIT),
    [satellites]
  );

  const satellitePositions = useMemo(() => {
    const positions = new Float32Array(visibleSatellites.length * 3);
    visibleSatellites.forEach((sat, index) => {
      const radius = EARTH_RADIUS + (sat.altitude || 0) * KM_TO_WORLD;
      const pos = latLongToVector3(sat.latitude, sat.longitude, radius);
      const offset = index * 3;
      positions[offset] = pos.x;
      positions[offset + 1] = pos.y;
      positions[offset + 2] = pos.z;
    });
    return positions;
  }, [visibleSatellites]);

  useEffect(() => {
    earthTexture.colorSpace = THREE.SRGBColorSpace;
    earthTexture.anisotropy = 1;
    earthTexture.generateMipmaps = false;
    earthTexture.minFilter = THREE.LinearFilter;
    earthTexture.magFilter = THREE.LinearFilter;
    earthTexture.needsUpdate = true;
  }, [earthTexture]);

  const issPos = issData
    ? latLongToVector3(
        issData.latitude,
        issData.longitude,
        EARTH_RADIUS + (issData.altitude || 0) * KM_TO_WORLD
      )
    : new THREE.Vector3(0, 0, 0);

  return (
    <>
      <group>
        <ambientLight intensity={1.5} />
        <pointLight position={[5, 5, 5]} intensity={1} color="#00ffff" />
        <mesh position={[0, -3.2, 0]}>
          <cylinderGeometry args={[2.1, 0.4, 5.5, 32, 1, true]} />
          <meshBasicMaterial
            color="#00ffff"
            transparent
            opacity={0.08}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Holographic circular base (rounded rings + glow) */}
        <group position={[0, -5.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[0.24, 0.5, 64]} />
            <meshBasicMaterial color="#00eaff" transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.56, 0.82, 64]} />
            <meshBasicMaterial color="#33f6ff" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.88, 1.26, 64]} />
            <meshBasicMaterial color="#00d8ff" transparent opacity={0.22} side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.2, 48]} />
            <meshBasicMaterial
              color="#ff3af2"
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      </group>

      <group>
        <Sphere args={[2, 48, 48]}>
          <meshStandardMaterial
            map={earthTexture}
            emissive={new THREE.Color('#1b2a4a')}
            emissiveIntensity={0.25}
            roughness={0.5}
            metalness={0.2}
          />
        </Sphere>

        {/* Orbital rings around the globe */}
        <mesh rotation={[Math.PI * 0.52, 0.2, 0]}>
          <torusGeometry args={[2.72, 0.008, 8, 64]} />
          <meshBasicMaterial color="#1ceeff" transparent opacity={0.34} />
        </mesh>
        <mesh rotation={[Math.PI * 0.5, -0.5, 0.15]}>
          <torusGeometry args={[2.95, 0.007, 8, 64]} />
          <meshBasicMaterial color="#ff2de4" transparent opacity={0.22} />
        </mesh>
        <mesh rotation={[Math.PI * 0.48, 0.95, -0.1]}>
          <torusGeometry args={[3.18, 0.006, 8, 64]} />
          <meshBasicMaterial color="#39faff" transparent opacity={0.16} />
        </mesh>

        {issData && (
          <group position={issPos} onClick={() => onNodeClick('International Space Station', 'iss')}>
            <mesh>
              <sphereGeometry args={[0.04, 16, 16]} />
              <meshBasicMaterial color="white" />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.09, 16, 16]} />
              <meshBasicMaterial color="#ff00ff" transparent opacity={0.6} />
            </mesh>
            <pointLight color="#ff00ff" intensity={10} distance={3} />
          </group>
        )}

        {visibleSatellites.length > 0 && (
          <points
            onPointerDown={(event) => {
              event.stopPropagation();
              const sat = visibleSatellites[event.index];
              if (sat) onNodeClick(sat.name, sat.id);
            }}
          >
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={satellitePositions}
                itemSize={3}
                count={satellitePositions.length / 3}
              />
            </bufferGeometry>
            <pointsMaterial color="#00ffff" size={0.035} sizeAttenuation />
          </points>
        )}

        {selectedId && (() => {
          const selected = visibleSatellites.find((sat) => String(sat.id) === String(selectedId));
          if (!selected) return null;
          const radius = EARTH_RADIUS + (selected.altitude || 0) * KM_TO_WORLD;
          const position = latLongToVector3(selected.latitude, selected.longitude, radius);
          return (
            <mesh position={position}>
              <sphereGeometry args={[0.035, 10, 10]} />
              <meshBasicMaterial color="#ff00ff" />
            </mesh>
          );
        })()}
      </group>
    </>
  );
};

const formatLat = (value) => {
  if (value == null) return '---';
  const hemi = value >= 0 ? 'N' : 'S';
  return `${Math.abs(value).toFixed(4)}° ${hemi}`;
};

const formatLon = (value) => {
  if (value == null) return '---';
  const hemi = value >= 0 ? 'E' : 'W';
  return `${Math.abs(value).toFixed(4)}° ${hemi}`;
};

const formatAlt = (value) => (value == null ? '---' : `${value.toFixed(2)} KM`);
const formatVel = (value) => (value == null ? '---' : `${value.toFixed(2)} KM/S`);
const formatTime = (value) => (value ? new Date(value).toLocaleTimeString() : '---');

export default function App() {
  const [issData, setIssData] = useState(null);
  const [satellites, setSatellites] = useState([]);
  const [satStatus, setSatStatus] = useState({ count: 0, updatedAt: null, source: '---' });
  const [selectedSatellite, setSelectedSatellite] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState('SYSTEM READY. CLICK A SATELLITE NODE.');
  const [isMobile, setIsMobile] = useState(false);
  const [mobileHudOpen, setMobileHudOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      setMobileHudOpen(!mobile);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const fetchIss = async () => {
      try {
        const res = await fetch(apiUrl('/api/iss'));
        const data = await res.json();
        setIssData(data);
      } catch (e) {
        console.error('ISS telemetry offline');
      }
    };
    fetchIss();
    const interval = setInterval(fetchIss, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchSats = async () => {
      try {
        const res = await fetch(apiUrl('/api/satellites'));
        const data = await res.json();
        setSatellites(data.satellites || []);
        setSatStatus({
          count: data.count || 0,
          updatedAt: data.updatedAt || null,
          source: data.source || '---'
        });
      } catch (e) {
        console.error('Satellite feed offline');
      }
    };
    fetchSats();
    const interval = setInterval(fetchSats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAI = async (name, id) => {
    if (isMobile) {
      setMobileHudOpen(true);
    }
    setSelectedSatellite({ id: id || name, name });
    setAiAnalysis('ANALYZING TARGET NODE...');
    try {
      const res = await fetch(apiUrl('/api/ai/explain'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ satelliteName: name })
      });
      const data = await res.json();
      if (!res.ok) {
        setAiAnalysis(`ERROR (${res.status}): ${data.error || 'AI request failed.'}`);
        return;
      }
      setAiAnalysis(data.explanation || 'No explanation returned.');
    } catch (err) {
      setAiAnalysis('OFFLINE: Backend not responding.');
    }
  };

  return (
    <div className="app-shell">
      <Suspense fallback={<div style={{ color: 'white', padding: '20px' }}>BOOTING SYSTEMS...</div>}>
        <Canvas
          camera={{ position: [0, 0.5, 8.5], fov: 42 }}
          dpr={1}
          frameloop="demand"
          style={{ position: 'fixed', inset: 0 }}
          gl={{ antialias: false, alpha: false, powerPreference: 'low-power', stencil: false }}
        >
          <color attach="background" args={['#020611']} />
          <Controls />
          <EarthScene
            issData={issData}
            satellites={satellites}
            selectedId={selectedSatellite?.id}
            onNodeClick={handleAI}
          />
        </Canvas>
      </Suspense>

      <div className="header"><h2>ASTROSIGHT</h2></div>

      {isMobile && (
        <button
          className="hud-toggle"
          type="button"
          onClick={() => setMobileHudOpen((prev) => !prev)}
        >
          {mobileHudOpen ? 'HIDE HUD' : 'SHOW HUD'}
        </button>
      )}

      <div className={`hud-layout ${isMobile ? 'mobile-layout' : ''} ${mobileHudOpen ? 'mobile-open' : 'mobile-collapsed'}`}>
        <div className="sci-fi-panel left-top">
          <h3 className="magenta-text">• ACTIVE TRACK // ISS</h3>
          <div className="data-grid">
            <span>LATITUDE:</span> <span>{formatLat(issData?.latitude)}</span>
            <span>LONGITUDE:</span> <span>{formatLon(issData?.longitude)}</span>
            <span>ALTITUDE:</span> <span>{formatAlt(issData?.altitude)}</span>
            <span>VELOCITY:</span> <span>{formatVel(issData ? issData.velocity / 3600 : null)}</span>
          </div>
        </div>

        <div className="sci-fi-panel left-bottom mobile-optional">
          <h3>TRACKING STATUS</h3>
          <p>ACTIVE SATELLITES: {satStatus.count || '---'}</p>
          <p>DATA SOURCE: {satStatus.source?.toUpperCase()}</p>
          <p className="magenta-text">LAST UPDATE: {formatTime(satStatus.updatedAt)}</p>
        </div>

        <div className="sci-fi-panel right-top mobile-optional">
          <div className="gauge-row">
            <div
              className="circle-gauge progress-gauge"
              style={{ '--progress': Math.min(100, satStatus.count || 0) }}
            >
              <span>{Math.min(100, satStatus.count || 0)}%</span>
            </div>
            <div className="circle-gauge magenta-circle">
              <span>{selectedSatellite ? 'LOCKED' : 'IDLE'}</span>
            </div>
          </div>
        </div>

        <div className="sci-fi-panel right-middle">
          <h3>SATELLITE INSIGHTS</h3>
          <p className="magenta-text">
            TARGET: {selectedSatellite?.name || 'NONE'}
          </p>
          <div className="insight-text">{aiAnalysis}</div>
        </div>

        <div className="sci-fi-panel right-bottom mobile-optional">
          <h3>ALTITUDE TREND</h3>
          <div className="chart">
            <div className="bar" style={{ height: '40%' }}></div>
            <div className="bar" style={{ height: '60%' }}></div>
            <div className="bar active" style={{ height: '90%' }}></div>
            <div className="bar" style={{ height: '50%' }}></div>
          </div>
        </div>
      </div>
      <div className="footer">CONNECTION: SECURE | GEMINI 2.5 FLASH: ONLINE</div>
    </div>
  );
}
