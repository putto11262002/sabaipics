#!/usr/bin/env python3

"""Minimal PTP/IP handshake probe.

By default this performs the full PTP/IP handshake:
1) TCP connect to port 15740 (command)
2) Send INIT_COMMAND_REQUEST, read INIT_COMMAND_ACK
3) TCP connect to port 15740 (event)
4) Send INIT_EVENT_REQUEST(eventpipeid), read INIT_EVENT_ACK

Usage:
  python3 scripts/ptpip-handshake.py 192.168.1.1
  python3 scripts/ptpip-handshake.py 192.168.1.1 --timeout-ms 3000
  python3 scripts/ptpip-handshake.py 192.168.1.1 --command-only
"""

from __future__ import annotations

import argparse
import os
import socket
import struct
import sys


PTPIP_INIT_COMMAND_REQUEST = 1
PTPIP_INIT_COMMAND_ACK = 2
PTPIP_INIT_EVENT_REQUEST = 3
PTPIP_INIT_EVENT_ACK = 4
PTPIP_INIT_FAIL = 5

PTPIP_CMD_REQUEST = 6
PTPIP_CMD_RESPONSE = 7
PTPIP_START_DATA_PACKET = 9
PTPIP_DATA_PACKET = 10
PTPIP_END_DATA_PACKET = 12

# PTP operation codes / response codes
PTP_OC_GetDeviceInfo = 0x1001
PTP_OC_OpenSession = 0x1002
PTP_RC_OK = 0x2001


def ucs2le_null_terminated(s: str) -> bytes:
    # PTP/IP uses UCS-2 (not UTF-16 with surrogate pairs). Hostnames are ASCII here.
    b = bytearray()
    for ch in s:
        code = ord(ch)
        if code > 0xFFFF:
            code = ord("?")
        b += struct.pack("<H", code)
    b += struct.pack("<H", 0)
    return bytes(b)


def recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("socket closed")
        buf += chunk
    return bytes(buf)


def recv_ptpip_packet(sock: socket.socket) -> tuple[int, int, bytes]:
    hdr = recv_exact(sock, 8)
    (length, ptype) = struct.unpack("<II", hdr)
    if length < 8:
        raise ValueError(f"invalid PTP/IP length {length}")
    body = recv_exact(sock, length - 8) if length > 8 else b""
    return length, ptype, body


def send_ptpip_cmd_request(
    sock: socket.socket,
    *,
    dataphase: int,
    code: int,
    transid: int,
    params: list[int],
) -> None:
    # Matches libgphoto2 layout in camlibs/ptp2/ptpip.c
    # [len u32][type u32][dataphase u32][code u16][transid u32][params u32...]
    if dataphase not in (1, 2):
        raise ValueError("dataphase must be 1 (recv/none) or 2 (send)")
    if len(params) > 5:
        raise ValueError("max 5 params")

    total_len = 18 + 4 * len(params)
    pkt = bytearray()
    pkt += struct.pack("<II", total_len, PTPIP_CMD_REQUEST)
    pkt += struct.pack("<I", dataphase)
    pkt += struct.pack("<H", code)
    pkt += struct.pack("<I", transid)
    for p in params:
        pkt += struct.pack("<I", p & 0xFFFFFFFF)
    sock.sendall(bytes(pkt))


