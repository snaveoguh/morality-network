"use client";

import React, { useState } from "react";

interface SourceFile {
  name: string;
  content: string;
}

interface CodeTabProps {
  contractName: string;
  sources: SourceFile[];
  compiler?: string;
  optimizationUsed?: boolean;
  runs?: number;
  verified: boolean;
  riskFlags?: string[];
}

export function CodeTab({
  contractName,
  sources,
  compiler,
  optimizationUsed,
  runs,
  verified,
  riskFlags = [],
}: CodeTabProps) {
  const [activeFile, setActiveFile] = useState(0);

  if (!verified || sources.length === 0) {
    return (
      <div className="mt-6 border border-[var(--rule-light)] p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--ink-faint)]">
          Contract source not verified
        </p>
        <p className="mt-2 font-body-serif text-sm text-[var(--ink-light)]">
          This contract has not been verified on the block explorer.
          Source code is unavailable.
        </p>
      </div>
    );
  }

  const currentSource = sources[activeFile];

  return (
    <div className="mt-4">
      {/* Contract name + compiler info */}
      <div className="flex items-center justify-between border-b border-[var(--rule-light)] pb-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          {contractName.toUpperCase()}.SOL
        </span>
        {compiler && (
          <span className="font-mono text-[9px] text-[var(--ink-faint)]">
            {compiler}
            {optimizationUsed && ` | opt ${runs ?? 200} runs`}
          </span>
        )}
      </div>

      {/* Risk flags */}
      {riskFlags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {riskFlags.map((flag) => (
            <span
              key={flag}
              className="border border-[var(--accent-red)] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[var(--accent-red)]"
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* File tabs */}
      {sources.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-0 overflow-x-auto border-b border-[var(--rule-light)]">
          {sources.map((file, i) => (
            <button
              key={file.name}
              onClick={() => setActiveFile(i)}
              className={`whitespace-nowrap px-3 py-1.5 font-mono text-[10px] transition-colors ${
                i === activeFile
                  ? "border-b-2 border-[var(--ink)] font-bold text-[var(--ink)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {file.name}
            </button>
          ))}
        </div>
      )}

      {/* Source code */}
      <div className="relative mt-2">
        {/* Expand button */}
        <button
          className="absolute right-2 top-2 font-mono text-[9px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
          onClick={() => {
            const el = document.getElementById("source-code-block");
            if (el) el.classList.toggle("max-h-[600px]");
          }}
        >
          &#x26F6;
        </button>
        <pre
          id="source-code-block"
          className="max-h-[600px] overflow-auto border border-[var(--rule-light)] bg-[var(--paper-dark)] p-4 font-mono text-xs leading-relaxed text-[var(--ink)]"
        >
          {currentSource?.content.split("\n").map((line, i) => (
            <div key={i} className="flex">
              <span className="mr-4 inline-block w-8 select-none text-right text-[var(--ink-faint)]">
                {i + 1}
              </span>
              <code className="flex-1">
                {highlightSolidity(line)}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/** Minimal Solidity syntax highlighting using spans */
function highlightSolidity(line: string): React.JSX.Element {
  // Keywords
  const keywords =
    /\b(pragma|solidity|import|contract|interface|library|function|modifier|event|struct|enum|mapping|returns?|memory|storage|calldata|public|private|internal|external|view|pure|payable|nonpayable|virtual|override|abstract|constant|immutable|indexed|anonymous|if|else|for|while|do|break|continue|return|emit|require|assert|revert|new|delete|using|is|try|catch)\b/g;
  const types =
    /\b(address|bool|string|bytes\d*|uint\d*|int\d*)\b/g;
  const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/g;
  const strings = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  const numbers = /\b(0x[a-fA-F0-9]+|\d+)\b/g;

  // Simple replace approach — comments take priority
  let html = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Apply highlighting in order of priority
  html = html
    .replace(comments, '<span class="text-[var(--ink-faint)]">$1</span>')
    .replace(strings, '<span class="text-[#98c379]">$1</span>')
    .replace(keywords, '<span class="text-[#c678dd]">$1</span>')
    .replace(types, '<span class="text-[#e5c07b]">$1</span>')
    .replace(numbers, '<span class="text-[#d19a66]">$1</span>');

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
