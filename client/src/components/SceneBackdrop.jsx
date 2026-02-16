import { useEffect, useRef } from 'react';

const BASE_POINT_COUNT = 62;
const MAX_POINT_COUNT = 104;
const DEPTH = 620;
const RANGE = 360;

const PALETTES = {
  light: {
    mode: 'bubbles',
    coreGlow: 'rgba(92, 209, 255, 0.2)',
    midGlow: 'rgba(37, 126, 255, 0.14)',
    edgeGlow: 'rgba(8, 18, 40, 0)',
    lineRgb: [90, 168, 255],
    lineAlpha: 0.2,
    pointRgb: [122, 205, 255],
    pointCenterRgb: [236, 250, 255],
    pointAlphaBoost: 0.9,
    pointRadiusBoost: 1.2
  },
  dark: {
    mode: 'stars',
    coreGlow: 'rgba(73, 139, 224, 0.13)',
    midGlow: 'rgba(42, 88, 164, 0.1)',
    edgeGlow: 'rgba(8, 18, 40, 0)',
    lineRgb: [92, 145, 228],
    lineAlpha: 0.13,
    pointRgb: [104, 165, 244],
    pointCenterRgb: [203, 226, 255],
    pointAlphaBoost: 0.78,
    pointRadiusBoost: 1
  }
};

