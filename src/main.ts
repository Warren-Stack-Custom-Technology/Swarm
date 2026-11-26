import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
async function boot() {
  // Old VueTorrent service workers must not keep serving the previous application.
  if ("serviceWorker" in navigator) {
    try {
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        const script = registration.active?.scriptURL;
        if (
          script &&
          new URL(script).origin === location.origin &&
          /\/(sw|service-worker)\.js$/.test(new URL(script).pathname)
        )
          await registration.unregister();
      }
    } catch {
      /* continue without offline caching */
    }
  }
  if (import.meta.env.DEV && import.meta.env.VITE_SWARM_DEMO === "true") {
    const demo = await import("./demo");
    demo.installDemo();
  }
  createApp(App).mount("#app");
}
void boot();
