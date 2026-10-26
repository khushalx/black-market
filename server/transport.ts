import { WebSocketTransport } from "@colyseus/ws-transport";

export class MarketWebSocketTransport extends WebSocketTransport {
  protected override async onConnection(
    ...args: Parameters<WebSocketTransport["onConnection"]>
  ) {
    const [socket] = args;
    // Some public proxies handle control frames separately. Incoming game
    // messages (including clock probes) also prove that this client is alive.
    socket.on("message", () => { socket.pingCount = 0; });
    return super.onConnection(...args);
  }
}