function createPoint(width, height) {
  return {
    x: (Math.random() - 0.5) * width * 0.9,
    y: (Math.random() - 0.5) * height * 0.9,
    z: (Math.random() - 0.5) * RANGE * 2,
    speed: 0.35 + Math.random() * 0.75,
    phase: Math.random() * Math.PI * 2,
    radius: 1.1 + Math.random() * 1.8,
    hueShift: Math.random() * 36
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getThemePalette() {
  if (typeof document === 'undefined') {
    return PALETTES.light;
  }
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'dark' ? PALETTES.dark : PALETTES.light;
}

function drawStars(context, projected, palette) {
  for (let i = 0; i < projected.length; i += 1) {
    const a = projected[i];
    for (let j = i + 1; j < projected.length; j += 1) {
      const b = projected[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > 8800) {
        continue;
      }
      const blend = 1 - distSq / 8800;
      const [lineR, lineG, lineB] = palette.lineRgb;
      context.strokeStyle = `rgba(${lineR}, ${lineG}, ${lineB}, ${blend * palette.lineAlpha})`;
      context.lineWidth = 0.7;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  for (const node of projected) {
    const pointGradient = context.createRadialGradient(
      node.x,
      node.y,
      0,
      node.x,
      node.y,
      Math.max(2.5, node.radius * 2.7)
    );
    const [centerR, centerG, centerB] = palette.pointCenterRgb;
    const [pointR, pointG, pointB] = palette.pointRgb;
    pointGradient.addColorStop(
      0,
      `rgba(${centerR}, ${centerG}, ${centerB}, ${palette.pointAlphaBoost * node.alpha})`
    );
    pointGradient.addColorStop(1, `rgba(${pointR}, ${pointG}, ${pointB}, 0)`);
    context.fillStyle = pointGradient;
    context.beginPath();
    context.arc(node.x, node.y, Math.max(1.3, node.radius), 0, Math.PI * 2);
    context.fill();
  }
}

function drawBubbles(context, projected, palette, pointerX, pointerY) {
  const [lineR, lineG, lineB] = palette.lineRgb;
  const [centerR, centerG, centerB] = palette.pointCenterRgb;
  const [pointR, pointG, pointB] = palette.pointRgb;

  for (let i = 0; i < projected.length - 2; i += 6) {
    const a = projected[i];
    const b = projected[i + 1];
    const c = projected[i + 2];
    const ribbonAlpha = 0.04 + b.scale * 0.04;
    context.strokeStyle = `rgba(${lineR}, ${lineG}, ${lineB}, ${ribbonAlpha})`;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.quadraticCurveTo(
      b.x + pointerX * 18,
      b.y + pointerY * 16,
      c.x,
      c.y
    );
    context.stroke();
  }

  for (const node of projected) {
    const bubbleRadius = Math.max(2.8, node.radius * 2.6);
    const gradient = context.createRadialGradient(
      node.x - bubbleRadius * 0.35,
      node.y - bubbleRadius * 0.35,
      0,
      node.x,
      node.y,
      bubbleRadius
    );
    gradient.addColorStop(
      0,
      `rgba(${centerR}, ${centerG}, ${centerB}, ${(0.42 + node.scale * 0.1) * node.alpha})`
    );
    gradient.addColorStop(
      0.62,
      `rgba(${pointR}, ${pointG}, ${pointB}, ${(0.2 + node.scale * 0.08) * node.alpha})`
    );
    gradient.addColorStop(1, `rgba(${pointR}, ${pointG}, ${pointB}, 0)`);

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(node.x, node.y, bubbleRadius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = `rgba(${lineR}, ${lineG}, ${lineB}, ${0.13 * node.alpha})`;
    context.lineWidth = 0.85;
    context.beginPath();
    context.arc(node.x, node.y, bubbleRadius, 0, Math.PI * 2);
    context.stroke();
  }
}

function SceneBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      return undefined;
    }

    let frame = 0;
    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let targetPointerX = 0;
    let targetPointerY = 0;
    let points = [];
    let palette = getThemePalette();

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      centerX = width / 2;
      centerY = height / 2;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nextCount = clamp(Math.round((width * height) / 26000), BASE_POINT_COUNT, MAX_POINT_COUNT);
      points = new Array(nextCount).fill(0).map(() => createPoint(width, height));
    }

    function onPointerMove(event) {
      const x = (event.clientX / Math.max(width, 1)) * 2 - 1;
      const y = (event.clientY / Math.max(height, 1)) * 2 - 1;
      targetPointerX = clamp(x, -1, 1);
      targetPointerY = clamp(y, -1, 1);
    }

    function onPointerLeave() {
      targetPointerX = 0;
      targetPointerY = 0;
    }

    function drawBackground() {
      context.clearRect(0, 0, width, height);
      palette = getThemePalette();
      const gradient = context.createRadialGradient(
        centerX * (1 - pointerX * 0.08),
        centerY * (1 - pointerY * 0.08),
        10,
        centerX,
        centerY,
        Math.max(width, height) * 0.8
      );
      gradient.addColorStop(0, palette.coreGlow);
      gradient.addColorStop(0.44, palette.midGlow);
      gradient.addColorStop(1, palette.edgeGlow);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }

    function animate(now) {
      pointerX += (targetPointerX - pointerX) * 0.05;
      pointerY += (targetPointerY - pointerY) * 0.05;
      drawBackground();

      const projected = [];
      const time = now * 0.00018;
      const rotY = time * 1.7 + pointerX * 0.7;
      const rotX = Math.sin(time * 1.2) * 0.14 + pointerY * 0.35;
      const sinY = Math.sin(rotY);
      const cosY = Math.cos(rotY);
      const sinX = Math.sin(rotX);
      const cosX = Math.cos(rotX);

      for (const point of points) {
        point.phase += point.speed * 0.014;
        point.z += Math.sin(point.phase) * 0.45;
        if (point.z > RANGE) {
          point.z = -RANGE;
        }
        if (point.z < -RANGE) {
          point.z = RANGE;
        }

        const offsetX = point.x + Math.cos(point.phase + point.hueShift) * 7;
        const offsetY = point.y + Math.sin(point.phase * 0.9) * 7;
        const offsetZ = point.z;

        const rotatedX = offsetX * cosY - offsetZ * sinY;
        const rotatedZ = offsetX * sinY + offsetZ * cosY;
        const rotatedY = offsetY * cosX - rotatedZ * sinX;
        const zDepth = offsetY * sinX + rotatedZ * cosX;

        const scale = DEPTH / (DEPTH + zDepth + RANGE * 0.6);
        const screenX = centerX + rotatedX * scale;
        const screenY = centerY + rotatedY * scale;

        if (screenX < -120 || screenX > width + 120 || screenY < -120 || screenY > height + 120) {
          continue;
        }

        const alpha = clamp((scale - 0.35) * 1.1, 0.08, 0.95);
        const radius =
          point.radius * scale * (1.15 + Math.abs(pointerX) * 0.25) * palette.pointRadiusBoost;
        projected.push({ x: screenX, y: screenY, alpha, radius, scale });
      }

      if (palette.mode === 'stars') {
        drawStars(context, projected, palette);
      } else {
        drawBubbles(context, projected, palette, pointerX, pointerY);
      }

      if (!prefersReducedMotion) {
        frame = window.requestAnimationFrame(animate);
      }
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerleave', onPointerLeave);

    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <div className="scene-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="scene-backdrop__canvas" />
      <div className="scene-backdrop__vignette" />
      <div className="scene-backdrop__halo scene-backdrop__halo--left" />
      <div className="scene-backdrop__halo scene-backdrop__halo--right" />
    </div>
  );
}

export default SceneBackdrop;
