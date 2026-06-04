/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Standalone mount for prototype.html — deliberately NOT main.tsx's tree: no
 * EngineGate, no i18n gate, no Tauri handshake. Just the design system
 * (globals.css) + the variant switcher, so it runs in a plain browser tab via
 * `pnpm dev`.
 */
import { createRoot } from "react-dom/client"
import "../styles/globals.css"
import { PrototypeApp } from "./recurrence/app"

const el = document.getElementById("root")
if (el) createRoot(el).render(<PrototypeApp />)
