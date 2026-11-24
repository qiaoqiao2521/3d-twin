"""Check the original protocols; no browser, renderer, or simulated server."""
import json
import sys
import time
import urllib.request
from websockets.sync.client import connect

origin = sys.argv[1]


def request(demo, path, body=None):
    req = urllib.request.Request(
        origin + '/open-demo-api/' + demo + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Origin': origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        assert response.status == 200
        return json.load(response)


for demo, first_type, update_type in [('waretwin', 'FULL', 'PATCH'), ('rftwin', 'snapshot', 'amr_patch')]:
    before = request(demo, '/api/health')
    endpoint = origin.replace('http://', 'ws://') + '/open-demo-api/' + demo + '/ws'
    with connect(endpoint, origin=origin, additional_headers={'Sec-Fetch-Site': 'same-origin'}, open_timeout=15) as socket:
        first = json.loads(socket.recv(timeout=15))
        assert first['type'] == first_type, first.get('type')
        assert len(first['state']['robots']) > 0
        received = {first_type}
        deadline = time.monotonic() + 8
        while update_type not in received and time.monotonic() < deadline:
            received.add(json.loads(socket.recv(timeout=8))['type'])
        assert update_type in received, received
    after = request(demo, '/api/health')
    if demo == 'waretwin':
        assert after['tick'] > before['tick']
        assert request(demo, '/api/state/validate')['valid']
        assert after['loop_errors'] == 0
    else:
        assert after['sim_time'] > before['sim_time']
        assert after['loop_errors'] == 0
        request(demo, '/api/simulation/pause', {})
        assert request(demo, '/api/simulation/control')['paused'] is True
        request(demo, '/api/simulation/start', {})
        assert request(demo, '/api/simulation/control')['paused'] is False
    print(f'{demo}: original health, advancing engine, {sorted(received)}, same-origin HTTP/WS proxy passed')
print('Backend protocol validation passed; visual/WebGL acceptance remains separate.')
