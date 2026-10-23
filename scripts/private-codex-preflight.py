"""Private-host metadata RPCs only; never sends turn/start or reads auth files."""
import json
import os
import queue
import subprocess
import threading
import time


def main():
    assert os.name == 'posix' and os.getuid() > 0
    home = '/var/lib/aisdlc-codex-broker'
    binary = '/opt/aisdlc-codex/0.155.1/codex'
    workspace = '/opt/aisdlc-codex/workspace'
    environment = {'HOME': home, 'CODEX_HOME': home + '/.codex', 'PATH': '/usr/bin:/bin',
                   'RUST_LOG': 'error', 'TOKIO_WORKER_THREADS': '2'}
    output = queue.Queue(maxsize=64)
    errors = []
    server = subprocess.Popen([binary, '--strict-config', 'app-server', '--listen', 'stdio://'],
                              cwd=workspace, env=environment, stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def reader(stream, channel):
        try:
            while True:
                line = stream.readline(65537)
                if not line:
                    break
                if len(line) > 65536:
                    raise RuntimeError()
                output.put((channel, line), timeout=1)
        except Exception:
            errors.append('bounded-reader-failed')

    for stream, channel in [(server.stdout, 'stdout'), (server.stderr, 'stderr')]:
        threading.Thread(target=reader, args=(stream, channel), daemon=True).start()
    sequence, total = 0, 0
    deadline = time.monotonic() + 25

    def send(message):
        server.stdin.write(json.dumps(message).encode() + b'\n')
        server.stdin.flush()

    def rpc(method, params):
        nonlocal sequence, total
        assert method in {'initialize', 'account/read', 'config/read', 'model/list'}
        sequence += 1
        send({'id': sequence, 'method': method, 'params': params})
        while time.monotonic() < deadline:
            assert not errors and server.poll() is None, 'app-server-unavailable'
            try:
                channel, line = output.get(timeout=0.2)
            except queue.Empty:
                continue
            total += len(line)
            assert total <= 262144, 'output-limit'
            if channel == 'stderr':
                continue
            message = json.loads(line)
            if 'method' in message:
                assert 'id' not in message, 'unexpected-server-request'
                continue
            assert message.get('id') == sequence, 'unexpected-response'
            assert 'result' in message and 'error' not in message, 'metadata-rpc-rejected'
            return message['result']
        raise RuntimeError('metadata-deadline')

    try:
        rpc('initialize', {'clientInfo': {'name': 'aisdlc_private_metadata', 'version': '1'}})
        send({'method': 'initialized'})
        account = rpc('account/read', {'refreshToken': False})
        assert account.get('account', {}).get('type') == 'chatgpt', 'chatgpt-login-required'
        assert account.get('requiresOpenaiAuth') is True, 'unexpected-auth-provider'
        config = rpc('config/read', {'includeLayers': False})['config']
        assert config.get('model') == 'gpt-6-sol', 'model-mismatch'
        assert config.get('forced_login_method') == 'chatgpt', 'login-policy-mismatch'
        assert config.get('model_provider') in (None, 'openai'), 'provider-mismatch'
        assert config.get('web_search') == 'disabled', 'web-search-enabled'
        assert not config.get('mcp_servers'), 'mcp-configuration-present'
        providers = config.get('model_providers') or {}
        assert set(providers) == {'openai'}, 'custom-provider-present'
        provider = providers['openai']
        expected = {'requires_openai_auth': True, 'wire_api': 'responses',
                    'request_max_retries': 0, 'stream_max_retries': 0, 'supports_websockets': False}
        assert all(provider.get(key) == value for key, value in expected.items()), 'custom-provider-present'
        assert all(value is None or key in set(expected) | {'name'} for key, value in provider.items()), 'custom-provider-present'
        disabled = ['shell_tool', 'shell_snapshot', 'apps', 'hooks', 'multi_agent',
                    'plugins', 'remote_plugin', 'skill_search', 'skill_mcp_dependency_install', 'tool_suggest']
        features = config.get('features', {})
        assert all(features.get(key) is False for key in disabled), 'feature-policy-mismatch'
        assert features.get('skip_host_skill_discovery') is True, 'host-skills-enabled'
        models = rpc('model/list', {'limit': 100, 'includeHidden': False})
        identifiers = [entry.get('model') for entry in models['data']]
        if 'gpt-6-sol' not in identifiers:
            import re
            safe = [value for value in identifiers if isinstance(value, str) and
                    re.fullmatch(r'[A-Za-z0-9._-]{1,80}', value)]
            print(json.dumps({'availableModelIds': safe[:100], 'hasNextPage': bool(models.get('nextCursor'))}))
        assert any(model.get('model') == 'gpt-6-sol' for model in models['data']), 'selected-model-not-listed'
        server.stdin.close()
        assert server.wait(timeout=5) == 0, 'app-server-clean-exit-required'
        assert not errors, 'reader-failed'
        print(json.dumps({'version': 1, 'host': 'azure-client-trial', 'authentication': 'chatgpt',
                          'effectiveConfigChecked': True, 'selectedModelListed': True,
                          'model': 'gpt-6-sol', 'metadataOnly': True, 'realModelCalls': 0,
                          'executionAllowed': False, 'retryAuthorized': False}))
    finally:
        if server.poll() is None:
            server.kill()
            server.wait(timeout=5)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print RPC results, personal account data or provider diagnostics.
        allowed = {'app-server-unavailable', 'output-limit', 'unexpected-server-request',
                   'unexpected-response', 'metadata-rpc-rejected', 'metadata-deadline',
                   'chatgpt-login-required', 'unexpected-auth-provider', 'model-mismatch',
                   'login-policy-mismatch', 'provider-mismatch', 'web-search-enabled',
                   'mcp-configuration-present', 'custom-provider-present', 'feature-policy-mismatch',
                   'host-skills-enabled', 'selected-model-not-listed', 'app-server-clean-exit-required', 'reader-failed'}
        reason = str(error) if str(error) in allowed else 'metadata-preflight-rejected'
        print(json.dumps({'privateMetadataPassed': False, 'reason': reason,
                          'realModelCalls': 0, 'executionAllowed': False}))
        raise SystemExit(1)
