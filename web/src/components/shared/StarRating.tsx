"use client";

import { useState } from "react";

interface StarRatingProps {
  rating: number; // 0-5
  maxStars?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (score: number) => void;
  count?: number;
}

export function StarRating({
  rating,
  maxStars = 5,
  size = "md",
  interactive = false,
  onRate,
  count,
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {Array.from({ length: maxStars }, (_, i) => {
          const starValue = i + 1;
          const filled = interactive
            ? starValue <= (hovered || rating)
            : starValue <= Math.round(rating);

          return (
            <button
              key={i}
              type="button"
              disabled={!interactive}
              className={`${interactive ? "cursor-pointer" : "cursor-default"} transition-colors`}
              onMouseEnter={() => interactive && setHovered(starValue)}
              onMouseLeave={() => interactive && setHovered(0)}
              onClick={() => interactive && onRate?.(starValue)}
            >
              <svg
                className={`${sizeClasses[size]} ${
                  filled ? "text-yellow-400" : "text-zinc-600"
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          );
        })}
      </div>
      {count !== undefined && (
        <span className="text-xs text-zinc-500">({count})</span>
      )}
    </div>
  );
}
