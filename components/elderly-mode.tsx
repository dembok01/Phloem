"use client";

// Elderly mode (§10): applied for `member` logins from the app shell. Stamps the
// `elderly` class on <html> so the token overrides in globals.css (20px root,
// AAA muted contrast, firmer borders, zero motion) reach every rem-based size.
import * as React from "react";

export function ElderlyMode() {
  React.useEffect(() => {
    document.documentElement.classList.add("elderly");
    return () => document.documentElement.classList.remove("elderly");
  }, []);
  return null;
}
