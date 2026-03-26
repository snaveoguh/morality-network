"use client";

import { useState, useRef, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toBytes } from "viem";

const MAX_TITLE = 120;
const MAX_BODY = 10_000;
const MAX_FILE_MB = 10;
const ACCEPTED_IMAGE = "image/jpeg,image/png,image/gif,image/webp";
const ACCEPTED_VIDEO = "video/mp4,video/webm";

export default function WritePage() {
  const { address, isConnected } = useAccount();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [mediaFiles, setMediaFiles] = useState<
    { file: File; preview: string; type: "image" | "video" }[]
  >([]);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileAdd = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (mediaFiles.length + files.length > 4) {
        alert("Max 4 media files");
        return;
      }
      for (const f of files) {
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
          alert(`${f.name} exceeds ${MAX_FILE_MB}MB limit`);
          return;
        }
        const type = f.type.startsWith("video") ? "video" : "image";
        const preview = URL.createObjectURL(f);
        setMediaFiles((prev) => [...prev, { file: f, preview, type }]);
      }
      e.target.value = "";
    },
    [mediaFiles.length],
  );

  const removeMedia = (idx: number) => {
    setMediaFiles((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handlePublish = async () => {
    if (!title.trim() || !body.trim()) return;
    if (!isConnected) {
      alert("Connect your wallet to publish");
      return;
    }

    setPublishing(true);
    try {
      // Upload media to S3 if any
      const mediaUrls: string[] = [];
      for (const m of mediaFiles) {
        const formData = new FormData();
        formData.append("file", m.file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const { url } = await res.json();
        mediaUrls.push(url);
      }

      // Create article via API
      const res = await fetch("/api/articles/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          category,
          media: mediaUrls,
          author: address,
        }),
      });

      if (!res.ok) throw new Error("Publish failed");
      const { slug, entityHash } = await res.json();

      setPublished(true);
      setPublishedUrl(`/article/${entityHash}`);
    } catch (err: any) {
      alert(err.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  if (published) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mb-4 text-4xl">&#10003;</div>
        <h1 className="font-headline text-2xl font-bold">Published</h1>
        <p className="mt-2 text-sm text-[var(--ink-faint)]">
          Your article is live and can be rated, tipped, and discussed.
        </p>
        <a
          href={publishedUrl}
          className="mt-6 inline-block border border-[var(--ink)] px-6 py-2 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          View Article
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 font-headline text-2xl font-bold tracking-tight">
        Create
      </h1>
      <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        Publish an article to pooter.world
      </p>

      {/* Title */}
      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        Title
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
        placeholder="What's the headline?"
        className="mb-1 w-full border-b-2 border-[var(--rule)] bg-transparent px-0 py-2 font-headline text-xl font-bold outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--ink)]"
      />
      <div className="mb-6 text-right font-mono text-[8px] text-[var(--ink-faint)]">
        {title.length}/{MAX_TITLE}
      </div>

      {/* Category */}
      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        Category
      </label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="mb-6 w-full border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 font-mono text-xs outline-none"
      >
        <option value="general">General</option>
        <option value="world">World</option>
        <option value="politics">Politics</option>
        <option value="tech">Tech</option>
        <option value="crypto">Crypto</option>
        <option value="science">Science</option>
        <option value="environment">Environment</option>
        <option value="business">Business</option>
        <option value="opinion">Opinion</option>
      </select>

      {/* Body */}
      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        Body
      </label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        placeholder="Write your article... Markdown supported."
        rows={16}
        className="mb-1 w-full resize-y border border-[var(--rule)] bg-transparent p-4 font-serif text-sm leading-relaxed outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--ink)]"
      />
      <div className="mb-6 text-right font-mono text-[8px] text-[var(--ink-faint)]">
        {body.length}/{MAX_BODY.toLocaleString()}
      </div>

      {/* Media Upload */}
      <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
        Media (optional &middot; max 4 &middot; {MAX_FILE_MB}MB each)
      </label>

      <div className="mb-6 flex flex-wrap gap-3">
        {mediaFiles.map((m, i) => (
          <div
            key={i}
            className="group relative h-24 w-24 overflow-hidden border border-[var(--rule)]"
          >
            {m.type === "image" ? (
              <img
                src={m.preview}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <video
                src={m.preview}
                className="h-full w-full object-cover"
                muted
              />
            )}
            <button
              type="button"
              onClick={() => removeMedia(i)}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center bg-[var(--ink)] text-[8px] text-[var(--paper)] opacity-0 transition-opacity group-hover:opacity-100"
            >
              ✕
            </button>
            <span className="absolute bottom-0 left-0 right-0 bg-[var(--ink)]/60 py-0.5 text-center font-mono text-[7px] uppercase text-[var(--paper)]">
              {m.type}
            </span>
          </div>
        ))}

        {mediaFiles.length < 4 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-24 w-24 flex-col items-center justify-center border border-dashed border-[var(--rule)] text-[var(--ink-faint)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            <span className="text-lg leading-none">+</span>
            <span className="mt-1 font-mono text-[7px] uppercase tracking-wider">
              Add Media
            </span>
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={`${ACCEPTED_IMAGE},${ACCEPTED_VIDEO}`}
          multiple
          onChange={handleFileAdd}
          className="hidden"
        />
      </div>

      {/* Publish */}
      <div className="flex items-center gap-4 border-t border-[var(--rule)] pt-6">
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || !title.trim() || !body.trim()}
          className="border border-[var(--ink)] bg-[var(--ink)] px-8 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--paper)] transition-colors hover:bg-transparent hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {publishing ? "Publishing..." : "Publish"}
        </button>

        {!isConnected && (
          <span className="font-mono text-[9px] text-[var(--ink-faint)]">
            Connect wallet to publish
          </span>
        )}
      </div>
    </main>
  );
}
