#!/usr/bin/env python3

"""Scan a /24 subnet for PTP/IP (TCP 15740).

Example:
  scripts/scan-ptpip.py 192.168.1

Output:
  OPEN 192.168.1.1 15740
"""

import socket
import sys


def main() -> int:
    prefix = sys.argv[1] if len(sys.argv) > 1 else "192.168.1"
    port = 15740
    timeout_s = 0.2

    for i in range(1, 255):
        ip = f"{prefix}.{i}"
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout_s)
        try:
            s.connect((ip, port))
            print(f"OPEN {ip} {port}")
        except OSError:
            pass
        finally:
            s.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
