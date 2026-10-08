import "./styles.css";
import "./user-menu.css";
import "./impostazioni/layout/layout.css";
import "./navigation-enhancer.css";
import "./profilo/profile.css";
import "./utenti/users.css";
import "./supplies-app.css";
import NavigationEnhancer from "./NavigationEnhancer";

export const metadata = {
  title: "Forniture Casa",
  description: "Gestione case, forniture domestiche e fatture",
  icons: {
    icon: "/icon.svg"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}<NavigationEnhancer /></body>
    </html>
  );
}
