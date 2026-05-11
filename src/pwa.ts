import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true)
  },
  onOfflineReady() {
    // App shell is cached. New deployments still take priority via auto-update.
  },
  onRegisteredSW(_scriptUrl: string, registration: ServiceWorkerRegistration | undefined) {
    if (!registration) return
    window.setInterval(() => {
      void registration.update()
    }, 60 * 1000)
  },
})
