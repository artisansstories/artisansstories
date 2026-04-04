"use client";

import { useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage("You're on the list. We'll be in touch.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Try again.");
    }
  };

  return (
    <main className="min-h-screen bg-[#faf7f2] flex flex-col">

      {/* Nav */}
      <nav className="w-full px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="text-xl font-bold tracking-tight text-[#2c1810]">
          Artisans Stories
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">

          <div className="inline-block bg-[#e8ddd0] text-[#6b4c2a] text-xs font-semibold tracking-widest uppercase px-4 py-2 rounded-full mb-8">
            Coming Soon
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-[#2c1810] leading-tight mb-6">
            Every piece has<br/>
            <span className="text-[#8b4513]">a story worth telling.</span>
          </h1>

          <p className="text-lg text-[#6b5744] leading-relaxed mb-12 max-w-xl mx-auto">
            Handcrafted goods from El Salvador&apos;s most talented artisans.
            We&apos;re building something special — be the first to know when we launch.
          </p>

          {/* Email capture */}
          {status === "success" ? (
            <div className="bg-[#e8f5e9] border border-[#a5d6a7] rounded-xl px-8 py-5 text-[#2e7d32] font-medium text-lg">
              ✓ {message}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                required
                className="flex-1 px-5 py-3.5 rounded-xl border border-[#d4c4b0] bg-white text-[#2c1810] placeholder-[#a89070] focus:outline-none focus:ring-2 focus:ring-[#8b4513] focus:border-transparent text-base"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="px-7 py-3.5 bg-[#8b4513] hover:bg-[#7a3b10] text-white font-semibold rounded-xl transition-colors disabled:opacity-60 text-base whitespace-nowrap"
              >
                {status === "loading" ? "Joining..." : "Notify Me"}
              </button>
            </form>
          )}

          {status === "error" && (
            <p className="mt-3 text-red-600 text-sm">{message}</p>
          )}

          <p className="mt-4 text-sm text-[#a89070]">
            No spam. Just our launch announcement.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center text-sm text-[#a89070]">
        © {new Date().getFullYear()} Artisans Stories · Crafted with care
      </footer>

    </main>
  );
}
