/** Runs once when the server starts: reconnect WhatsApp (if a phone is linked) and start the message sender. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWhatsApp } = await import("./server/whatsapp/worker");
    startWhatsApp();
  }
}
