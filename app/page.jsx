const checks = [
  "Build statica con Next.js",
  "Runtime Nginx leggero",
  "Deploy TrueNAS via Compose",
  "Immagine pubblicabile su Gitea"
];

export default function Home() {
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
      </section>
    </main>
  );
}
