"use client";

import { useEffect, useState } from "react";
import { getReadiness } from "@/lib/api";

type Readiness = { state: "checking" | "ready" | "error"; message: string };

export default function Home() {
  const [readiness, setReadiness] = useState<Readiness>({ state: "checking", message: "Checking your API and database…" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getReadiness(controller.signal)
      .then((message) => setReadiness({ state: "ready", message }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setReadiness({ state: "error", message: error instanceof Error ? error.message : "Connection check failed." });
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-20">
      <header className="mb-16 flex items-center justify-between gap-4">
        <span className="text-xl font-bold tracking-tight">neo<span className="text-indigo-600">stat</span>.</span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">HACKATHON STARTER</span>
      </header>
      <p className="mb-4 text-xs font-bold tracking-[0.2em] text-indigo-600">YOUR STARTING POINT</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Ready for the next idea.</h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-slate-500">The foundation is in place. Build your challenge on React, Express, Node.js, and MongoDB, with TypeScript from end to end.</p>
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="connection-heading">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="connection-heading" className="font-semibold">Connection check</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${readiness.state === "ready" ? "bg-emerald-50 text-emerald-700" : readiness.state === "error" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
            {readiness.state === "ready" ? "All systems ready" : readiness.state === "error" ? "Action needed" : "Checking…"}
          </span>
        </div>
        <p role="status" aria-live="polite" className="mt-4 text-sm leading-6 text-slate-500">{readiness.message}</p>
        <button type="button" disabled={readiness.state === "checking"} onClick={() => {
          setReadiness({ state: "checking", message: "Checking your API and database…" });
          setAttempt((value) => value + 1);
        }} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:opacity-50">Check again</button>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Project structure">
        {[
          { title: "Frontend", path: "client/", text: "Next.js App Router, React, and Tailwind CSS." },
          { title: "Backend", path: "server/", text: "A separate Express API with validated inputs." },
          { title: "Database", path: "server/src/models/", text: "MongoDB models, versioned migrations, and sample data." },
        ].map((item) => (
          <article key={item.title} className="rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
            <code className="mt-4 block text-xs text-indigo-600">{item.path}</code>
          </article>
        ))}
      </section>
      <footer className="mt-10 text-sm leading-6 text-slate-500">Start with the root README for commands and architecture. The challenge brief will define the application features.</footer>
    </main>
  );
}
