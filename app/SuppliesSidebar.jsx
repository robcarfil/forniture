"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CurrentDateTime from "./CurrentDateTime";

export default function SuppliesSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const fornitureActive = pathname === "/forniture" || pathname === "/";
  const caseActive = pathname === "/case";
  const fornitoriActive = pathname === "/fornitori";
  const [user, setUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        if (!mounted) return;
        if (res.ok && data.user) setUser(data.user);
        else setUser(null);
      } catch (e) {
        if (!mounted) return;
        setUser(null);
      }
    })();
    const onAuthChange = (ev) => {
      try {
        const detail = ev?.detail;
        if (detail && Object.prototype.hasOwnProperty.call(detail, 'user')) setUser(detail.user);
        else setUser(null);
      } catch {
        setUser(null);
      }
    };
    const logoutAfterInactivity = async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (e) {
        // ignore
      }
      setUser(null);
      try { window.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: null } })); } catch (e) {}
      router.push('/login?expired=1');
    };

    let timeoutId;
    const resetTimer = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(logoutAfterInactivity, 30 * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    window.addEventListener('auth:changed', onAuthChange);
    return () => {
      mounted = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      window.removeEventListener('auth:changed', onAuthChange);
    };
  }, [router]);

  return (
    <div className="supplies-sidebar-shell">
      <div className="supplies-sidebar-topbar">
        <CurrentDateTime />
      </div>
      <aside className={"supplies-sidebar panel" + (sidebarCollapsed ? " is-collapsed" : "")}>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? "Espandi menu" : "Comprimi menu"}
          title={sidebarCollapsed ? "Espandi menu" : "Comprimi menu"}
        >
          {sidebarCollapsed ? "»" : "«"}
        </button>

        <p className="sidebar-eyebrow">Menu</p>
        {!user && (
          <div className="sidebar-auth-status">
            <a className="table-link-button" href="/profilo">Non autenticato — Accedi</a>
          </div>
        )}
        <a className={"sidebar-parent" + (fornitureActive ? " active" : "")} href="/">Forniture</a>
        <nav className="sidebar-children" aria-label="Sottomenu forniture">
          <a className={caseActive ? "active" : ""} href="/case">Case</a>
          <a className={fornitoriActive ? "active" : ""} href="/fornitori">Fornitori</a>
        </nav>

        <div className="sidebar-footer">
          {user ? (
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: '0.9rem', color: '#35534c', marginBottom: 6, textAlign: 'center' }}>{user.username}</div>
              <button
                className="ghost"
                onClick={async () => {
                    try {
                      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                    } catch (e) {
                      // ignore
                    }
                    // notify other parts of the app
                    try { window.dispatchEvent(new CustomEvent('auth:changed', { detail: { user: null } })); } catch (e) {}
                    router.push('/login');
                  }}
              >Logout</button>
            </div>
          ) : (
            <a className="ghost" href="/profilo">Accedi</a>
          )}
        </div>
      </aside>
    </div>
  );
}
