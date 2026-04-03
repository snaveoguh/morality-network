"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const projects = [
  {
    title: "Project One",
    description: "A brief description of your first project and what it does.",
    gradient: "from-violet-600 to-indigo-900",
    link: "#",
  },
  {
    title: "Project Two",
    description: "A brief description of your second project and what it does.",
    gradient: "from-emerald-600 to-teal-900",
    link: "#",
  },
  {
    title: "Project Three",
    description: "A brief description of your third project and what it does.",
    gradient: "from-orange-500 to-rose-900",
    link: "#",
  },
];

function PlaceholderSVG({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Abstract geometric placeholder — replace with your SVG */}
      <circle cx="200" cy="200" r="150" stroke="white" strokeWidth="2" />
      <circle cx="200" cy="200" r="100" stroke="white" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="50" stroke="white" strokeWidth="1" />
      <line x1="50" y1="200" x2="350" y2="200" stroke="white" strokeWidth="1" />
      <line x1="200" y1="50" x2="200" y2="350" stroke="white" strokeWidth="1" />
      <polygon
        points="200,80 280,240 120,240"
        stroke="white"
        strokeWidth="1.5"
        fill="none"
      />
      <polygon
        points="200,320 120,160 280,160"
        stroke="white"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

export default function PortfolioPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=300%",
          pin: true,
          scrub: 1,
          anticipatePin: 1,
        },
      });

      // Phase 1: SVG scales down and moves up
      tl.to(
        svgRef.current,
        {
          scale: 0.3,
          y: "-30vh",
          duration: 1,
          ease: "power2.inOut",
        },
        0
      );

      // Fade out the tagline
      tl.to(
        ".portfolio-tagline",
        {
          opacity: 0,
          y: -40,
          duration: 0.5,
          ease: "power2.in",
        },
        0
      );

      // Phase 2: Cards container fades in
      tl.fromTo(
        cardsRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3 },
        0.6
      );

      // Phase 2: Cards stagger in
      tl.fromTo(
        cardRefs.current,
        {
          y: 100,
          opacity: 0,
          scale: 0.85,
        },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.8,
          stagger: 0.15,
          ease: "power3.out",
        },
        0.7
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <>
      {/* Override the default page background */}
      <style>{`
        body { background: #0a0a0a !important; }
        main { max-width: none !important; padding: 0 !important; }
        header, [class*="marquee"], [class*="Banner"], [class*="banner"] {
          display: none !important;
        }
      `}</style>

      <div
        ref={containerRef}
        className="relative h-screen w-screen overflow-hidden bg-[#0a0a0a]"
      >
        {/* Hero content */}
        <div
          ref={heroRef}
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          {/* SVG Illustration */}
          <div ref={svgRef} className="w-[min(60vw,400px)] h-[min(60vw,400px)]">
            <PlaceholderSVG className="w-full h-full" />
          </div>

          {/* Tagline */}
          <p className="portfolio-tagline mt-8 text-white/60 text-lg md:text-xl tracking-[0.3em] uppercase font-light">
            Your Name Here
          </p>
        </div>

        {/* Project Cards */}
        <div
          ref={cardsRef}
          className="absolute inset-0 flex items-end justify-center pb-[8vh] px-6 opacity-0"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
            {projects.map((project, i) => (
              <a
                key={project.title}
                href={project.link}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className="group block rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-colors"
              >
                {/* Project image placeholder */}
                <div
                  className={`h-48 bg-gradient-to-br ${project.gradient} transition-transform duration-500 group-hover:scale-105`}
                />
                <div className="p-5">
                  <h3 className="text-white text-lg font-medium mb-2">
                    {project.title}
                  </h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    {project.description}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Spacer so page has somewhere to scroll after unpin */}
      <div className="h-screen bg-[#0a0a0a]" />
    </>
  );
}
