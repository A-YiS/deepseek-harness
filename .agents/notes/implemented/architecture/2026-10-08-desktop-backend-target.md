# Agent Note: Desktop backend targets

Status: implemented

English | [中文](2026-10-08-desktop-backend-target.zh.md)

## Problem

The packaged window serves its page from `dsh-app://app` and proxies every other request to the Host process the shell spawns, so every session belongs to that machine. Reaching another Harness meant loading that Harness's own frontend in an embedded browser: the remote's build replaces the packaged UI, and the shell's own chrome, update flow, and native surfaces no longer apply. Driving the packaged UI against a remote Host requires selecting a different upstream without shipping a second client.

## Decision

The shell keeps one active backend target — the Host it spawned, or a remote Host the product API attaches through `dshDesktop.backend`. A target carries the three values the application origin already depended on: the upstream origin, the authority-bound browser cookie that origin admits, and the boot injection table its own index would have rendered. `protocol.handle`, the WebSocket credential rewrite, and the boot IPC read the active target; attaching or leaving reloads the document, so boot injections, plugin rows, upstream origin, and stream base URL change together and the page reads them exactly once at startup.

`backend.connect` takes a loopback origin from the product page and performs the cookie exchange and the boot handover in the main process, so the credential never reaches the document. `backend.status` exists because the injected product graph belongs to the active Host: it cannot describe which Host the shell selected. A remote target must be loopback — the session cookie is bound to its authority, and the WebSocket credential rewrite accepts the same loopback authorities. Host versions are compared and reported as a warning instead of a veto; the boot graph and the application Remote API are the compatibility surface, and a release string cannot decide them.

## Alternatives considered

- **Proxy every route inside the local Host.** The local Host owns its own boot injection table and cannot be told to render another Host's rows, so the client would boot two module graphs.
- **Run the remote Host as the shell's Host process.** The private Node IPC channel between shell and Host carries boot injections, quit inspection, and update tasks; a remote process would need all of it over the wire first.
- **Embed the remote frontend in a browser tab.** This is the previous behavior and the reason for the change: it replaces the desktop UI instead of driving it.

## Consequences

- A remote Host supplies the client plugin rows, so the window renders that Host's plugins while keeping the packaged shell; local-only client plugins are absent until the local control plane is routed around the remote target.
- The spawned Host keeps running, because it owns the plugin that carries the tunnel; local agent work is suspended by the plugin for the duration of the remote attachment, not by the shell.
- Native surfaces that name a local path (directory picker, dropped-file references) still describe this machine and need their own remote story.
