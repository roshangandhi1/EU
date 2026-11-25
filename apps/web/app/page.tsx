import Image from "next/image";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px" }}>
      <Image src="/gocongo-logo.png" alt="GoCongo" width={240} height={80} priority />
      <h1 style={{ color: "var(--gc-green)", marginTop: 32 }}>Programme platform</h1>
      <p>In development. Boreholes, bamboo, miombo woodland and primary schools.</p>
      <p lang="fr" style={{ color: "var(--muted)" }}>
        En développement. Forages, bambou, forêt de miombo et écoles primaires.
      </p>
      <footer style={{ marginTop: 48, paddingTop: 16, borderTop: "4px solid var(--eu-blue)" }}>
        Funded by the European Union · Financé par l&apos;Union européenne
      </footer>
    </main>
  );
}
