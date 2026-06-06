import React, { useState, useEffect, useRef } from 'react';
import { saveVisitor } from '../utils/db';
import { Shield, ArrowRight, User, Users, Heart } from 'lucide-react';

interface VisitorEntryProps {
  onComplete: (name: string) => void;
}

type Phase = 'input' | 'terminal' | 'particles' | 'done';
type Relationship = '朋友' | '家人' | '路人';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  originX: number;
  originY: number;
  size: number;
  color: string;
  alpha: number;
  active: boolean;
}

export default function VisitorEntry({ onComplete }: VisitorEntryProps) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('朋友');
  const [phase, setPhase] = useState<Phase>('input');
  
  // Terminal logs state
  const [terminalLines, setTerminalLines] = useState<Array<{ text: string; type: 'success' | 'info' | 'accent' }>>([]);
  const [visitorCount, setVisitorCount] = useState(0);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  // ── 1. Background Particles Initialization ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initial 800 background particles (stars)
    const count = 600;
    const colors = [
      'rgba(14, 165, 233, ', // cyan
      'rgba(217, 70, 239, ', // magenta
      'rgba(45, 212, 191, ', // teal
      'rgba(129, 140, 248, ', // indigo
    ];

    const tempParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      tempParticles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        tx: x,
        ty: y,
        originX: x,
        originY: y,
        size: Math.random() * 2 + 0.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.3,
        active: true,
      });
    }
    particlesRef.current = tempParticles;

    // Track mouse
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('touchmove', handleTouchMove);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, []);

  // ── 2. Canvas Animation Loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateAndDraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p.active) continue;

        if (phase === 'input' || phase === 'terminal') {
          // ── Background Drifting Mode ──
          p.x += p.vx;
          p.y += p.vy;

          // Wrap edges
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;

          // Draw star
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${p.alpha})`;
          ctx.fill();
        } else if (phase === 'particles') {
          // ── Text Morphing Mode (Spring forces + mouse physics) ──
          const dx = p.tx - p.x;
          const dy = p.ty - p.y;
          
          // Spring physics
          const springForce = 0.065;
          const friction = 0.83;

          p.vx = (p.vx + dx * springForce) * friction;
          p.vy = (p.vy + dy * springForce) * friction;

          // Mouse Repulsion
          const mx = mouse.x - p.x;
          const my = mouse.y - p.y;
          const mDist = Math.sqrt(mx * mx + my * my);
          
          if (mDist < 90) {
            const angle = Math.atan2(my, mx);
            const push = (90 - mDist) * 0.22; // Repulsion speed
            p.vx -= Math.cos(angle) * push;
            p.vy -= Math.sin(angle) * push;
          }

          p.x += p.vx;
          p.y += p.vy;

          // Draw particle
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${p.alpha})`;
          ctx.fill();
        } else if (phase === 'done') {
          // ── Dispersion Outward Mode ──
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.015; // Fade out

          if (p.alpha > 0) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `${p.color}${p.alpha})`;
            ctx.fill();
          }
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(updateAndDraw);
    };

    animationFrameIdRef.current = requestAnimationFrame(updateAndDraw);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [phase]);

  // ── 3. Shortcut Login ──
  const handleShortcutLogin = async () => {
    const bloggerName = 'ooolj';
    const bloggerRel: Relationship = '家人';
    setName(bloggerName);
    setRelationship(bloggerRel);
    try {
      const count = await saveVisitor({
        name: bloggerName,
        relationship: bloggerRel,
        timestamp: Date.now(),
      });
      setVisitorCount(count);
      setPhase('terminal');
    } catch (err) {
      console.error('Database logging failed:', err);
      setVisitorCount(1);
      setPhase('terminal');
    }
  };

  // ── 4. Handle Form Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Save visitor details to DB and fetch visit order
    try {
      const count = await saveVisitor({
        name: name.trim(),
        relationship,
        timestamp: Date.now(),
      });
      setVisitorCount(count);
      setPhase('terminal');
    } catch (err) {
      console.error('Database logging failed:', err);
      // Fallback
      setVisitorCount(1);
      setPhase('terminal');
    }
  };

  // ── 4. Terminal Simulation Sequence ──
  useEffect(() => {
    if (phase !== 'terminal') return;

    const lines = [
      { text: '正在初始化量子传输网络...', delay: 200, type: 'info' as const },
      { text: '正在发起安全握手协议...', delay: 500, type: 'info' as const },
      { text: '写入本地数据库... [成功]', delay: 900, type: 'success' as const },
      { text: `身份锁定: ${name} (关系: ${relationship})`, delay: 1300, type: 'accent' as const },
      { text: `访问记录校验完毕: 您是第 ${visitorCount} 位开启这段旅行回忆的贵宾。`, delay: 1800, type: 'accent' as const },
      { text: '正在编译粒子特征流，启动记忆投射仪...', delay: 2400, type: 'info' as const },
    ];

    lines.forEach((line) => {
      setTimeout(() => {
        setTerminalLines((prev) => [...prev, { text: line.text, type: line.type }]);
      }, line.delay);
    });

    // End terminal sequence and start particle text
    setTimeout(() => {
      generateTextParticles();
      setPhase('particles');
    }, 3100);
  }, [phase, visitorCount]);

  // ── 5. Generate Particle Target Positions for Text ──
  const generateTextParticles = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create an offscreen canvas to scan text pixels
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;

    // Responsive sizing logic
    const isMobile = canvas.width < 768;
    const fontSize = isMobile ? Math.min(32, canvas.width / 10) : 48;
    offCtx.font = `bold ${fontSize}px var(--font-cn)`;
    offCtx.fillStyle = '#ffffff';
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';

    const text = `欢迎 ${name}`;
    offCtx.fillText(text, canvas.width / 2, canvas.height / 2);

    // Read pixels
    const imgData = offCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const targetPoints: { x: number; y: number }[] = [];

    // Scan the pixels on a grid to limit particle count
    const scanStep = isMobile ? 3 : 4; // Tighter grid on mobile for readable text
    for (let y = 0; y < canvas.height; y += scanStep) {
      for (let x = 0; x < canvas.width; x += scanStep) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];
        if (alpha > 128) {
          targetPoints.push({ x, y });
        }
      }
    }

    // Map targets to particles
    const currentParticles = [...particlesRef.current];
    const colors = [
      'rgba(14, 165, 233, ', // cyan
      'rgba(217, 70, 239, ', // magenta
      'rgba(45, 212, 191, ', // teal
      'rgba(129, 140, 248, ', // indigo
    ];

    // Shuffle points for neat particle dispersion
    for (let i = targetPoints.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targetPoints[i], targetPoints[j]] = [targetPoints[j], targetPoints[i]];
    }

    const newParticles: Particle[] = [];
    const targetCount = targetPoints.length;

    for (let i = 0; i < targetCount; i++) {
      const pt = targetPoints[i];
      if (i < currentParticles.length) {
        // Recycle existing particle: keep its current position, assign new target
        const p = currentParticles[i];
        p.tx = pt.x;
        p.ty = pt.y;
        p.originX = pt.x;
        p.originY = pt.y;
        p.alpha = Math.random() * 0.55 + 0.45; // slightly brighter for text
        p.size = Math.random() * 1.5 + 1.2;
        p.active = true;
        newParticles.push(p);
      } else {
        // Spawn additional particle from the center/edges
        const spawnFromCenter = Math.random() > 0.4;
        const x = spawnFromCenter 
          ? canvas.width / 2 + (Math.random() - 0.5) * 100 
          : Math.random() * canvas.width;
        const y = spawnFromCenter 
          ? canvas.height / 2 + (Math.random() - 0.5) * 100 
          : Math.random() * canvas.height;

        newParticles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          tx: pt.x,
          ty: pt.y,
          originX: pt.x,
          originY: pt.y,
          size: Math.random() * 1.5 + 1.2,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: Math.random() * 0.55 + 0.45,
          active: true,
        });
      }
    }

    // Deactivate excess particles or let them float off screen
    for (let i = targetCount; i < currentParticles.length; i++) {
      const p = currentParticles[i];
      // Make them float away slowly as background elements
      p.tx = Math.random() * canvas.width;
      p.ty = Math.random() * canvas.height;
      p.alpha = Math.random() * 0.15 + 0.05; // fade them out mostly
    }

    particlesRef.current = [...newParticles, ...currentParticles.slice(targetCount)];
  };

  // ── 6. Particle Morphing Duration and Fade out ──
  useEffect(() => {
    if (phase !== 'particles') return;

    // Display text for 3.5 seconds, then explode and fade out
    const textTimer = setTimeout(() => {
      setPhase('done');

      // Add high random velocities to explode particles outward
      particlesRef.current.forEach((p) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 4;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      });

      // After dispersion starts, fade out container, then call onComplete
      const fadeTimer = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.style.opacity = '0';
        }
        
        const exitTimer = setTimeout(() => {
          onComplete(name.trim());
        }, 1100);

        return () => clearTimeout(exitTimer);
      }, 800);

      return () => clearTimeout(fadeTimer);
    }, 3600);

    return () => clearTimeout(textTimer);
  }, [phase, name, onComplete]);

  return (
    <div 
      ref={containerRef} 
      className="visitor-entry-container"
    >
      {/* Background Interactive Particles */}
      <canvas 
        ref={canvasRef} 
        className="visitor-canvas" 
      />

      {/* ── PHASE 1: INPUT FORM ── */}
      {phase === 'input' && (
        <form 
          onSubmit={handleSubmit}
          className="visitor-entry-card"
        >
          <div className="visitor-header">
            <div className="visitor-logo-ring">
              <Shield size={26} />
            </div>
            <h2>身份验证 PORTAL</h2>
            <p>在进入这段桂西北大环线回忆前，请输入姓名以解锁记忆投影</p>
          </div>

          <div className="visitor-form-group">
            <label className="visitor-label">您的姓名 / Visitor Name</label>
            <div className="neon-input-wrapper">
              <input 
                type="text" 
                className="neon-input" 
                placeholder="请输入名字（建议使用昵称）" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="visitor-form-group">
            <label className="visitor-label">您与博主的关系 / Connection</label>
            <div className="relationship-grid">
              {(['朋友', '家人', '路人'] as Relationship[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRelationship(r)}
                  className={`relationship-opt ${relationship === r ? 'active' : ''}`}
                >
                  {r === '朋友' && <Users size={14} />}
                  {r === '家人' && <Heart size={14} />}
                  {r === '路人' && <User size={14} />}
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </div>

          <button 
            type="submit" 
            className="neon-btn flex items-center justify-center gap-2"
          >
            <span>开启记忆</span>
            <ArrowRight size={18} />
          </button>

          <div className="flex justify-between items-center mt-4 pt-2 border-t border-slate-500/10 text-xs text-slate-400">
            <button
              type="button"
              onClick={handleShortcutLogin}
              className="text-[#0ea5e9] hover:underline cursor-pointer bg-transparent border-none p-0 flex items-center gap-1 font-medium"
            >
              我是博主 (快捷测试通道)
            </button>
            <span className="text-[10px] text-slate-500">测试阶段</span>
          </div>
        </form>
      )}

      {/* ── PHASE 2: SCI-FI TERMINAL ── */}
      {phase === 'terminal' && (
        <div className="terminal-readout">
          <div className="flex items-center gap-2 border-b border-green-500/20 pb-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-[10px] uppercase tracking-wider text-green-500/60 ml-2">SYSTEM CONSOLE v1.0.9</span>
          </div>
          {terminalLines.map((line, idx) => (
            <div key={idx} className={`terminal-line ${line.type}`}>
              <span>&gt;</span>
              <span>{line.text}</span>
            </div>
          ))}
          <div className="terminal-line success mt-2">
            <span>&gt;</span>
            <span className="caret" />
          </div>
        </div>
      )}

      {/* ── PHASE 3 & 4: PARTICLE TEXT / DONE ── */}
      {(phase === 'particles' || phase === 'done') && (
        <div className="pointer-events-none select-none fixed inset-0 flex flex-col justify-end items-center pb-24 z-20">
          <p className="text-white/20 text-xs tracking-[4px] uppercase animate-pulse">
            [ 鼠标移动可使粒子云产生排斥波动 ]
          </p>
        </div>
      )}
    </div>
  );
}
