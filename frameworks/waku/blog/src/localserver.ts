import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import serveHandler from "serve-handler"

const server = createServer(
  (req: IncomingMessage, res: ServerResponse<IncomingMessage>) =>
    void serveHandler(req, res, {
      public: "dist/public/", // folder of files to serve
    }),
)

server.listen({ port: 3000 }, () => {
  const { port } = server.address() as AddressInfo
  console.info(`Server is running on http://localhost:${port}`)
})