def read_until_cmd_response(cmd: socket.socket) -> tuple[int, int, list[int]]:
    data_total = 0
    expected_data: int | None = None

    while True:
        length, ptype, body = recv_ptpip_packet(cmd)

        if ptype == PTPIP_START_DATA_PACKET:
            if len(body) < 8:
                raise ValueError("START_DATA_PACKET body too short")
            transid = struct.unpack("<I", body[0:4])[0]
            expected_data = struct.unpack("<I", body[4:8])[0]
            data_total = 0
            print(
                f"CMD RECV START_DATA_PACKET transid={transid} expected={expected_data}"
            )
            continue

        if ptype in (PTPIP_DATA_PACKET, PTPIP_END_DATA_PACKET):
            if len(body) < 4:
                raise ValueError("DATA_PACKET body too short")
            payload = body[4:]
            data_total += len(payload)
            if ptype == PTPIP_END_DATA_PACKET:
                print(f"CMD RECV END_DATA_PACKET bytes={data_total}")
                if expected_data is not None and data_total != expected_data:
                    print(
                        f"WARN data size mismatch expected={expected_data} got={data_total}"
                    )
                expected_data = None
            continue

        if ptype == PTPIP_CMD_RESPONSE:
            if len(body) < 6:
                raise ValueError("CMD_RESPONSE body too short")
            resp_code = struct.unpack("<H", body[0:2])[0]
            resp_transid = struct.unpack("<I", body[2:6])[0]
            params: list[int] = []
            rest = body[6:]
            for i in range(0, min(len(rest), 20), 4):
                if i + 4 <= len(rest):
                    params.append(struct.unpack("<I", rest[i : i + 4])[0])
            return resp_code, resp_transid, params

        print(f"CMD RECV unexpected packet type={ptype} len={length}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ip", help="Camera/router IP")
    ap.add_argument("--port", type=int, default=15740)
    ap.add_argument("--timeout-ms", type=int, default=1500)
    ap.add_argument("--hostname", default=socket.gethostname() or "sabaipics")
    ap.add_argument(
        "--command-only", action="store_true", help="Only run INIT_COMMAND_* handshake"
    )
    ap.add_argument(
        "--open-session",
        action="store_true",
        help="Send PTP OpenSession after handshake",
    )
    ap.add_argument(
        "--get-device-info",
        action="store_true",
        help="Send PTP GetDeviceInfo after handshake",
    )
    ap.add_argument(
        "--hold-seconds",
        type=float,
        default=0.0,
        help="Keep sockets open for N seconds",
    )
    args = ap.parse_args()

    timeout_s = max(args.timeout_ms, 1) / 1000.0

    guid = os.urandom(16)
    name = ucs2le_null_terminated(args.hostname)

    # Match vendored libgphoto2:
    # payload = guid(16) + name(ucs2, incl null) + version_minor(2) + version_major(2)
    version_minor = 0x0000
    version_major = 0x0001
    init_cmd_payload = guid + name + struct.pack("<HH", version_minor, version_major)
    init_cmd_len = 8 + len(init_cmd_payload)
    init_cmd_pkt = (
        struct.pack("<II", init_cmd_len, PTPIP_INIT_COMMAND_REQUEST) + init_cmd_payload
    )

    cmd = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    cmd.settimeout(timeout_s)
    evt = None
    try:
        cmd.connect((args.ip, args.port))
        print(f"CMD TCP OK {args.ip}:{args.port}")

        cmd.sendall(init_cmd_pkt)
        print(f"CMD SENT INIT_COMMAND_REQUEST len={init_cmd_len}")

        hdr = recv_exact(cmd, 8)
        (rlen, rtype) = struct.unpack("<II", hdr)
        if rlen < 8:
            print(f"CMD RECV invalid length={rlen} type={rtype}")
            return 2
        body = recv_exact(cmd, rlen - 8) if rlen > 8 else b""

        tname = {
            PTPIP_INIT_COMMAND_ACK: "INIT_COMMAND_ACK",
            PTPIP_INIT_FAIL: "INIT_FAIL",
        }.get(rtype, "UNKNOWN")
        print(f"CMD RECV type={rtype} ({tname}) len={rlen} body_len={len(body)}")

        if rtype != PTPIP_INIT_COMMAND_ACK or len(body) < 4:
            return 4

        (eventpipeid,) = struct.unpack("<I", body[0:4])
        print(f"CMD ACK eventpipeid={eventpipeid}")

        if args.command_only:
            return 0

        evt = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        evt.settimeout(timeout_s)
        evt.connect((args.ip, args.port))
        print(f"EVT TCP OK {args.ip}:{args.port}")

        init_evt_payload = struct.pack("<I", eventpipeid)
        init_evt_len = 8 + len(init_evt_payload)
        init_evt_pkt = (
            struct.pack("<II", init_evt_len, PTPIP_INIT_EVENT_REQUEST)
            + init_evt_payload
        )
        evt.sendall(init_evt_pkt)
        print(f"EVT SENT INIT_EVENT_REQUEST len={init_evt_len}")

        ehdr = recv_exact(evt, 8)
        (elen, etype) = struct.unpack("<II", ehdr)
        if elen < 8:
            print(f"EVT RECV invalid length={elen} type={etype}")
            return 2
        ebody = recv_exact(evt, elen - 8) if elen > 8 else b""

        ename = {
            PTPIP_INIT_EVENT_ACK: "INIT_EVENT_ACK",
            PTPIP_INIT_FAIL: "INIT_FAIL",
        }.get(etype, "UNKNOWN")
        print(f"EVT RECV type={etype} ({ename}) len={elen} body_len={len(ebody)}")
        if etype != PTPIP_INIT_EVENT_ACK:
            return 5

        transid = 1
        if args.open_session:
            session_id = 1
            send_ptpip_cmd_request(
                cmd,
                dataphase=1,
                code=PTP_OC_OpenSession,
                transid=transid,
                params=[session_id],
            )
            print(f"CMD SENT OpenSession transid={transid} session_id={session_id}")
            (rcode, rtid, rparams) = read_until_cmd_response(cmd)
            print(
                f"CMD RECV OpenSession RC=0x{rcode:04x} transid={rtid} params={rparams}"
            )
            if rcode != PTP_RC_OK:
                return 6
            transid += 1

        if args.get_device_info:
            send_ptpip_cmd_request(
                cmd, dataphase=1, code=PTP_OC_GetDeviceInfo, transid=transid, params=[]
            )
            print(f"CMD SENT GetDeviceInfo transid={transid}")
            (rcode, rtid, rparams) = read_until_cmd_response(cmd)
            print(
                f"CMD RECV GetDeviceInfo RC=0x{rcode:04x} transid={rtid} params={rparams}"
            )
            if rcode != PTP_RC_OK:
                return 7

        if args.hold_seconds and args.hold_seconds > 0:
            import time

            print(f"HOLD {args.hold_seconds}s")
            time.sleep(args.hold_seconds)

        return 0
    except socket.timeout:
        print("TIMEOUT")
        return 3
    except Exception as e:
        print(f"ERROR {e}")
        return 1
    finally:
        try:
            cmd.close()
        except Exception:
            pass
        if evt is not None:
            try:
                evt.close()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
