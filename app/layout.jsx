import "./styles.css";
import "./user-menu.css";
import "./impostazioni/layout/layout.css";
import "./navigation-enhancer.css";
import "./profilo/profile.css";
import "./utenti/users.css";
import "./conti/banking.css";
import "./conti/banking-modal.css";
import "./conti/import-modal.css";
import "./conti/transaction-actions.css";
import "./conti/pagination.css";
import "./conti/account-summary.css";
import "./conti/transaction-detail.css";
import "./conti/transaction-layout.css";
import "./report/report-hierarchy.css";
import "./conti/transaction-sort.css";
import "./conti/transaction-filters.css";
import "./conti/transaction-assignment.css";
import "./conti/transaction-columns.css";
import "./report/report.css";
import "./categorie/categories.css";
import "./categorie/categories-actions.css";
import "./categorie/tree-clean.css";
import "./categorie/tree-pretty.css";
import "./categorie/category-modal.css";
import "./categorie/tree-status.css";
import NavigationEnhancer from "./NavigationEnhancer";

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
      <body>{children}<NavigationEnhancer /></body>
    </html>
  );
}
