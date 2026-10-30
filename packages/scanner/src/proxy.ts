// Every socket connects to a validated IP literal: DNS cannot change between validation and connection.
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import type { Socket } from 'node:net';
import { resolveTarget } from './safety';
export async function createSafeProxy(
  origin: string,
  allowLoopbackForTests = false,
) {
  const username = 'shipcheck',
    password = randomBytes(24).toString('hex');
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const sockets = new Set<Socket>();
  const track = (socket: Socket) => {
    if (sockets.has(socket)) return socket;
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(20000, () => socket.destroy());
    return socket;
  };
  const server = http.createServer(async (req, res) => {
    if (req.headers['proxy-authorization'] !== auth) {
      res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="ShipCheck"' });
      res.end();
      return;
    }
    try {
      const url = new URL(req.url ?? '');
      if (
        url.origin !== origin ||
        url.protocol !== 'http:' ||
        !['GET', 'HEAD'].includes(req.method ?? '')
      )
        throw new Error('Out of scope');
      const target = await resolveTarget(url.href, allowLoopbackForTests);
      const headers: http.OutgoingHttpHeaders = {
        ...req.headers,
        host: url.host,
      };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      const upstream = http.request(
        {
          hostname: target.address,
          port: url.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          headers,
          timeout: 15000,
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('socket', track);
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end('Upstream connection failed');
      });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end('Target blocked by ShipCheck network policy');
    }
  });
  server.on('connection', track);
  server.on('connect', async (req, socket, head) => {
    if (req.headers['proxy-authorization'] !== auth) {
      socket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="ShipCheck"\r\n\r\n',
      );
      return;
    }
    try {
      const url = new URL(`https://${req.url}`);
      if (url.origin !== origin) throw new Error('Out of scope');
      const target = await resolveTarget(url.href, allowLoopbackForTests);
      const remote = track(
        net.connect({ host: target.address, port: Number(url.port || 443) }),
      );
      remote.once('connect', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        socket.pipe(remote);
        remote.pipe(socket);
      });
      socket.once('close', () => remote.destroy());
      remote.once('error', () => socket.destroy());
    } catch {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as net.AddressInfo;
  return {
    config: { server: `http://127.0.0.1:${address.port}`, username, password },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
