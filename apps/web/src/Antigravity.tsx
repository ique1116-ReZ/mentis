import { useEffect, useRef } from "react";

type ParticleShape = "circle" | "capsule";

type AntigravityProps = {
  count?: number;
  magnetRadius?: number;
  ringRadius?: number;
  waveSpeed?: number;
  waveAmplitude?: number;
  particleSize?: number;
  lerpSpeed?: number;
  color?: string;
  autoAnimate?: boolean;
  particleVariance?: number;
  rotationSpeed?: number;
  depthFactor?: number;
  pulseSpeed?: number;
  particleShape?: ParticleShape;
  fieldStrength?: number;
};

type Particle = {
  angle: number;
  distance: number;
  depth: number;
  phase: number;
  size: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

export function Antigravity({
  count = 300,
  magnetRadius = 10,
  ringRadius = 10,
  waveSpeed = 0.4,
  waveAmplitude = 1,
  particleSize = 2,
  lerpSpeed = 0.1,
  color = "#F97316",
  autoAnimate = false,
  particleVariance = 1,
  rotationSpeed = 0,
  depthFactor = 1,
  pulseSpeed = 3,
  particleShape = "capsule",
  fieldStrength = 10,
}: AntigravityProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    let frame = 0;
    let animationId = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const createParticles = () => {
      particlesRef.current = Array.from({ length: count }, (_, index) => {
        const orbit = Math.sqrt((index + 0.5) / count);
        const angle = index * 2.399963229728653 + Math.random() * 0.25;
        const size = particleSize + Math.random() * particleVariance;

        return {
          angle,
          distance: orbit,
          depth: 0.35 + Math.random() * 0.65,
          phase: Math.random() * Math.PI * 2,
          size,
          x: width / 2,
          y: height / 2,
          targetX: width / 2,
          targetY: height / 2,
        };
      });
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      createParticles();
    };

    const drawParticle = (particle: Particle, elapsed: number) => {
      const pulse = 1 + Math.sin(elapsed * pulseSpeed + particle.phase) * 0.22;
      const size = particle.size * pulse * (0.75 + particle.depth * depthFactor * 0.28);

      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle + elapsed * rotationSpeed);
      context.globalAlpha = 0.34 + particle.depth * 0.52;
      context.fillStyle = color;

      if (particleShape === "capsule") {
        const capsuleWidth = size * 4.4;
        const capsuleHeight = size * 1.45;
        context.beginPath();
        context.roundRect(-capsuleWidth / 2, -capsuleHeight / 2, capsuleWidth, capsuleHeight, capsuleHeight / 2);
        context.fill();
      } else {
        context.beginPath();
        context.arc(0, 0, size, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    };

    const render = () => {
      frame += 1;
      const elapsed = frame / 60;
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.41;
      const pointerX = pointerRef.current.x * width;
      const pointerY = pointerRef.current.y * height;

      context.clearRect(0, 0, width, height);

      for (const particle of particlesRef.current) {
        const wave = Math.sin(elapsed * waveSpeed + particle.phase) * waveAmplitude;
        const orbitRadius = baseRadius * (0.14 + particle.distance * 0.86) + ringRadius * wave;
        const angle = particle.angle + elapsed * rotationSpeed;
        const fieldX = centerX + Math.cos(angle) * orbitRadius;
        const fieldY = centerY + Math.sin(angle) * orbitRadius;
        const dx = fieldX - pointerX;
        const dy = fieldY - pointerY;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const influence = pointerRef.current.active || autoAnimate
          ? Math.max(0, 1 - distance / (magnetRadius * 32))
          : 0;
        const lift = influence * fieldStrength * (0.45 + particle.depth);

        particle.targetX = fieldX + (dx / distance) * lift;
        particle.targetY = fieldY + (dy / distance) * lift;
        particle.x += (particle.targetX - particle.x) * lerpSpeed;
        particle.y += (particle.targetY - particle.y) * lerpSpeed;
        drawParticle(particle, elapsed);
      }

      animationId = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height,
        active: true,
      };
    };

    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };

    resize();
    render();
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [
    autoAnimate,
    color,
    count,
    depthFactor,
    fieldStrength,
    lerpSpeed,
    magnetRadius,
    particleShape,
    particleSize,
    particleVariance,
    pulseSpeed,
    ringRadius,
    rotationSpeed,
    waveAmplitude,
    waveSpeed,
  ]);

  return <canvas className="antigravity-canvas" ref={canvasRef} aria-hidden="true" />;
}
