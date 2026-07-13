#!/usr/bin/env python3
"""Proxy TCP temporar, limitat la serverul Docker, pentru migrarea MongoDB 3.6."""

import asyncio
import logging

LISTEN_HOST = "192.168.177.99"
LISTEN_PORT = 27036
ALLOWED_CLIENT = "192.168.177.68"
UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = 27017


async def copy_stream(reader, writer):
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


async def handle_client(client_reader, client_writer):
    peer = client_writer.get_extra_info("peername")
    client_ip = peer[0] if peer else ""
    if client_ip != ALLOWED_CLIENT:
        logging.warning("Conexiune refuzată de la %s", client_ip or "necunoscut")
        client_writer.close()
        await client_writer.wait_closed()
        return

    try:
        upstream_reader, upstream_writer = await asyncio.open_connection(UPSTREAM_HOST, UPSTREAM_PORT)
    except OSError as error:
        logging.error("MongoDB upstream indisponibil: %s", error)
        client_writer.close()
        await client_writer.wait_closed()
        return

    await asyncio.gather(
        copy_stream(client_reader, upstream_writer),
        copy_stream(upstream_reader, client_writer),
    )


async def main():
    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT, reuse_address=True)
    logging.info("mongo36-bridge activ pe %s:%s", LISTEN_HOST, LISTEN_PORT)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    asyncio.run(main())
