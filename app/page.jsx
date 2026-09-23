"use client";

import { useState } from "react";

const checks = [
  "Build statica con Next.js",
  "Runtime Nginx leggero",
  "Deploy TrueNAS via Compose",
  "Immagine pubblicabile su Gitea"
];

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">TrueNAS SCALE App</p>
        <h1>GenerApp</h1>
        <p className="lead">
          Applicazione web containerizzata, pronta per essere installata su
          TrueNAS SCALE tramite Docker Compose.
        </p>
      </section>

      <section className="panel" aria-label="Stato deploy">
        <h2>Pronta al deploy</h2>
        <div className="grid">
          {checks.map((item) => (
            <article key={item} className="card">
              <span className="status" aria-hidden="true" />
              <p>{item}</p>
            </article>
          ))}
        </div>
        <button className="open-modal" type="button" onClick={() => setIsModalOpen(true)}>
          Apri modal
        </button>
      </section>

      {isModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsModalOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="modal-title">Messaggio</h2>
            <p>ciao</p>
            <button className="close-modal" type="button" onClick={() => setIsModalOpen(false)}>
              Chiudi
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
