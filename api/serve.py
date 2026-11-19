"""容器內的啟動點：一個 socket 同時接受 IPv4 與 IPv6。

Railway 的私有網路走 IPv6（web 轉送 /api），健康檢查走 IPv4；uvicorn 只能綁一個位址，
綁 `::` 時 asyncio 會設成只收 IPv6。所以自行建立雙協定 socket 再交給 uvicorn。
環境沒有 IPv6 時（例如 IPv4-only 的 docker 網路）退回 0.0.0.0。
"""

import logging
import os
import socket

import uvicorn

DEFAULT_PORT = 8000


def dual_stack_socket(port: int) -> socket.socket:
    try:
        sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        address: tuple = ("::", port)
    except OSError:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        address = ("0.0.0.0", port)  # noqa: S104 容器內需要對外監聽
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(address)
    logging.getLogger("uvicorn.error").info("Listening on %s port %s", address[0], port)
    return sock


def main() -> None:
    port = int(os.environ.get("PORT", DEFAULT_PORT))
    config = uvicorn.Config(
        "index:app",  # 以 python api/serve.py 執行時，api/ 已在匯入路徑上
        proxy_headers=True,
        forwarded_allow_ips="*",
        server_header=False,
        access_log=False,  # 請求由應用程式以 JSON 記錄（http.request）
    )
    uvicorn.Server(config).run(sockets=[dual_stack_socket(port)])


if __name__ == "__main__":
    main()
