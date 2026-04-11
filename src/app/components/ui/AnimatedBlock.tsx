'use client';

import { useEffect, useState, useRef, ReactNode } from 'react';

interface AnimatedBlockProps {
  children: ReactNode;
  classNameInView: string;
  classNameNotInView: string;
}

export default function AnimatedBlock({ children, classNameInView, classNameNotInView }: AnimatedBlockProps) {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (ref.current) observer.unobserve(ref.current);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${isInView ? classNameInView : classNameNotInView}`}
    >
      {children}
    </div>
  );
}