import "./styles.css";

export const metadata = {
  title: "GenerApp",
  description: "Web app pronta per il catalogo TrueNAS SCALE",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
