"""Credential-free, synthetic provider qualification; never contacts a model service."""
import json
import os
from pathlib import Path
import queue
import shlex
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


def main():
    binary = sys.argv[1]
    # A catalog model id exercises its tool selection, but the endpoint is always
    # the local synthetic provider. This is not an entitlement or inference test.
    model_name = 'gpt-6.1-sol'
    inventory_only = '--local-inventory' in sys.argv[2:]
    local_skills = '--local-skills' in sys.argv[2:]
    local_mode = inventory_only or local_skills or '--local-protocol' in sys.argv[2:]
    workspace = Path(tempfile.mkdtemp(prefix='codex-surface-', dir='.local')).resolve() if local_mode else Path('/tmp')
    probe_home = workspace / 'aisdlc-surface-home'
    probe_home.mkdir(mode=0o700)
    requests = []
    failures = []
    output = queue.Queue(maxsize=128)
    diagnostics = {'bytes': 0}
    stage = 'startup'
    current_case = {'item': None, 'requests': 0}
    hold_stream = threading.Event()
    stream_opened = threading.Event()
    release_stream = threading.Event()
    stream_closed = threading.Event()
    marker = workspace / 'aisdlc-forbidden-tool-marker'
    assert not marker.exists()
    secret = 'synthetic-skill-canary-must-not-leave-broker'
    skill_dir = probe_home / 'skills' / 'synthetic-private'
    skill_dir.mkdir(parents=True)
    (skill_dir / 'SKILL.md').write_text('---\nname: synthetic-private\ndescription: Synthetic canary\n---\n' + secret)
    (probe_home / 'private-canary.txt').write_text(secret)

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
                assert request.get('model') == model_name
                assert secret not in json.dumps(request), 'synthetic-secret-exposed'
                assert len(requests) < 32
                requests.append(request)
                current_case['requests'] += 1
                assert current_case['requests'] <= 2
                if hold_stream.is_set():
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/event-stream')
                    self.send_header('Connection', 'close')
                    self.end_headers()
                    self.wfile.write(b'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_hold","status":"in_progress"}}\n\n')
                    self.wfile.flush()
                    stream_opened.set()
                    try:
                        assert release_stream.wait(4), 'held-stream-deadline'
                    finally:
                        stream_closed.set()
                    return
                item = {'id': 'msg_probe', 'type': 'message', 'role': 'assistant',
                        'status': 'completed', 'content': [{'type': 'output_text',
                        'text': 'synthetic-provider-positive', 'annotations': []}]}
                injected = current_case['item'] is not None and current_case['requests'] == 1
                if injected:
                    item = current_case['item']
                events = [
                    {'type': 'response.created', 'response': {'id': 'resp_probe', 'status': 'in_progress'}},
                    {'type': 'response.output_item.added', 'output_index': 0, 'item': item},
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
        'model = ' + json.dumps(model_name),
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
        'plugins = false',
        'remote_plugin = false',
        'skill_search = false',
        'skill_mcp_dependency_install = false',
        'skip_host_skill_discovery = true',
        'tool_suggest = false',
    ]) + '\n'
    (probe_home / 'config.toml').write_text(config)
    environment = {'HOME': str(probe_home), 'CODEX_HOME': str(probe_home),
                   'PATH': '/usr/bin:/bin', 'RUST_LOG': 'error', 'TOKIO_WORKER_THREADS': '2'}
    if local_mode and os.name == 'nt':
        environment.update(SYSTEMROOT=os.environ['SYSTEMROOT'], USERPROFILE=str(probe_home),
                           PATH=os.environ['SYSTEMROOT'] + '/System32', TEMP=str(workspace), TMP=str(workspace))
    server = subprocess.Popen([binary, '--strict-config', 'app-server', '--listen', 'stdio://'],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              env=environment, cwd=workspace)

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
    deadline = time.monotonic() + 35

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
        assert method in {'initialize', 'thread/start', 'turn/start', 'turn/interrupt'}
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
        thread = rpc('thread/start', {'model': model_name, 'modelProvider': 'synthetic',
                     'cwd': str(workspace), 'ephemeral': True, 'environments': [], 'dynamicTools': [],
                     'selectedCapabilityRoots': [],
                     'approvalPolicy': 'never', 'sandbox': 'read-only', 'allowProviderModelFallback': False})
        thread_id = thread['thread']['id']
        def turn(item=None):
            notifications.clear()
            current_case.update(item=item, requests=0)
            start = len(requests)
            rpc('turn/start', {'threadId': thread_id, 'input': [{'type': 'text',
                              'text': 'Return the synthetic fixture response.', 'text_elements': []}]})
            while not any(n.get('method') == 'turn/completed' for n in notifications):
                receive()
            completed = next(n for n in notifications if n.get('method') == 'turn/completed')
            assert completed['params']['turn']['status'] == 'completed', 'turn-failed'
            assert not failures, 'provider-failed'
            assert any(n.get('method') == 'item/completed' and
                       n.get('params', {}).get('item', {}).get('type') == 'agentMessage' and
                       n['params']['item'].get('text') == 'synthetic-provider-positive'
                       for n in notifications), 'positive-text-missing'
            return requests[start:]

        stage = 'positive-turn'
        positive = turn()
        assert len(positive) == 1
        tools = positive[0].get('tools', [])
        names = [tool.get('name', tool.get('type', 'unknown')) for tool in tools]
        assert names == ['request_user_input', 'skills'], 'unexpected-tool-surface'
        assert tools[1].get('type') == 'namespace'
        assert [tool.get('name') for tool in tools[1].get('tools', [])] == ['list', 'read']
        # Names are bounded diagnostics from a credential-free synthetic request.
        assert len(names) <= 64 and all(isinstance(n, str) and len(n) <= 128 for n in names)
        safe_names = ','.join(names).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::notice title=Synthetic Codex tool inventory::count=' + str(len(names)) + '; names=' + safe_names)
        def schema_summary(value):
            if isinstance(value, dict):
                return {key: schema_summary(item) for key, item in value.items() if key != 'description'}
            if isinstance(value, list):
                return [schema_summary(item) for item in value]
            return value
        for tool in tools:
            summary = json.dumps(schema_summary(tool), separators=(',', ':'))
            assert len(summary) <= 12000
            print('::notice title=Synthetic Codex remaining tool schema::' +
                  summary.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A'))
        if inventory_only:
            print(json.dumps({'localInventoryOnly': True, 'toolBoundaryQualified': False,
                              'executionAllowed': False, 'realModelCalls': 0}))
            return
        def check_skills():
            nonlocal stage
            for authority in ['orchestrator', 'executor']:
                stage = 'skills-list-' + authority
                captured = turn({'id': 'skills_probe', 'type': 'function_call', 'call_id': 'skills_' + authority,
                                 'namespace': 'skills', 'name': 'list',
                                 'arguments': json.dumps({'authority': {'kind': authority}})})
                results = [item for item in captured[-1].get('input', []) if
                           item.get('type') == 'function_call_output' and item.get('call_id') == 'skills_' + authority]
                assert len(captured) == 2 and len(results) == 1
                result = json.loads(results[0]['output'])
                assert result == {'skills': [], 'warnings': [], 'next_cursor': None}, 'skills-not-empty'
            for index, (package, resource) in enumerate([(str(skill_dir), str(probe_home / 'private-canary.txt')),
                                      ('synthetic-private', '../private-canary.txt'),
                                      (skill_dir.as_uri(), (probe_home / 'private-canary.txt').as_uri()),
                                      ('../../private-canary.txt', '/etc/hosts')]):
                stage = 'skills-read'
                call_id = 'skills_read_' + str(index)
                captured = turn({'id': call_id, 'type': 'function_call', 'call_id': call_id,
                                 'namespace': 'skills', 'name': 'read',
                                 'arguments': json.dumps({'package': package, 'resource': resource})})
                results = [item for item in captured[-1].get('input', []) if
                           item.get('type') == 'function_call_output' and item.get('call_id') == call_id]
                assert len(captured) == 2 and len(results) == 1
                assert results[0]['output'] == 'skill package is not available', 'skill-read-not-denied'
            stage = 'request-user-input'
            captured = turn({'id': 'question_probe', 'type': 'function_call', 'call_id': 'question_probe',
                             'name': 'request_user_input', 'arguments': json.dumps({'questions': [{
                                 'id': 'synthetic', 'header': 'Synthetic', 'question': 'Synthetic fixture?',
                                 'options': [{'label': 'Yes', 'description': 'Synthetic only'},
                                             {'label': 'No', 'description': 'Synthetic only'}]}]})})
            results = [item for item in captured[-1].get('input', []) if
                       item.get('type') == 'function_call_output' and item.get('call_id') == 'question_probe']
            assert len(captured) == 2 and len(results) == 1
            assert 'unavailable' in results[0]['output'].lower(), 'question-not-denied'
            print('::notice title=Synthetic Codex residual tools::emptySkillCatalogs=2; deniedSkillReads=4; questionDenied=true')

        check_skills()
        if local_skills:
            print(json.dumps({'localProtocolOnly': True, 'toolBoundaryQualified': False,
                              'executionAllowed': False, 'realModelCalls': 0}))
            return
        marker_command = [sys.executable, '-c', 'from pathlib import Path; Path(' + repr(str(marker)) + ').write_text("forbidden")']
        shell_command = subprocess.list2cmdline(marker_command) if os.name == 'nt' else shlex.join(marker_command)
        attacks = [
            ('exec_command', {'cmd': shell_command}),
            ('shell_command', {'command': shell_command}),
            ('shell', {'command': marker_command}),
            ('view_image', {'path': '/etc/hosts'}),
        ]
        rejected = []
        for name, arguments in attacks:
            stage = 'inject-' + name
            attack = {'id': 'fc_probe', 'type': 'function_call', 'call_id': 'call_' + name,
                      'name': name, 'arguments': json.dumps(arguments)}
            captured = turn(attack)
            assert len(captured) == 2, 'missing-tool-rejection-roundtrip'
            results = [item for item in captured[-1].get('input', []) if
                       item.get('type') == 'function_call_output' and item.get('call_id') == 'call_' + name]
            assert len(results) == 1, 'missing-tool-rejection'
            assert results[0].get('output', '').lower() == 'unsupported call: ' + name, 'tool-not-rejected'
            assert not marker.exists(), 'forbidden-tool-effect'
            rejected.append(name)
        stage = 'inject-apply-patch'
        captured = turn({'id': 'patch_probe', 'type': 'custom_tool_call', 'call_id': 'call_patch',
                         'name': 'apply_patch', 'input': '*** Begin Patch\n*** Add File: ' + str(marker) +
                         '\n+forbidden\n*** End Patch'})
        assert len(captured) == 2 and not marker.exists(), 'patch-effect-or-missing-rejection'
        results = [item for item in captured[-1].get('input', []) if
                   item.get('type') == 'custom_tool_call_output' and item.get('call_id') == 'call_patch']
        assert len(results) == 1
        assert results[0].get('output') == 'unsupported custom tool call: apply_patch', 'patch-not-rejected'
        rejected.append('apply_patch')
        print('::notice title=Synthetic Codex rejected tools::' + ','.join(rejected))
        stage = 'interrupt-streaming-turn'
        notifications.clear()
        current_case.update(item=None, requests=0)
        request_start = len(requests)
        hold_stream.set()
        active = rpc('turn/start', {'threadId': thread_id, 'input': [{'type': 'text',
                     'text': 'Synthetic interruption fixture.', 'text_elements': []}]})
        assert stream_opened.wait(3), 'held-provider-not-reached'
        active_id = active['turn']['id']
        rpc('turn/interrupt', {'threadId': thread_id, 'turnId': active_id})
        while not any(n.get('method') == 'turn/completed' for n in notifications):
            receive()
        completion = next(n['params']['turn'] for n in notifications if n.get('method') == 'turn/completed')
        assert completion['id'] == active_id and completion['status'] == 'interrupted', 'interrupt-not-confirmed'
        assert not any(n.get('method') == 'item/completed' and
                       n.get('params', {}).get('item', {}).get('type') == 'agentMessage'
                       for n in notifications), 'interrupted-candidate-emitted'
        assert len(requests) == request_start + 1, 'interrupted-request-retried'
        release_stream.set()
        assert stream_closed.wait(1), 'held-provider-not-drained'
        hold_stream.clear()
        stage = 'post-interrupt-positive-control'
        assert len(turn()) == 1, 'post-interrupt-control-failed'
        print('::notice title=Synthetic Codex cancellation::interrupted=true; candidateEmitted=false; requests=1; subsequentControlPassed=true')
        assert all(request.get('tools') == tools for request in requests), 'tool-surface-changed'
        print(json.dumps({'syntheticProviderPositiveControl': True, 'offeredToolNames': names,
                          'catalogModelId': model_name, 'localProtocolOnly': local_mode,
                          'injectedToolsRejected': rejected,
                          'emptySkillCatalogs': 2, 'deniedSkillReads': 4, 'questionDenied': True,
                          'streamingTurnInterrupted': True, 'interruptedCandidateEmitted': False,
                          'postInterruptControlPassed': True,
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
        release_stream.set()
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
