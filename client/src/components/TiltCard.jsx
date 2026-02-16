import { useEffect, useRef } from 'react';

function TiltCard({
  as: Element = 'article',
  children,
  className = '',
  style,
  ...props
}) {
  const nodeRef = useRef(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return undefined;
    }

    function onPointerEnter() {
      node.classList.add('is-tilting');
    }

    function onPointerMove(event) {
      if (event.pointerType === 'touch') {
        return;
      }
      const bounds = node.getBoundingClientRect();
      const relativeX = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
      const relativeY = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
      const rotateY = ((relativeX - 0.5) * 10).toFixed(2);
      const rotateX = ((0.5 - relativeY) * 10).toFixed(2);
      node.style.setProperty('--tilt-rotate-x', `${rotateX}deg`);
      node.style.setProperty('--tilt-rotate-y', `${rotateY}deg`);
      node.style.setProperty('--tilt-glow-x', `${(relativeX * 100).toFixed(1)}%`);
      node.style.setProperty('--tilt-glow-y', `${(relativeY * 100).toFixed(1)}%`);
    }

    function onPointerLeave() {
      node.classList.remove('is-tilting');
      node.style.setProperty('--tilt-rotate-x', '0deg');
      node.style.setProperty('--tilt-rotate-y', '0deg');
      node.style.setProperty('--tilt-glow-x', '50%');
      node.style.setProperty('--tilt-glow-y', '35%');
    }

    node.addEventListener('pointerenter', onPointerEnter);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerleave', onPointerLeave);
    return () => {
      node.removeEventListener('pointerenter', onPointerEnter);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <Element ref={nodeRef} className={`tilt-surface ${className}`.trim()} style={style} {...props}>
      {children}
    </Element>
  );
}

export default TiltCard;
