"""Credential-free, synthetic provider qualification; never contacts a model service."""
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


def main():
    binary = sys.argv[1]
    probe_home = Path('/tmp/aisdlc-surface-home')
    probe_home.mkdir(mode=0o700)
    requests = []
    failures = []
    output = queue.Queue(maxsize=128)
    diagnostics = {'bytes': 0}
    stage = 'startup'

    class Provider(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            try:
                self.connection.settimeout(3)
                assert self.path == '/v1/responses'
                assert not self.headers.get('Authorization')
                size = int(self.headers.get('Content-Length', '0'))
                assert 0 < size <= 262144
                request = json.loads(self.rfile.read(size))
                assert request.get('model') == 'synthetic-probe'
                assert len(requests) < 4
                requests.append(request)
                item = {'id': 'msg_probe', 'type': 'message', 'role': 'assistant',
                        'status': 'completed', 'content': [{'type': 'output_text',
                        'text': 'synthetic-provider-positive', 'annotations': []}]}
                events = [
                    {'type': 'response.created', 'response': {'id': 'resp_probe', 'status': 'in_progress'}},
                    {'type': 'response.output_item.added', 'output_index': 0, 'item': item},
                    {'type': 'response.output_text.delta', 'item_id': 'msg_probe', 'output_index': 0,
                     'content_index': 0, 'delta': 'synthetic-provider-positive'},
                    {'type': 'response.output_item.done', 'output_index': 0, 'item': item},
                    {'type': 'response.completed', 'response': {'id': 'resp_probe', 'status': 'completed',
                     'output': [item], 'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}},
                ]
                body = ''.join('event: ' + e['type'] + '\ndata: ' + json.dumps(e) + '\n\n' for e in events).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                failures.append('synthetic-provider-protocol-failed')
                self.send_error(400)

    provider = HTTPServer(('127.0.0.1', 0), Provider)
    provider_thread = threading.Thread(target=provider.serve_forever, daemon=True)
    provider_thread.start()
    config = '\n'.join([
        'model = "synthetic-probe"',
        'model_provider = "synthetic"',
        'web_search = "disabled"',
        '[model_providers.synthetic]',
        'name = "Synthetic local fixture"',
        f'base_url = "http://127.0.0.1:{provider.server_port}/v1"',
        'wire_api = "responses"',
        'requires_openai_auth = false',
        'supports_websockets = false',
        'request_max_retries = 0',
        'stream_max_retries = 0',
        '[features]',
        'shell_tool = false',
        'shell_snapshot = false',
        'apps = false',
        'hooks = false',
        'multi_agent = false',
        '[tools]',
        'view_image = false',
    ]) + '\n'
    (probe_home / 'config.toml').write_text(config)
    environment = {'HOME': str(probe_home), 'CODEX_HOME': str(probe_home),
                   'PATH': '/usr/bin:/bin', 'RUST_LOG': 'error', 'TOKIO_WORKER_THREADS': '2'}
    server = subprocess.Popen([binary, '--strict-config', 'app-server', '--listen', 'stdio://'],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              env=environment, cwd='/tmp')

    def reader(stream, channel):
        try:
            while True:
                line = stream.readline(65537)
                if not line:
                    break
                output.put((channel, line), timeout=1)
        except Exception:
            failures.append('bounded-reader-failed')

    readers = [threading.Thread(target=reader, args=(stream, channel), daemon=True)
               for stream, channel in [(server.stdout, 'stdout'), (server.stderr, 'stderr')]]
    for thread in readers:
        thread.start()
    sequence = 0
    notifications = []
    deadline = time.monotonic() + 30

    def send(message):
        server.stdin.write(json.dumps(message).encode() + b'\n')
        server.stdin.flush()

    def receive():
        while time.monotonic() < deadline:
            try:
                channel, line = output.get(timeout=0.2)
            except queue.Empty:
                assert server.poll() is None, 'server-exited'
                continue
            diagnostics['bytes'] += len(line)
            assert diagnostics['bytes'] <= 262144, 'output-limit'
            if channel == 'stderr':
                continue
            message = json.loads(line)
            if 'method' in message:
                assert 'id' not in message, 'unexpected-server-request'
                notifications.append(message)
                assert len(notifications) <= 100, 'notification-limit'
            return message
        raise RuntimeError('deadline-exceeded')

    def rpc(method, params):
        nonlocal sequence
        assert method in {'initialize', 'thread/start', 'turn/start'}
        sequence += 1
        send({'id': sequence, 'method': method, 'params': params})
        while True:
            message = receive()
            if message.get('id') == sequence:
                assert 'result' in message and 'error' not in message, 'rpc-rejected'
                return message['result']

    try:
        stage = 'initialize'
        rpc('initialize', {'clientInfo': {'name': 'aisdlc_synthetic_surface', 'version': '1'},
                           'capabilities': {'experimentalApi': True}})
        send({'method': 'initialized'})
        stage = 'thread-start'
        thread = rpc('thread/start', {'model': 'synthetic-probe', 'modelProvider': 'synthetic',
                     'cwd': '/tmp', 'ephemeral': True, 'environments': [], 'dynamicTools': [],
                     'approvalPolicy': 'never', 'sandbox': 'read-only', 'allowProviderModelFallback': False})
        thread_id = thread['thread']['id']
        stage = 'turn-start'
        rpc('turn/start', {'threadId': thread_id, 'input': [{'type': 'text',
                          'text': 'Return the synthetic fixture response.', 'text_elements': []}]})
        stage = 'turn-completion'
        while not any(n.get('method') == 'turn/completed' for n in notifications):
            receive()
        completed = next(n for n in notifications if n.get('method') == 'turn/completed')
        assert completed['params']['turn']['status'] == 'completed', 'turn-failed'
        stage = 'inspect-tools'
        assert len(requests) == 1 and not failures, 'provider-request-count-or-failure'
        tools = requests[0].get('tools', [])
        names = [tool.get('name', tool.get('type', 'unknown')) for tool in tools]
        # Names are bounded diagnostics from a credential-free synthetic request.
        assert len(names) <= 64 and all(isinstance(n, str) and len(n) <= 128 for n in names)
        safe_names = ','.join(names).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::notice title=Synthetic Codex tool inventory::count=' + str(len(names)) + '; names=' + safe_names)
        print(json.dumps({'syntheticProviderPositiveControl': True, 'offeredToolNames': names,
                          'offeredToolCount': len(tools), 'realModelCalls': 0, 'credentialFree': True,
                          'toolBoundaryQualified': False, 'executionAllowed': False, 'retryAllowed': False}))
    except Exception as error:
        # No raw request, config, protocol, or server diagnostic payload is emitted.
        print(json.dumps({'failureType': type(error).__name__, 'requestCount': len(requests),
                          'lastRpc': sequence, 'serverExit': server.poll(), 'diagnosticBytes': diagnostics['bytes']}),
              file=sys.stderr)
        print(f'::error title=Synthetic Codex tool probe::stage={stage}; type={type(error).__name__}; '
              f'requests={len(requests)}; rpc={sequence}; exit={server.poll()}', file=sys.stderr)
        raise SystemExit(1) from None
    finally:
        server.stdin.close()
        try:
            server.wait(timeout=2)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=2)
        provider.shutdown()
        provider.server_close()
        for thread in readers:
            thread.join(timeout=1)


if __name__ == '__main__':
    main()
