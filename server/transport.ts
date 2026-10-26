import { WebSocketTransport } from "@colyseus/ws-transport";

export class MarketWebSocketTransport extends WebSocketTransport {
  protected override autoTerminateUnresponsiveClients(interval: number, retries: number) {
    // Use application traffic for liveness. The public proxy path does not
    // reliably carry native-browser control-frame heartbeats end to end.
    this.pingInterval = setInterval(() => {
      for (const socket of this.wss.clients) {
        const client = socket as typeof socket & {pingCount: number};
        if (client.pingCount >= retries) client.terminate();
        else client.pingCount++;
      }
    }, interval);
  }

  protected override async onConnection(
    ...args: Parameters<WebSocketTransport["onConnection"]>
  ) {
    const [socket] = args;
    // Clock probes continue every ten seconds while snapshots are received.
    socket.on("message", () => { socket.pingCount = 0; });
    return super.onConnection(...args);
  }
}
